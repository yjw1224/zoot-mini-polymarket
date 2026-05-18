import { hashTypedData, recoverTypedDataAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from '../env.js';
import { prisma } from './prisma.js';
import { ensureMarketFromChain } from './chain.js';

const orderTable = prisma as any;

const PRICE_PER_SET = 1000000000000000000n;
const SYSTEM_MAKER_ADDRESS = env.SYSTEM_MAKER_ADDRESS;

export type MarketOrderInput = {
  maker: string;
  targetId: 0 | 1;
  isBuy: boolean;
  price: string;
  amount: string;
  expiry: bigint;
  nonce: bigint;
  signature: string;
};

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

function toBigIntString(value: string | bigint | number) {
  return BigInt(value).toString();
}

function nowSeconds() {
  return BigInt(Math.floor(Date.now() / 1000));
}

function getDomain(marketAddress: string) {
  return {
    name: 'PredictionMarket',
    version: '1',
    chainId: env.CHAIN_ID,
    verifyingContract: marketAddress as Address,
  } as const;
}

function serializeOrder(order: MarketOrderInput) {
  return {
    maker: order.maker as Address,
    targetId: BigInt(order.targetId),
    isBuy: order.isBuy,
    price: BigInt(order.price),
    amount: BigInt(order.amount),
    expiry: order.expiry,
    nonce: order.nonce,
  } as const;
}

function getComplementaryPrice(price: string): string {
  const priceWei = BigInt(price);
  return (PRICE_PER_SET - priceWei).toString();
}

function createComplementaryOrder(input: MarketOrderInput) {
  return {
    maker: SYSTEM_MAKER_ADDRESS as Address,
    // complementary order uses the opposite outcome token.
    // YES bid(p) pairs with NO ask(1-p), and vice versa.
    targetId: BigInt(input.targetId === 0 ? 1 : 0),
    isBuy: !input.isBuy,
    price: BigInt(getComplementaryPrice(input.price)),
    amount: BigInt(input.amount),
    expiry: input.expiry,
    nonce: input.nonce,
  } as const;
}

export async function createOrder(marketAddress: string, input: MarketOrderInput) {
  await ensureMarketFromChain(marketAddress);

  const message = serializeOrder(input);
  const domain = getDomain(marketAddress);
  const recovered = await recoverTypedDataAddress({
    domain,
    types: orderTypes,
    primaryType: 'Order',
    message,
    signature: input.signature as `0x${string}`,
  });

  if (recovered.toLowerCase() !== input.maker.toLowerCase()) {
    throw new Error('Invalid signature');
  }

  const orderHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: 'Order',
    message,
  });

  // 사용자 주문 생성
  const order = await (orderTable.marketOrder as any).upsert({
    where: { orderHash },
    create: {
      marketAddress: marketAddress as Address,
      orderHash,
      maker: input.maker,
      targetId: input.targetId,
      isBuy: input.isBuy,
      price: toBigIntString(input.price),
      amount: toBigIntString(input.amount),
      filledAmount: '0',
      expiry: input.expiry,
      nonce: input.nonce,
      signature: input.signature,
      status: 'OPEN',
      isSystemGenerated: false,
    },
    update: {
      signature: input.signature,
      status: 'OPEN',
    },
  });

  // 반대편 자동 주문 생성
  const complementaryMsg = createComplementaryOrder(input);

  // If MATCHER_PRIVATE_KEY is provided, use it to sign the complementary order
  // and set the maker to the matcher's address. Otherwise ensure SYSTEM_MAKER_ADDRESS
  // is set to a non-zero address (otherwise contract will reject orders with maker==0).
  let complementaryMaker = SYSTEM_MAKER_ADDRESS;
  let complementarySignature = '0x' + '0'.repeat(130);
  let complementaryMsgToHash: any = complementaryMsg;

  if (!env.MATCHER_PRIVATE_KEY && complementaryMaker === '0x0000000000000000000000000000000000000000') {
    throw new Error('SYSTEM_MAKER_ADDRESS is not set and MATCHER_PRIVATE_KEY not provided; cannot create system order with 0x0 maker');
  }

  if (env.MATCHER_PRIVATE_KEY) {
    const account = privateKeyToAccount(env.MATCHER_PRIVATE_KEY as `0x${string}`);
    const signerAddress = account.address;
    complementaryMaker = signerAddress;

    // build message matching the signed maker
    const complementaryMsgWithSigner = {
      maker: signerAddress as Address,
      targetId: BigInt(input.targetId === 0 ? 1 : 0),
      isBuy: !input.isBuy,
      price: BigInt(getComplementaryPrice(input.price)),
      amount: BigInt(input.amount),
      expiry: input.expiry,
      nonce: input.nonce,
    } as const;

    // sign typed data (EIP-712)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - viem account has signTypedData
    complementarySignature = await account.signTypedData({ domain, types: orderTypes, primaryType: 'Order', message: complementaryMsgWithSigner });
    complementaryMsgToHash = complementaryMsgWithSigner;
  }

  const complementaryHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: 'Order',
    message: complementaryMsgToHash,
  });

  await (orderTable.marketOrder as any).upsert({
    where: { orderHash: complementaryHash },
    create: {
      marketAddress: marketAddress as Address,
      orderHash: complementaryHash,
      maker: complementaryMaker,
      targetId: input.targetId === 0 ? 1 : 0,
      isBuy: !input.isBuy,
      price: getComplementaryPrice(input.price),
      amount: toBigIntString(input.amount),
      filledAmount: '0',
      expiry: input.expiry,
      nonce: input.nonce,
      signature: complementarySignature,
      status: 'OPEN',
      isSystemGenerated: true,
      linkedOrderHash: orderHash,
    },
    update: {
      status: 'OPEN',
    },
  });

  return order;
}

