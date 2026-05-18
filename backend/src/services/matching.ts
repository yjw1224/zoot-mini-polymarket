import { prisma } from './prisma.js';
import { ensureMarketFromChain } from './chain.js';

const PRICE_PER_SET = 1000000000000000000n;

type Side = 0 | 1;

export type MatchPreview = {
  marketAddress: string;
  targetId: Side;
  matches: Array<{
    amount: string;
    executionPrice: string;
    buyOrderHash: string;
    sellOrderHash: string;
    buyMaker: string;
    sellMaker: string;
    buyPrice: string;
    sellPrice: string;
    buyCreatedAt: string;
    sellCreatedAt: string;
  }>;
  totalMatchedAmount: string;
  bestBid: string | null;
  bestAsk: string | null;
  updatedAt: string;
};

export type CrossMatchPreview = {
  marketAddress: string;
  matches: Array<{
    amount: string;
    executionPrice: string;
    buyOrderHash: string;
    sellOrderHash: string;
    buyMaker: string;
    sellMaker: string;
    buyPrice: string;
    sellPrice: string;
    buyTargetId: Side;
    sellTargetId: Side;
    buyCreatedAt: string;
    sellCreatedAt: string;
  }>;
  totalMatchedAmount: string;
  updatedAt: string;
};

const orderTable = prisma as any;

function nowSeconds() {
  return BigInt(Math.floor(Date.now() / 1000));
}

async function expireOrders(marketAddress: string, targetId: Side) {
  await (orderTable.marketOrder as any).updateMany({
    where: {
      marketAddress,
      targetId,
      status: 'OPEN',
      expiry: { lte: nowSeconds() },
    },
    data: {
      status: 'EXPIRED',
    },
  });
}

function remainingAmount(order: { amount: string; filledAmount: string }) {
  return BigInt(order.amount) - BigInt(order.filledAmount);
}

function sortBuys<T extends { price: string; createdAt: Date; orderHash: string }>(orders: T[]) {
  return [...orders].sort((left, right) => {
    if (BigInt(left.price) !== BigInt(right.price)) {
      return BigInt(left.price) > BigInt(right.price) ? -1 : 1;
    }
    if (left.createdAt.getTime() !== right.createdAt.getTime()) {
      return left.createdAt.getTime() < right.createdAt.getTime() ? -1 : 1;
    }
    return left.orderHash.localeCompare(right.orderHash);
  });
}

function sortSells<T extends { price: string; createdAt: Date; orderHash: string }>(orders: T[]) {
  return [...orders].sort((left, right) => {
    if (BigInt(left.price) !== BigInt(right.price)) {
      return BigInt(left.price) < BigInt(right.price) ? -1 : 1;
    }
    if (left.createdAt.getTime() !== right.createdAt.getTime()) {
      return left.createdAt.getTime() < right.createdAt.getTime() ? -1 : 1;
    }
    return left.orderHash.localeCompare(right.orderHash);
  });
}

type OpenOrder = {
  orderHash: string;
  maker: string;
  targetId: Side;
  isBuy: boolean;
  price: string;
  amount: string;
  filledAmount: string;
  createdAt: Date;
};

type CanonicalOrder = OpenOrder & {
  canonicalIsBuy: boolean;
  canonicalPrice: string;
};

type MatchEngineResult<TMatch> = {
  matches: TMatch[];
  totalMatchedAmount: bigint;
};

async function loadOpenOrders(marketAddress: string, targetIds?: Side[]): Promise<OpenOrder[]> {
  return (orderTable.marketOrder as any).findMany({
    where: {
      marketAddress,
      status: 'OPEN',
      ...(targetIds && targetIds.length ? { targetId: { in: targetIds } } : {}),
    },
    orderBy: [{ createdAt: 'asc' }],
  });
}

function normalizeToYesBook(order: OpenOrder): CanonicalOrder {
  if (order.targetId === 0) {
    return {
      ...order,
      canonicalIsBuy: order.isBuy,
      canonicalPrice: order.price,
    };
  }

  return {
    ...order,
    canonicalIsBuy: !order.isBuy,
    canonicalPrice: (PRICE_PER_SET - BigInt(order.price)).toString(),
  };
}

function sortCanonicalBuys<T extends { canonicalPrice: string; createdAt: Date; orderHash: string }>(orders: T[]) {
  return [...orders].sort((left, right) => {
    if (BigInt(left.canonicalPrice) !== BigInt(right.canonicalPrice)) {
      return BigInt(left.canonicalPrice) > BigInt(right.canonicalPrice) ? -1 : 1;
    }
    if (left.createdAt.getTime() !== right.createdAt.getTime()) {
      return left.createdAt.getTime() < right.createdAt.getTime() ? -1 : 1;
    }
    return left.orderHash.localeCompare(right.orderHash);
  });
}

function sortCanonicalSells<T extends { canonicalPrice: string; createdAt: Date; orderHash: string }>(orders: T[]) {
  return [...orders].sort((left, right) => {
    if (BigInt(left.canonicalPrice) !== BigInt(right.canonicalPrice)) {
      return BigInt(left.canonicalPrice) < BigInt(right.canonicalPrice) ? -1 : 1;
    }
    if (left.createdAt.getTime() !== right.createdAt.getTime()) {
      return left.createdAt.getTime() < right.createdAt.getTime() ? -1 : 1;
    }
    return left.orderHash.localeCompare(right.orderHash);
  });
}

