import type { FastifyInstance } from 'fastify';
import { listMarkets, getMarket } from '../services/markets.js';

export async function registerMarketsRoutes(app: FastifyInstance) {
  app.get('/markets', async () => {
    const markets = await listMarkets();
    return {
      markets: markets.map((market) => ({
        address: market.address,
        metadataURI: market.metadataURI,
        endTime: market.endTime,
        createdAt: market.createdAt,
        updatedAt: market.updatedAt,
        ordersCount: market._count.orders,
        fillsCount: market._count.fills,
      })),
    };
  });

  app.get('/markets/:address', async (request) => {
    const { address } = request.params as { address: string };
    const market = await getMarket(address);
    return {
      market: {
        address: market.address,
        metadataURI: market.metadataURI,
        endTime: market.endTime,
        createdAt: market.createdAt,
        updatedAt: market.updatedAt,
      },
    };
  });
}
