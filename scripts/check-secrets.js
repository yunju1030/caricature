import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { config } from '../src/config.js';

const root = new URL('../', import.meta.url);
const key = dotenv.parse(readFileSync(new URL('.env', root), 'utf8')).OPENAI_API_KEY;
if (!key) throw new Error('No API key found in project .env.');
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) visit(path);
    else files.push(path);
  }
}
for (const folder of ['dist/', 'public/', 'src/', 'scripts/', 'test/']) {
  const path = new URL(folder, root);
  if (existsSync(path)) visit(path);
}
files.push(new URL('.env.example', root), new URL('README.md', root));
if (files.some(path => readFileSync(path).includes(Buffer.from(key)))) throw new Error('API key found outside the private .env file.');
const trackedEnv = execFileSync('git', ['ls-files', '.env', '.env.*'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => path && path !== '.env.example');
if (trackedEnv.length) throw new Error('A private .env file is tracked by Git.');
execFileSync('git', ['check-ignore', '--quiet', '.env'], { cwd: root });
console.log(JSON.stringify({ publicFilesContainKey: false, privateEnvTracked: false, privateEnvIgnored: true, configuredKeyMatchesProjectEnv: config.openaiApiKey === key, provider:config.provider }));