function runMatchEngine<TOrder extends { amount: string; filledAmount: string; createdAt: Date; orderHash: string }, TMatch>(params: {
  buys: TOrder[];
  sells: TOrder[];
  canMatch: (buy: TOrder, sell: TOrder) => boolean;
  executionPriceFor: (buy: TOrder, sell: TOrder) => string;
  buildMatch: (buy: TOrder, sell: TOrder, matchedAmount: bigint, executionPrice: string) => TMatch;
}): MatchEngineResult<TMatch> {
  const buys = [...params.buys];
  const sells = [...params.sells];

  const matches: TMatch[] = [];
  let totalMatchedAmount = 0n;
  let buyIndex = 0;
  let sellIndex = 0;

  while (buyIndex < buys.length && sellIndex < sells.length) {
    const buy = buys[buyIndex];
    const sell = sells[sellIndex];

    if (!params.canMatch(buy, sell)) {
      break;
    }

    const buyRemaining = remainingAmount(buy);
    const sellRemaining = remainingAmount(sell);
    const matchedAmount = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
    const executionPrice = params.executionPriceFor(buy, sell);

    matches.push(params.buildMatch(buy, sell, matchedAmount, executionPrice));
    totalMatchedAmount += matchedAmount;

    if (buyRemaining === matchedAmount) {
      buyIndex += 1;
    } else {
      buys[buyIndex] = { ...buy, filledAmount: (BigInt(buy.filledAmount) + matchedAmount).toString() };
    }

    if (sellRemaining === matchedAmount) {
      sellIndex += 1;
    } else {
      sells[sellIndex] = { ...sell, filledAmount: (BigInt(sell.filledAmount) + matchedAmount).toString() };
    }
  }

  return { matches, totalMatchedAmount };
}

export async function getMatchPreview(marketAddress: string, targetId: Side): Promise<MatchPreview> {
  await ensureMarketFromChain(marketAddress);
  await expireOrders(marketAddress, targetId);

  const openOrders = await loadOpenOrders(marketAddress, [targetId]);

  const buys = sortBuys(openOrders.filter((order) => order.isBuy));
  const sells = sortSells(openOrders.filter((order) => !order.isBuy));
  const bestBid = buys[0]?.price ?? null;
  const bestAsk = sells[0]?.price ?? null;

  const { matches, totalMatchedAmount } = runMatchEngine<OpenOrder, MatchPreview['matches'][number]>({
    buys,
    sells,
    canMatch: (buy, sell) => BigInt(buy.price) >= BigInt(sell.price),
    executionPriceFor: (buy, sell) => (buy.createdAt.getTime() <= sell.createdAt.getTime() ? buy.price : sell.price),
    buildMatch: (buy, sell, matchedAmount, executionPrice) => ({
      amount: matchedAmount.toString(),
      executionPrice,
      buyOrderHash: buy.orderHash,
      sellOrderHash: sell.orderHash,
      buyMaker: buy.maker,
      sellMaker: sell.maker,
      buyPrice: buy.price,
      sellPrice: sell.price,
      buyCreatedAt: buy.createdAt.toISOString(),
      sellCreatedAt: sell.createdAt.toISOString(),
    }),
  });

  return {
    marketAddress,
    targetId,
    matches,
    totalMatchedAmount: totalMatchedAmount.toString(),
    bestBid,
    bestAsk,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCrossMatchPreview(marketAddress: string): Promise<CrossMatchPreview> {
  await ensureMarketFromChain(marketAddress);
  await Promise.all([expireOrders(marketAddress, 0), expireOrders(marketAddress, 1)]);

  const openOrders = await loadOpenOrders(marketAddress, [0, 1]);
  const canonicalOrders = openOrders.map(normalizeToYesBook);

  const buys = sortCanonicalBuys(canonicalOrders.filter((order) => order.canonicalIsBuy));
  const sells = sortCanonicalSells(canonicalOrders.filter((order) => !order.canonicalIsBuy));

  const { matches, totalMatchedAmount } = runMatchEngine<CanonicalOrder, CrossMatchPreview['matches'][number]>({
    buys,
    sells,
    canMatch: (buy, sell) => BigInt(buy.canonicalPrice) >= BigInt(sell.canonicalPrice),
    executionPriceFor: (buy, sell) => (buy.createdAt.getTime() <= sell.createdAt.getTime() ? buy.canonicalPrice : sell.canonicalPrice),
    buildMatch: (buy, sell, matchedAmount, executionPrice) => ({
      amount: matchedAmount.toString(),
      executionPrice,
      buyOrderHash: buy.orderHash,
      sellOrderHash: sell.orderHash,
      buyMaker: buy.maker,
      sellMaker: sell.maker,
      buyPrice: buy.price,
      sellPrice: sell.price,
      buyTargetId: buy.targetId,
      sellTargetId: sell.targetId,
      buyCreatedAt: buy.createdAt.toISOString(),
      sellCreatedAt: sell.createdAt.toISOString(),
    }),
  });

  return {
    marketAddress,
    matches,
    totalMatchedAmount: totalMatchedAmount.toString(),
    updatedAt: new Date().toISOString(),
  };
}
