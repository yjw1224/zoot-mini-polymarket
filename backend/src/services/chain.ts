import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { env } from '../env.js';
import { prisma } from './prisma.js';

const factoryAbi = parseAbi([
  'function allMarketsLength() view returns (uint256)',
  'function getMarket(uint256 index) view returns (address)',
]);

const marketAbi = parseAbi([
  'function metadataURI() view returns (string)',
  'function endTime() view returns (uint256)',
]);

export const publicClient = createPublicClient({
  transport: http(env.RPC_URL),
});

export async function syncMarketFromChain(address: string) {
  const marketAddress = address as Address;
  const [metadataURI, endTime] = await Promise.all([
    publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: 'metadataURI',
    }),
    publicClient.readContract({
      address: marketAddress,
      abi: marketAbi,
      functionName: 'endTime',
    }),
  ]);

  return prisma.market.upsert({
    where: { address: marketAddress },
    create: {
      address: marketAddress,
      metadataURI,
      endTime,
    },
    update: {
      metadataURI,
      endTime,
    },
  });
}

export async function syncMarketsFromFactory() {
  const totalMarkets = Number(
    await publicClient.readContract({
      address: env.FACTORY_ADDRESS as Address,
      abi: factoryAbi,
      functionName: 'allMarketsLength',
    }),
  );

  const markets: Array<{ address: string; metadataURI: string; endTime: bigint }> = [];

  for (let index = 0; index < totalMarkets; index += 1) {
    const marketAddress = (await publicClient.readContract({
      address: env.FACTORY_ADDRESS as Address,
      abi: factoryAbi,
      functionName: 'getMarket',
      args: [BigInt(index)],
    })) as Address;

    const synced = await syncMarketFromChain(marketAddress);
    markets.push({
      address: synced.address,
      metadataURI: synced.metadataURI ?? '',
      endTime: synced.endTime ?? 0n,
    });
  }

  return markets;
}

export async function ensureMarketFromChain(address: string) {
  const marketAddress = address as Address;
  const existing = await prisma.market.findUnique({ where: { address: marketAddress } });
  if (existing) {
    return existing;
  }

  return syncMarketFromChain(marketAddress);
}
