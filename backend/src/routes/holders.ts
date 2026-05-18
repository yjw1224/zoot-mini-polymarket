import type { FastifyInstance } from 'fastify';
import { getHolderRankings } from '../services/holders.js';

export async function registerHoldersRoutes(app: FastifyInstance) {
    app.get('/markets/:address/holders', async (request) => {
        const { address } = request.params as { address: string };
        return getHolderRankings(address);
    });
}