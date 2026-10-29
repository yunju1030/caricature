import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { styles, transformImage } from './services/transform.js';

const mimeFormats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

export function createApp(options = {}) {
  const settings = { ...config, ...options };
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/config', (_req, res) => res.json({
    provider: settings.provider, model: settings.provider === 'openai' ? settings.imageModel : null, maxUploadBytes: settings.maxUploadBytes, styles,
  }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: settings.maxUploadBytes, files: 1, fields: 1, parts: 3, fieldSize: 100 },
    fileFilter: (_req, file, done) => {
      if (!Object.hasOwn(mimeFormats, file.mimetype)) return done(new HttpError(415, 'UNSUPPORTED_IMAGE', 'JPG, PNG, WEBP 사진만 업로드할 수 있습니다.'));
      done(null, true);
    },
  });
  app.post('/api/transform', upload.single('image'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'IMAGE_REQUIRED', '변환할 사진을 업로드해 주세요.');
    if (!styles.includes(req.body.style)) throw new HttpError(400, 'INVALID_STYLE', '올바른 변환 스타일을 선택해 주세요.');
    let normalized;
    try {
      const metadata = await sharp(req.file.buffer, { limitInputPixels: settings.maxPixels, failOn: 'warning' }).metadata();
      if (metadata.format !== mimeFormats[req.file.mimetype] || (metadata.pages || 1) > 1) throw new Error('Invalid or animated image');
      // Fully decode, constrain dimensions, orient from EXIF and strip metadata.
      normalized = await sharp(req.file.buffer, { limitInputPixels: settings.maxPixels, failOn: 'warning' })
        .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    } catch {
      throw new HttpError(422, 'INVALID_IMAGE', '사진을 읽을 수 없습니다. 4천만 픽셀 이하의 정지 이미지를 선택해 주세요.');
    }
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const result = await transformImage({ image: normalized, style: req.body.style, provider: settings.provider, openaiApiKey: settings.openaiApiKey, model: settings.imageModel, timeoutMs: settings.imageTimeoutMs, signal: controller.signal, openaiFetch: settings.openaiFetch });
      if (controller.signal.aborted) return;
      res.set({ 'Content-Type': result.mimeType, 'X-Transform-Mode': result.mode, 'Content-Disposition': `inline; filename="morph-${req.body.style}.jpg"` });
      res.send(result.buffer);
    } finally {
      res.off('close', onClose);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API 경로를 찾을 수 없습니다.' } }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url)), { dotfiles: 'deny' }));
  app.use((_req, res) => res.status(404).send('페이지를 찾을 수 없습니다.'));
  app.use((error, _req, res, _next) => {
    if (res.destroyed || res.headersSent) return;
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ error: { code: error.code, message: tooLarge ? '4MB 이하의 사진을 선택해 주세요.' : '사진 한 장과 스타일 하나만 전송해 주세요.' } });
    }
    if (error instanceof HttpError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    // Do not log uploads, credentials or raw provider responses.
    console.error('Image request failed:', error.name || 'Error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '이미지 처리 중 오류가 발생했습니다. 다시 시도해 주세요.' } });
  });
  return app;
}

// Vercel detects src/app.js as an Express entry point; no listener during import.
export default createApp();
