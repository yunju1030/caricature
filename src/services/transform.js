import sharp from 'sharp';
import { HttpError } from '../errors.js';
import { editWithOpenAI } from './openai-images.js';

export const styles = Object.freeze(['caricature', 'animation', 'poster']);

// Adapter contract: normalized JPEG -> encoded image buffer, mimeType, mode.
export async function transformImage({ image, style, provider, openaiApiKey, model, timeoutMs, signal, openaiFetch }) {
  if (provider === 'openai') {
    if (!openaiApiKey) throw new HttpError(503, 'API_KEY_MISSING', '서버의 OPENAI_API_KEY를 설정해 주세요.');
    return editWithOpenAI({ image, style, apiKey: openaiApiKey, model, timeoutMs, signal, fetch: openaiFetch });
  }
  let pipeline = sharp(image);
  if (style === 'caricature') {
    pipeline = pipeline.modulate({ saturation: 1.35 }).linear(1.15, -12).sharpen();
  } else if (style === 'animation') {
    pipeline = pipeline.median(3).modulate({ saturation: 1.6, brightness: 1.08 });
  } else {
    pipeline = pipeline.modulate({ saturation: 0.65 }).linear(1.2, -18).tint('#8f9fb3');
  }
  const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return { buffer, mimeType: 'image/jpeg', mode: 'demo' };
}
