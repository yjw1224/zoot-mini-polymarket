import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listMarketTrades } from '../services/trades.js';

const listTradesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function registerTradesRoutes(app: FastifyInstance) {
  app.get('/markets/:address/trades', async (request, reply) => {
    const { address } = request.params as { address: string };
    const parsed = listTradesQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const limit = parsed.data.limit ?? 50;
    const trades = await listMarketTrades(address, limit);

    return {
      marketAddress: address,
      limit,
      count: trades.length,
      trades,
      updatedAt: new Date().toISOString(),
    };
  });
}
