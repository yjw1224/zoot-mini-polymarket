import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cancelOrder, createOrder, getOrderbookSide, getOrderbookSnapshot, listOrders } from '../services/orderbook.js';

const targetIdSchema = z.union([z.literal(0), z.literal(1), z.literal('0'), z.literal('1')]).transform((value) => Number(value) as 0 | 1);

const createOrderSchema = z.object({
  maker: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  targetId: targetIdSchema,
  isBuy: z.boolean(),
  price: z.string().regex(/^\d+$/),
  amount: z.string().regex(/^\d+$/),
  expiry: z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigInt(value)),
  nonce: z.union([z.string(), z.number(), z.bigint()]).transform((value) => BigInt(value)),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

export async function registerOrderbookRoutes(app: FastifyInstance) {
  app.get('/markets/:address/orderbook', async (request) => {
    const { address } = request.params as { address: string };
    return getOrderbookSnapshot(address);
  });

  app.get('/markets/:address/orderbook/:targetId', async (request, reply) => {
    const { address, targetId } = request.params as { address: string; targetId: string };
    const parsedTargetId = targetIdSchema.safeParse(targetId);

    if (!parsedTargetId.success) {
      return reply.code(400).send({ error: 'targetId must be 0 or 1' });
    }

    return getOrderbookSide(address, parsedTargetId.data);
  });

  app.get('/markets/:address/orders', async (request, reply) => {
    const { address } = request.params as { address: string };
    const query = request.query as { targetId?: string; status?: string };
    const parsedTargetId = query.targetId !== undefined ? targetIdSchema.safeParse(query.targetId) : null;

    if (parsedTargetId && !parsedTargetId.success) {
      return reply.code(400).send({ error: 'targetId must be 0 or 1' });
    }

    const targetId = parsedTargetId?.success ? parsedTargetId.data : undefined;
    const orders = await listOrders(address, targetId, query.status);

    // Serialize BigInt fields (expiry, nonce) to strings for JSON
    const serializable = orders.map((o: any) => ({
      ...o,
      expiry: typeof o.expiry === 'bigint' ? o.expiry.toString() : o.expiry,
      nonce: typeof o.nonce === 'bigint' ? o.nonce.toString() : o.nonce,
    }));

    return {
      marketAddress: address,
      orders: serializable,
    };
  });

  app.post('/markets/:address/orders', async (request, reply) => {
    const { address } = request.params as { address: string };
    const parsed = createOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const order = await createOrder(address, parsed.data);
      const serializable = {
        ...order,
        expiry: typeof (order as any).expiry === 'bigint' ? (order as any).expiry.toString() : (order as any).expiry,
        nonce: typeof (order as any).nonce === 'bigint' ? (order as any).nonce.toString() : (order as any).nonce,
      } as any;

      return reply.code(201).send({ order: serializable });
    } catch (err) {
      // Log full error server-side for debugging
      // and return clearer client response for common issues
      // (invalid signature, chain RPC issues, etc.)
      // eslint-disable-next-line no-console
      console.error('createOrder error:', err);
      const message = (err as any)?.message ?? 'Unknown error';
      if (message === 'Invalid signature') {
        return reply.code(400).send({ error: message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  app.delete('/markets/:address/orders/:orderHash', async (request) => {
    const { orderHash } = request.params as { orderHash: string };
    const order = await cancelOrder(orderHash);
    return { order };
  });
}
