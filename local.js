import app from './src/app.js';
import { config } from './src/config.js';

const server = app.listen(config.port, config.host, () => {
  console.log(`Morph Studio: http://${config.host}:${config.port}`);
  console.log(`Image provider: ${config.provider}`);
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '포트가 사용 중입니다. .env의 PORT를 변경하세요.' : '서버를 시작할 수 없습니다.');
  process.exitCode = 1;
});
