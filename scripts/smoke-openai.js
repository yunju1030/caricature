// One real billable image edit using a synthetic avatar; never prints credentials.
import sharp from 'sharp';
import { config } from '../src/config.js';
import { transformImage } from '../src/services/transform.js';

const avatar = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce5d1"/><ellipse cx="128" cy="245" rx="85" ry="70" fill="#55714a"/><ellipse cx="128" cy="119" rx="57" ry="72" fill="#dca77f"/><path d="M70 110Q55 20 130 32Q202 30 186 114L168 70 97 75Z" fill="#483b34"/><circle cx="106" cy="118" r="5"/><circle cx="150" cy="118" r="5"/><path d="M106 151Q128 169 150 151" fill="none" stroke="#8e4d3e" stroke-width="4"/></svg>');
try {
  const image = await sharp(avatar).jpeg().toBuffer();
  const result = await transformImage({ image, style: 'caricature', provider: 'openai', openaiApiKey: config.openaiApiKey, model: config.imageModel, timeoutMs: config.imageTimeoutMs });
  const metadata = await sharp(result.buffer).metadata();
  console.log(JSON.stringify({ status:'ok', model:config.imageModel, mode:result.mode, format:metadata.format, width:metadata.width, height:metadata.height, bytes:result.buffer.length }));
} catch (error) {
  console.error(JSON.stringify({ status:'failed', code:error.code || 'INTERNAL_ERROR', message:error.status ? error.message : 'Smoke test failed. No credentials logged.' }));
  process.exitCode = 1;
}
