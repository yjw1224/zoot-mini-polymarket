import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  FACTORY_ADDRESS: z.string().startsWith('0x'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('https://silver-enigma-pqvv995g455f6j6-5173.app.github.dev'),
  INDEX_START_BLOCK: z.coerce.number().int().nonnegative().default(0),
  SYSTEM_MAKER_ADDRESS: z.string().startsWith('0x').default('0x0000000000000000000000000000000000000000'),
  MATCHER_PRIVATE_KEY: z.string().default(''),
  MATCH_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
});

export const env = envSchema.parse(process.env);
