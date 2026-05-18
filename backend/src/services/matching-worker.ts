import { createWalletClient, http, parseAbi, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { env } from '../env.js';
import { prisma } from './prisma.js';
import { publicClient, syncMarketsFromFactory } from './chain.js';
import { getCrossMatchPreview } from './matching.js';

// Minimal ABI for fillOrders
const marketAbi = parseAbi([
  'function fakeUSDCToken() view returns (address)',
  'function fillOrders((address maker,uint256 targetId,bool isBuy,uint256 price,uint256 amount,uint256 expiry,uint256 nonce)[] orders,bytes[] signatures,uint256[] fillAmounts)',
  'function balanceOf(address account,uint256 id) view returns (uint256)',
  'error OnlyAdmin()',
  'error MarketAlreadyResolved()',
  'error MarketAlreadyEnded()',
  'error MarketNotEndedYet()',
  'error MarketNotResolvedYet()',
  'error InvalidTokenId()',
  'error InvalidWinner()',
  'error AmountMustBeGreaterThanZero()',
  'error NoWinningTokens()',
  'error InvalidMaker()',
  'error InvalidPrice()',
  'error OrderExpired()',
  'error OrderCancelled()',
  'error InvalidSignature()',
  'error OrderFullyFilled()',
  'error FillExceedsRemainingAmount()',
  'error FillTooSmall()',
  'error ArrayLengthMismatch()',
  'error ERC1155InsufficientBalance(address sender,uint256 balance,uint256 needed,uint256 tokenId)',
  'error ERC1155InvalidSender(address sender)',
  'error ERC1155InvalidReceiver(address receiver)',
  'error ERC1155MissingApprovalForAll(address operator,address owner)',
  'error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InsufficientAllowance(address spender,uint256 allowance,uint256 needed)',
]);

const usdcAbi = parseAbi([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function faucet()',
]);

const PRICE_PER_SET = 1000000000000000000n;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function toOrderInput(o: any) {
  return {
    maker: o.maker as Address,
    targetId: BigInt(o.targetId),
    isBuy: Boolean(o.isBuy),
    price: BigInt(o.price),
    amount: BigInt(o.amount),
    expiry: BigInt(o.expiry ?? 0),
    nonce: BigInt(o.nonce ?? 0),
  };
}

async function loadOrder(orderHash: string, marketAddress: string) {
  return prisma.marketOrder.findFirst({ where: { orderHash, marketAddress } });
}

function estimateTakerUsdcRequirement(orders: any[], fillAmounts: bigint[]) {
  return orders.reduce((total, order, index) => {
    if (!order.isBuy) return total;

    const fillAmount = fillAmounts[index] ?? 0n;
    const takerPrice = PRICE_PER_SET - BigInt(order.price);
    return total + (fillAmount * takerPrice) / PRICE_PER_SET;
  }, 0n);
}

async function ensureMatcherUsdcReady(walletClient: any, marketAddress: string, requiredUsdcAmount: bigint) {
  if (requiredUsdcAmount <= 0n) return;

  const takerAddress = walletClient.account?.address as Address | undefined;
  if (!takerAddress) {
    throw new Error('Matcher wallet address is unavailable');
  }

  const fakeUsdcAddress = (await publicClient.readContract({
    address: marketAddress as Address,
    abi: marketAbi,
    functionName: 'fakeUSDCToken',
  })) as Address;

  const [allowance, balance] = await Promise.all([
    publicClient.readContract({
      address: fakeUsdcAddress,
      abi: usdcAbi,
      functionName: 'allowance',
      args: [takerAddress, marketAddress as Address],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: fakeUsdcAddress,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [takerAddress],
    }) as Promise<bigint>,
  ]);

  if (balance < requiredUsdcAmount) {
    const faucetHash = (await walletClient.writeContract({
      address: fakeUsdcAddress,
      abi: usdcAbi,
      functionName: 'faucet',
      args: [],
    })) as `0x${string}`;

    await publicClient.waitForTransactionReceipt({ hash: faucetHash });
  }

  if (allowance < requiredUsdcAmount) {
    const approveHash = (await walletClient.writeContract({
      address: fakeUsdcAddress,
      abi: usdcAbi,
      functionName: 'approve',
      args: [marketAddress as Address, requiredUsdcAmount],
    })) as `0x${string}`;

    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
}


async function syncFilledOrderState(tx: any, orderRow: any, nextFilledAmount: bigint) {
  const status = nextFilledAmount >= BigInt(orderRow.amount) ? 'FILLED' : 'OPEN';
  const baseData = {
    filledAmount: nextFilledAmount.toString(),
    status,
  };

  await tx.marketOrder.updateMany({
    where: { orderHash: orderRow.orderHash },
    data: baseData,
  });

  await tx.marketOrder.updateMany({
    where: {
      marketAddress: orderRow.marketAddress,
      linkedOrderHash: orderRow.orderHash,
    },
    data: baseData,
  });

  if (orderRow.linkedOrderHash) {
    await tx.marketOrder.updateMany({
      where: { orderHash: orderRow.linkedOrderHash },
      data: baseData,
    });
  }
}

async function persistOrderMetadata(tx: any, orderHash: string, data: Record<string, string>) {
  if (!Object.keys(data).length) return;

  await tx.marketOrder.updateMany({
    where: { orderHash },
    data,
  });
}

async function settleMatch(walletClient: any, marketAddress: string, targetId: number, match: any) {
  // load orders
  const [buyOrder, sellOrder] = await Promise.all([
    loadOrder(match.buyOrderHash, marketAddress),
    loadOrder(match.sellOrderHash, marketAddress),
  ]);

  if (!buyOrder || !sellOrder) return;
  if (buyOrder.status !== 'OPEN' || sellOrder.status !== 'OPEN') return;

  // 🚨 [추가] 자가 매칭 방지 로직 (Self-Trade Prevention)
  // 구매 주문 유저와 판매 주문 유저가 같으면 체결하지 않고 종료합니다.
  if (buyOrder.maker.toLowerCase() === sellOrder.maker.toLowerCase()) {
    console.warn(`[matching-worker] 자가 매칭 감지 방지: 유저 ${buyOrder.maker}가 본인의 주문과 매칭 시도됨. 스킵합니다.`);
    return;
  }

  // amount to fill (handled by matcher off-chain)
  const amount = BigInt(match.amount);

  // Prepare orders and signatures. If a system order lacks a valid signature
  // or has a system maker, sign it on-the-fly with MATCHER_PRIVATE_KEY.
  const orderTypes = {
    Order: [
      { name: 'maker', type: 'address' },
      { name: 'targetId', type: 'uint256' },
      { name: 'isBuy', type: 'bool' },
      { name: 'price', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
  } as const;

  const domain = {
    name: 'PredictionMarket',
    version: '1',
    chainId: env.CHAIN_ID,
    verifyingContract: marketAddress as Address,
  } as const;

  function isZeroSignature(sig?: string) {
    if (!sig) return true;
    return /^0x0+$/.test(sig.replace(/^0x/, ''));
  }

  let signerAccount: any = null;
  if (env.MATCHER_PRIVATE_KEY) {
    signerAccount = privateKeyToAccount(env.MATCHER_PRIVATE_KEY as `0x${string}`);
  }

  // Helper to get (possibly-signed) maker and signature for an order
  // orderObj is the DB row (buyOrder or sellOrder)
  async function prepareOrderForFill(orderObj: any) {
    let maker = orderObj.maker as string;
    let signature = orderObj.signature as string;

    const makerIsSystem = maker === '0x0000000000000000000000000000000000000000' || maker.toLowerCase() === (env.SYSTEM_MAKER_ADDRESS || '').toLowerCase();

    if (signerAccount && (isZeroSignature(signature) || makerIsSystem)) {
      const signerAddress = signerAccount.address;
      const message = {
        maker: signerAddress as Address,
        targetId: BigInt(orderObj.targetId),
        isBuy: Boolean(orderObj.isBuy),
        price: BigInt(orderObj.price),
        amount: BigInt(orderObj.amount),
        expiry: BigInt(orderObj.expiry ?? 0),
        nonce: BigInt(orderObj.nonce ?? 0),
      } as const;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - viem account has signTypedData
      signature = await signerAccount.signTypedData({ domain, types: orderTypes, primaryType: 'Order', message });
      maker = signerAddress;
    }

    const orderInput = toOrderInput({ maker, targetId: orderObj.targetId, isBuy: orderObj.isBuy, price: orderObj.price, amount: orderObj.amount, expiry: orderObj.expiry, nonce: orderObj.nonce });
    return { orderInput, signature };
  }

  const preparedSell = await prepareOrderForFill(sellOrder);
  const preparedBuy = await prepareOrderForFill(buyOrder);

  const orders = [preparedBuy.orderInput, preparedSell.orderInput];
  const signatures = [preparedBuy.signature, preparedSell.signature];
  const fillAmounts = [amount, amount];

  try {
    await ensureMatcherUsdcReady(walletClient, marketAddress, estimateTakerUsdcRequirement(orders, fillAmounts));
  } catch (err) {
    console.error('[matching-worker] matcher USDC setup failed', err, { marketAddress, match });
    return;
  }

  // send tx
  try {
    const txHash = (await walletClient.writeContract({
      address: marketAddress as Address,
      abi: marketAbi,
      functionName: 'fillOrders',
      args: [orders, signatures, fillAmounts],
    })) as `0x${string}`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // update DB (best-effort, keep types loose)
    await prisma.$transaction(async (tx: any) => {
      const nextSell = BigInt(sellOrder.filledAmount || 0) + amount;
      const nextBuy = BigInt(buyOrder.filledAmount || 0) + amount;

      // Update the matched row and its mirrored companion so both books stay in sync.
      await syncFilledOrderState(tx, sellOrder, nextSell);
      await syncFilledOrderState(tx, buyOrder, nextBuy);

      // Persist any on-the-fly signing changes only on the primary rows.
      await persistOrderMetadata(tx, sellOrder.orderHash, {
        ...(preparedSell.signature && preparedSell.signature !== sellOrder.signature ? { signature: preparedSell.signature } : {}),
        ...(preparedSell.orderInput.maker && preparedSell.orderInput.maker !== sellOrder.maker ? { maker: preparedSell.orderInput.maker } : {}),
      });

      await persistOrderMetadata(tx, buyOrder.orderHash, {
        ...(preparedBuy.signature && preparedBuy.signature !== buyOrder.signature ? { signature: preparedBuy.signature } : {}),
        ...(preparedBuy.orderInput.maker && preparedBuy.orderInput.maker !== buyOrder.maker ? { maker: preparedBuy.orderInput.maker } : {}),
      });

      await tx.tradeFill.create({
        data: {
          marketAddress,
          orderHash: txHash,
          maker: preparedBuy.orderInput.maker,
          taker: preparedSell.orderInput.maker,
          targetId,
          isBuy: true,
          price: match.executionPrice,
          amount: amount.toString(),
          usdcAmount: ((amount * BigInt(match.executionPrice)) / 10n ** 18n).toString(),
          txHash,
          blockNumber: Number(receipt.blockNumber),
        }
      });
    });
  } catch (err) {
    console.error('[matching-worker] settle error', err, { marketAddress, match });
  }
}

async function runOnce() {
  if (!env.MATCHER_PRIVATE_KEY) {
    console.warn('[matching-worker] MATCHER_PRIVATE_KEY not set; skipping');
    return;
  }

  const account = privateKeyToAccount(env.MATCHER_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(env.RPC_URL) });

  const markets = await syncMarketsFromFactory();
  for (const m of markets) {
    const preview = await getCrossMatchPreview(m.address);
    if (!preview?.matches?.length) {
      continue;
    }

    for (const match of preview.matches) {
      await settleMatch(walletClient, m.address, match.buyTargetId, match);
    }
  }
}

export function startMatchingWorker() {
  if (timer) return () => stopMatchingWorker();
  running = true;
  void runOnce().finally(() => { running = false; });
  timer = setInterval(() => { if (running) return; running = true; void runOnce().finally(() => { running = false; }); }, Number(env.MATCH_INTERVAL_MS || 15000));
  return () => stopMatchingWorker();
}

export function stopMatchingWorker() {
  if (timer) { clearInterval(timer); timer = null; }
}

export default { startMatchingWorker, stopMatchingWorker };
