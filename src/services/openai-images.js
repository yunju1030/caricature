import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { HttpError } from '../errors.js';

export const stylePrompts = Object.freeze({
  caricature: 'Turn the person in the reference photo into a polished hand-drawn editorial caricature. Playfully exaggerate distinctive facial features while keeping the same person clearly recognizable. Use expressive ink lines, warm colors and a simple complementary background. Make the result friendly and flattering.',
  animation: 'Reimagine the person in the reference photo as the main character in an original hand-drawn animated film. Use expressive eyes, clean linework, soft cel shading, rich colors and a cinematic illustrated background. Preserve the person\'s recognizable facial features, hairstyle, expression and overall pose.',
  poster: 'Create an original cinematic movie poster starring the person in the reference photo. Preserve their recognizable identity. Use dramatic film lighting, a carefully composed theatrical poster layout, atmospheric scenery and professional color grading. Include an elegant, clearly readable fictional title "THE ORIGINAL". Do not add real studio logos or existing movie branding.',
});

function publicApiError(error) {
  if (error instanceof OpenAI.APIConnectionTimeoutError || error.name === 'TimeoutError') return new HttpError(504, 'OPENAI_TIMEOUT', '이미지 변환 시간이 초과되었어요. 잠시 후 다시 시도해 주세요.');
  if (error instanceof OpenAI.APIUserAbortError || error.name === 'AbortError') return new HttpError(499, 'REQUEST_ABORTED', '이미지 변환 요청이 취소되었습니다.');
  if (error.status === 401) return new HttpError(502, 'OPENAI_AUTH_ERROR', 'OpenAI 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.');
  if (error.status === 403 || error.status === 404) return new HttpError(502, 'OPENAI_MODEL_ACCESS', '요청한 이미지 모델을 사용할 수 없어요. OpenAI 프로젝트의 모델 접근 권한을 확인해 주세요.');
  if (error.status === 429) return new HttpError(429, 'OPENAI_RATE_LIMIT', 'OpenAI 사용량 한도 또는 요청 제한에 도달했어요. 사용량을 확인하고 잠시 후 다시 시도해 주세요.');
  if (error.status === 400 || error.status === 422) return new HttpError(422, 'OPENAI_REJECTED', '이 사진의 변환 요청을 처리할 수 없어요. 다른 사진으로 다시 시도해 주세요.');
  return new HttpError(502, 'OPENAI_UNAVAILABLE', 'OpenAI 이미지 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
}

export async function editWithOpenAI({ image, style, apiKey, model = 'gpt-image-2.5-sunburst', timeoutMs = 180_000, signal, fetch }) {
  if (!Object.hasOwn(stylePrompts, style)) throw new HttpError(400, 'INVALID_STYLE', '올바른 변환 스타일을 선택해 주세요.');
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', logLevel: 'off', timeout: timeoutMs, maxRetries: 0, ...(fetch ? { fetch } : {}) });
  let response;
  try {
    // Official SDK builds multipart/form-data: image file, model, prompt and options.
    // Never send the key, prompt controls or arbitrary model choices to the browser.
    response = await client.images.edit({
      model,
      image: await toFile(image, 'original.jpg', { type: 'image/jpeg' }),
      prompt: `${stylePrompts[style]} Edit the supplied reference image rather than inventing an unrelated person. Produce one finished image.`,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
      output_format: 'jpeg',
      output_compression: 85,
    }, { signal });
  } catch (error) {
    // Provider response bodies may contain request details; expose curated errors only.
    throw publicApiError(error);
  }

  const encoded = response.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 24 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new HttpError(502, 'INVALID_OPENAI_RESPONSE', 'OpenAI에서 올바른 이미지가 반환되지 않았어요. 다시 시도해 주세요.');
  }
  try {
    // Validate actual output and constrain response size for later Vercel hosting.
    const buffer = await sharp(Buffer.from(encoded, 'base64'), { limitInputPixels: 16_000_000, failOn: 'warning' })
      .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (buffer.length > 4 * 1024 * 1024) throw new Error('Oversized image output');
    return { buffer, mimeType: 'image/jpeg', mode: 'openai' };
  } catch {
    throw new HttpError(502, 'INVALID_OPENAI_IMAGE', '변환된 이미지를 읽을 수 없어요. 다시 시도해 주세요.');
  }
}
