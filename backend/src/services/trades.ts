import { prisma } from './prisma.js';
import { ensureMarketFromChain } from './chain.js';

export type RecentTrade = {
  marketAddress: string;
  orderHash: string;
  maker: string;
  taker: string;
  targetId: 0 | 1;
  isBuy: boolean;
  price: string;
  amount: string;
  usdcAmount: string;
  txHash: string;
  blockNumber: number;
  createdAt: string;
};

function normalizeTake(take?: number) {
  const fallback = 50;
  if (!Number.isFinite(take)) return fallback;
  const parsed = Number(take);
  if (parsed < 1) return 1;
  if (parsed > 200) return 200;
  return Math.trunc(parsed);
}

function toRecentTrade(row: any): RecentTrade {
  return {
    marketAddress: row.marketAddress,
    orderHash: row.orderHash,
    maker: row.maker,
    taker: row.taker,
    targetId: Number(row.targetId) as 0 | 1,
    isBuy: Boolean(row.isBuy),
    price: String(row.price),
    amount: String(row.amount),
    usdcAmount: String(row.usdcAmount),
    txHash: row.txHash,
    blockNumber: Number(row.blockNumber),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export async function listMarketTrades(marketAddress: string, take = 50): Promise<RecentTrade[]> {
  await ensureMarketFromChain(marketAddress);

  const safeTake = normalizeTake(take);
  const tradeTable = prisma as any;

  const rows = await tradeTable.tradeFill.findMany({
    where: { marketAddress },
    orderBy: { createdAt: 'desc' },
    take: safeTake,
  });

  return rows.map(toRecentTrade);
}