async function expireOrders(marketAddress: string, targetId?: 0 | 1) {
  const expiredBefore = nowSeconds();
  await (orderTable.marketOrder as any).updateMany({
    where: {
      marketAddress,
      status: 'OPEN',
      expiry: { lte: expiredBefore },
      ...(targetId === undefined ? {} : { targetId }),
    },
    data: {
      status: 'EXPIRED',
    },
  });
}

function aggregateLevels(orders: Array<{ price: string; amount: string; id: string }>) {
  // group by price using plain object for slightly better performance
  const map: Record<string, { price: string; amount: bigint; orderCount: number }> = {};
  for (const o of orders) {
    const p = o.price;
    const entry = map[p];
    if (entry) {
      entry.amount += BigInt(o.amount);
      entry.orderCount += 1;
    } else {
      map[p] = { price: p, amount: BigInt(o.amount), orderCount: 1 };
    }
  }

  return Object.values(map)
    .sort((a, b) => (BigInt(a.price) === BigInt(b.price) ? 0 : BigInt(a.price) > BigInt(b.price) ? -1 : 1))
    .map((l) => ({ price: l.price, amount: l.amount.toString(), orderCount: l.orderCount }));
}

async function loadSideBook(marketAddress: string, targetId: 0 | 1) {
  await expireOrders(marketAddress, targetId);

  const openOrders: Array<{ id: string; price: string; amount: string; filledAmount: string; isBuy: boolean }> = await (orderTable.marketOrder as any).findMany({
    where: {
      marketAddress,
      targetId,
      status: 'OPEN',
    },
    orderBy: [{ price: 'desc' }, { createdAt: 'asc' }],
  });

  const activeOrders = openOrders.map((order) => ({
    id: order.id,
    price: order.price,
    amount: (BigInt(order.amount) - BigInt(order.filledAmount)).toString(),
    isBuy: order.isBuy,
  }));

  const bids = aggregateLevels(activeOrders.filter((order) => order.isBuy));

  const asks = aggregateLevels(activeOrders.filter((order) => !order.isBuy)).sort((left, right) => (BigInt(left.price) === BigInt(right.price) ? 0 : BigInt(left.price) < BigInt(right.price) ? -1 : 1));

  return {
    targetId,
    bids,
    asks,
  };
}

export async function getOrderbookSnapshot(marketAddress: string) {
  await ensureMarketFromChain(marketAddress);
  return {
    marketAddress,
    yes: await loadSideBook(marketAddress, 0),
    no: await loadSideBook(marketAddress, 1),
    updatedAt: new Date().toISOString(),
  };
}

export async function getOrderbookSide(marketAddress: string, targetId: 0 | 1) {
  await ensureMarketFromChain(marketAddress);
  return {
    marketAddress,
    ...(await loadSideBook(marketAddress, targetId)),
    updatedAt: new Date().toISOString(),
  };
}

async function cancelOrderAndMirror(orderRow: any) {
  await (orderTable.marketOrder as any).updateMany({
    where: { orderHash: orderRow.orderHash },
    data: { status: 'CANCELLED' },
  });

  await (orderTable.marketOrder as any).updateMany({
    where: {
      marketAddress: orderRow.marketAddress,
      linkedOrderHash: orderRow.orderHash,
    },
    data: { status: 'CANCELLED' },
  });

  if (orderRow.linkedOrderHash) {
    await (orderTable.marketOrder as any).updateMany({
      where: { orderHash: orderRow.linkedOrderHash },
      data: { status: 'CANCELLED' },
    });
  }
}

export async function listOrders(marketAddress: string, targetId?: 0 | 1, status?: string) {
  const where = {
    marketAddress,
    ...(targetId === undefined ? {} : { targetId }),
    ...(status ? { status: status as 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED' } : {}),
  };

  return (orderTable.marketOrder as any).findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function cancelOrder(orderHash: string) {
  const order = await (orderTable.marketOrder as any).findUnique({ where: { orderHash } });
  if (!order) return null;

  await cancelOrderAndMirror(order);
  return order;
}
