import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import request from 'supertest';
import health from '../api/health.js';
import configuration from '../api/config.js';
import transform from '../api/transform.js';

test('explicit Vercel function exports handle original API paths', async () => {
  await request(health).get('/api/health').expect(200, { status:'ok' });
  await request(configuration).get('/api/config').expect(200).expect('Content-Type',/json/);
  await request(transform).post('/api/transform').expect(400).expect('Content-Type',/json/);
  const manifest = JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(manifest.framework,null);
  assert.equal(manifest.outputDirectory,'public');
  assert.ok(manifest.functions['api/*.js'].maxDuration>180);
});

test('frontend explains a missing API or static HTML fallback', async () => {
  const window = { MORPH_CONFIG:{apiEndpoint:'/api/transform'} };
  let status = 405;
  runInNewContext(readFileSync(new URL('../dist/api.js',import.meta.url),'utf8'),{
    window,FormData,fetch:async()=>new Response('<html>Homepage</html>',{status,headers:{'Content-Type':'text/html'}}),
  });
  const file = new File(['test'],'photo.jpg',{type:'image/jpeg'});
  await assert.rejects(window.transformImage(file,'poster'),/변환 API가 연결되지/);
  status=200;
  await assert.rejects(window.transformImage(file,'poster'),/API 대신 웹페이지/);
});
