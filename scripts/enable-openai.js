// Update only provider selection. Never print or replace the existing API key.
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';

const path = new URL('../.env', import.meta.url);
const previous = readFileSync(path, 'utf8');
const key = dotenv.parse(previous).OPENAI_API_KEY;
if (!key?.trim()) throw new Error('OPENAI_API_KEY is missing from .env. No changes were made.');
const pattern = /^(?:export\s+)?IMAGE_PROVIDER\s*=[^\r\n]*/gm;
const next = pattern.test(previous)
  ? previous.replace(pattern, 'IMAGE_PROVIDER=openai')
  : previous + (previous.endsWith('\n') ? '' : '\n') + 'IMAGE_PROVIDER=openai\n';
assert.equal(dotenv.parse(next).OPENAI_API_KEY, key, 'API key preservation check failed');
if (next !== previous) writeFileSync(path, next, 'utf8');
assert.equal(dotenv.parse(readFileSync(path, 'utf8')).OPENAI_API_KEY, key, 'API key preservation check failed');
console.log('OpenAI mode enabled. Existing API key preserved.');
