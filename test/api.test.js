import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#b98765' } }).png().toBuffer();
const app = createApp({ provider: 'demo', openaiApiKey: 'must-not-leak' });
const send = (target = app, style = 'caricature', bytes = image, type = 'image/png') => request(target).post('/api/transform').field('style', style).attach('image', bytes, { filename: 'portrait.png', contentType: type });

test('serves frontend and public configuration without secrets', async () => {
  await request(app).get('/').expect(200).expect('Content-Type', /html/);
  await request(app).get('/api/health').expect(200, { status: 'ok' });
  const result = await request(app).get('/api/config').expect(200);
  assert.equal(result.body.maxUploadBytes, 4 * 1024 * 1024);
  assert.ok(!JSON.stringify(result.body).includes('must-not-leak'));
  for (const path of ['/.env', '/src/config.js', '/package.json']) await request(app).get(path).expect(404);
});
test('all styles return valid transformed JPEG bytes and demo metadata', async () => {
  const results = [];
  for (const style of ['caricature', 'animation', 'poster']) {
    const response = await send(app, style).expect(200).expect('Content-Type', /image\/jpeg/).expect('X-Transform-Mode', 'demo').expect('Cache-Control', 'no-store');
    const metadata = await sharp(response.body).metadata();
    assert.equal(metadata.width, 30);
    assert.equal(metadata.height, 20);
    assert.equal(metadata.format, 'jpeg');
    results.push(response.body);
  }
  assert.ok(!results[0].equals(results[1]));
  assert.ok(!results[1].equals(results[2]));
});
test('rejects missing image, invalid style and unexpected upload fields', async () => {
  await request(app).post('/api/transform').field('style', 'poster').expect(400);
  await send(app, 'unknown').expect(400);
  await request(app).post('/api/transform').attach('wrong', image, 'photo.png').expect(400);
  await request(app).post('/api/transform').field('style', 'poster').attach('image', image, 'a.png').attach('image', image, 'b.png').expect(400);
});
test('rejects MIME mismatch, corrupt data, unsupported formats and oversized files', async () => {
  await send(app, 'poster', image, 'image/jpeg').expect(422);
  await send(app, 'poster', Buffer.from('not an image')).expect(422);
  await send(app, 'poster', Buffer.from('<svg/>'), 'image/svg+xml').expect(415);
  const smallApp = createApp({ maxUploadBytes: 64 });
  await send(smallApp).expect(413);
});
test('normalizes oversized dimensions and strips EXIF', async () => {
  const large = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#aaccee' } }).withMetadata().jpeg().toBuffer();
  const response = await send(app, 'poster', large, 'image/jpeg').expect(200);
  const metadata = await sharp(response.body).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.exif, undefined);
});
test('missing API key is handled without an upstream request', async () => {
  await send(createApp({ provider: 'openai', openaiApiKey: '' })).expect(503);
});

test('actual frontend API client uploads multipart and reads result and server errors', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const window = { MORPH_CONFIG: { apiEndpoint: '/api/transform' } };
    runInNewContext(readFileSync(new URL('../dist/api.js', import.meta.url), 'utf8'), {
      window, FormData, fetch: (path, init) => fetch(new URL(path, origin), init),
    });
    const file = new File([image], 'portrait.png', { type: 'image/png' });
    const result = await window.transformImage(file, 'animation', new AbortController().signal);
    assert.equal(result.mode, 'demo');
    assert.equal(result.blob.type, 'image/jpeg');
    assert.equal((await sharp(Buffer.from(await result.blob.arrayBuffer())).metadata()).width, 30);
    await assert.rejects(window.transformImage(file, 'invalid'), /올바른 변환 스타일/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
