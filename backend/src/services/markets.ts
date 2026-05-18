import { prisma } from './prisma.js';
import { syncMarketsFromFactory, ensureMarketFromChain } from './chain.js';

export async function listMarkets() {
  await syncMarketsFromFactory();
  return prisma.market.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          orders: true,
          fills: true,
        },
      },
    },
  });
}

export async function getMarket(address: string) {
  return ensureMarketFromChain(address);
}
