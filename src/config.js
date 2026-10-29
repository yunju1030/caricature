import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const provider = process.env.IMAGE_PROVIDER || 'openai';
if (!['demo', 'openai'].includes(provider)) throw new Error('IMAGE_PROVIDER must be demo or openai.');

export const config = Object.freeze({
  port,
  host: process.env.HOST || '127.0.0.1',
  provider,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  imageModel: 'gpt-image-2.5-sunburst',
  imageTimeoutMs: 180_000,
  maxUploadBytes: 4 * 1024 * 1024,
  maxPixels: 40_000_000,
});
