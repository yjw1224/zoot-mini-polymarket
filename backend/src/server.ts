import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { prisma } from './services/prisma.js';
import { registerMarketsRoutes } from './routes/markets.js';
import { registerOrderbookRoutes } from './routes/orderbook.js';
import { registerMatchingRoutes } from './routes/matching.js';
import { registerTradesRoutes } from './routes/trades.js';
import { startMatchingWorker } from './services/matching-worker.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(registerMarketsRoutes);
  await app.register(registerOrderbookRoutes);
  await app.register(registerMatchingRoutes);
  await app.register(registerTradesRoutes);
  const stopWorker = startMatchingWorker();

  app.addHook('onClose', async () => {
    stopWorker();
    await prisma.$disconnect();
  });

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
