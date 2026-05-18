import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCrossMatchPreview, getMatchPreview } from '../services/matching.js';

const targetIdSchema = z.union([z.literal(0), z.literal(1), z.literal('0'), z.literal('1')]).transform((value) => Number(value) as 0 | 1);

export async function registerMatchingRoutes(app: FastifyInstance) {
  app.get('/markets/:address/matches', async (request) => {
    const { address } = request.params as { address: string };
    const [yes, no, cross] = await Promise.all([
      getMatchPreview(address, 0),
      getMatchPreview(address, 1),
      getCrossMatchPreview(address),
    ]);

    return {
      marketAddress: address,
      yes,
      no,
      cross,
      updatedAt: new Date().toISOString(),
    };
  });

  app.get('/markets/:address/matches/:targetId', async (request, reply) => {
    const { address, targetId } = request.params as { address: string; targetId: string };
    const parsedTargetId = targetIdSchema.safeParse(targetId);

    if (!parsedTargetId.success) {
      return reply.code(400).send({ error: 'targetId must be 0 or 1' });
    }

    return getMatchPreview(address, parsedTargetId.data);
  });
}
