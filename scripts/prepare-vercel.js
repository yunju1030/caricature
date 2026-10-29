import { cp, mkdir } from 'node:fs/promises';
// Vercel serves public/ over its CDN; express.static is for local development.
const source = new URL('../dist/', import.meta.url);
const destination = new URL('../public/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log('Frontend copied to public/ for Vercel.');
