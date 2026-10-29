import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { stylePrompts } from '../src/services/openai-images.js';

const source = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#aabbcc' } }).png().toBuffer();
const edited = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cbaa89' } }).jpeg().toBuffer();
const secret = 'test-key-never-expose';
const post = (app, style = 'caricature') => request(app).post('/api/transform').field('style', style).attach('image', source, { filename: 'me.png', contentType: 'image/png' });
const success = () => Response.json({ data: [{ b64_json: edited.toString('base64') }] });

test('official SDK sends source image, exact requested model and each style prompt as multipart', async () => {
  let calls = 0;
  const app = createApp({ provider: 'openai', openaiApiKey: secret, openaiFetch: async (url, init) => {
    if (String(url) === 'data:,') return new Response(''); // SDK FormData compatibility probe
    const req = new Request(url, init);
    assert.equal(req.url, 'https://api.openai.com/v1/images/edits');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.get('authorization'), `Bearer ${secret}`);
    assert.match(req.headers.get('content-type'), /multipart\/form-data/);
    const form = await req.formData();
    assert.equal(form.get('model'), 'gpt-image-2.5-sunburst');
    assert.equal(form.get('n'), '1');
    assert.equal(form.get('output_format'), 'jpeg');
    assert.equal(form.get('size'), '1024x1024');
    assert.equal(form.get('quality'), 'medium');
    assert.equal(form.get('output_compression'), '85');
    assert.ok(form.get('prompt').startsWith(Object.values(stylePrompts)[calls]));
    const file = form.get('image');
    assert.equal(file.type, 'image/jpeg');
    const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    assert.equal(metadata.width, 40);
    assert.equal(metadata.height, 30);
    assert.equal(metadata.exif, undefined);
    assert.equal(form.get('input_fidelity'), null);
    assert.equal(form.get('response_format'), null);
    calls++;
    return success();
  } });
  for (const style of Object.keys(stylePrompts)) {
    const res = await post(app, style).expect(200).expect('X-Transform-Mode', 'openai').expect('Content-Type', /image\/jpeg/);
    assert.equal((await sharp(res.body).metadata()).width, 64);
  }
  assert.equal(calls, 3);
});

test('OpenAI errors map to useful messages without leaking provider bodies or retrying', async () => {
  for (const [status, expected, code] of [[401,502,'OPENAI_AUTH_ERROR'],[403,502,'OPENAI_MODEL_ACCESS'],[404,502,'OPENAI_MODEL_ACCESS'],[429,429,'OPENAI_RATE_LIMIT'],[400,422,'OPENAI_REJECTED'],[500,502,'OPENAI_UNAVAILABLE']]) {
    let calls = 0;
    const app = createApp({ provider: 'openai', openaiApiKey: secret, openaiFetch: async (url) => {
      if (String(url) === 'data:,') return new Response('');
      calls++;
      return Response.json({ error: { message: secret, type: 'api_error' } }, { status });
    } });
    const res = await post(app).expect(expected);
    assert.equal(res.body.error.code, code);
    assert.ok(!JSON.stringify(res.body).includes(secret));
    assert.equal(calls, 1);
  }
});

test('invalid or empty OpenAI image results are rejected safely', async () => {
  for (const body of [{data:[]}, {data:[{b64_json:'invalid image?!'}]}, {data:[{b64_json:Buffer.from('not an image').toString('base64')}]}]) {
    const app = createApp({ provider:'openai', openaiApiKey:secret, openaiFetch:async()=>Response.json(body) });
    await post(app).expect(502);
  }
});

test('provider timeout returns 504 and network failure returns 502', async () => {
  const timeout = createApp({provider:'openai',openaiApiKey:secret,imageTimeoutMs:20,openaiFetch:async (_url,init)=>new Promise((_resolve,reject)=>{
    if(init.signal.aborted) return reject(new DOMException('Aborted','AbortError'));
    init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })});
  const res = await post(timeout).expect(504);
  assert.equal(res.body.error.code,'OPENAI_TIMEOUT');
  const network = createApp({provider:'openai',openaiApiKey:secret,openaiFetch:async()=>{throw new TypeError(secret);}});
  const failure = await post(network).expect(502);
  assert.ok(!JSON.stringify(failure.body).includes(secret));
});

test('frontend receives AI blob for preview/download and displays curated API errors', async () => {
  let fail = false;
  const app = createApp({provider:'openai',openaiApiKey:secret,openaiFetch:async()=>fail?Response.json({error:{message:secret}},{status:429}):success()});
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const window = { MORPH_CONFIG: { apiEndpoint:'/api/transform' } };
    runInNewContext(readFileSync(new URL('../dist/api.js',import.meta.url),'utf8'),{window,FormData,fetch:(path,init)=>fetch(new URL(path,origin),init)});
    const photo = new File([source],'me.png',{type:'image/png'});
    const result = await window.transformImage(photo,'poster');
    assert.equal(result.mode,'openai');
    assert.equal(result.blob.type,'image/jpeg');
    assert.ok(result.blob.size>0);
    fail=true;
    await assert.rejects(window.transformImage(photo,'animation'),/사용량 한도 또는 요청 제한/);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
