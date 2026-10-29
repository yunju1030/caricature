# Morph Studio

HTML/CSS/JavaScript 프론트엔드와 Node.js/Express 백엔드를 한 서버에서 실행합니다. 업로드 사진과 선택한 스타일을 OpenAI `gpt-image-2.5-sunburst` 이미지 편집 API로 전달하고, 결과를 웹 앱에서 비교·다운로드합니다. 로딩 중 중복 요청을 막고 오류를 한국어로 표시합니다.

## 로컬 실행 (Windows PowerShell)

Node.js 22 이상이 필요합니다.

```powershell
cd C:\jupyter_practice\test_1029\morph-studio
npm.cmd install
# .env는 이미 생성되어 있습니다. 새로 복제한 경우에만 아래를 실행하세요.
# Copy-Item .env.example .env
npm.cmd start
```

브라우저에서 **http://127.0.0.1:3000** 에 접속하세요. 종료는 `Ctrl+C`, 자동 재시작 개발 모드는 `npm.cmd run dev`입니다. Windows 실행 정책에 걸리지 않도록 `npm.cmd`를 사용합니다. macOS/Linux에서는 `npm`을 사용하세요. `index.html` 직접 열기나 Live Server 대신 Express 주소를 사용해야 API가 연결됩니다.

## 환경 변수

`.env`는 프로젝트 루트에 있으며 Git에서 제외합니다. 실제 키는 예제 파일이나 `dist/`에 넣지 마세요. 이미 설정된 배포 환경 변수가 `.env`보다 우선합니다.

```dotenv
PORT=3000
HOST=127.0.0.1
IMAGE_PROVIDER=openai
OPENAI_API_KEY=
```

- `IMAGE_PROVIDER=demo`: 키 없이 서버 필터로 동작합니다. 얼굴을 재구성하는 AI 캐리커처/애니메이션 생성이 아닙니다.
- `IMAGE_PROVIDER=openai`: 기존 `.env`의 `OPENAI_API_KEY`를 서버에서 읽어 실제 이미지 편집 API를 호출합니다. 키가 없으면 503을 반환합니다. API 키는 이번 작업에서 변경하지 않았습니다.
- 포트가 사용 중이면 `PORT`를 바꾸고 서버를 재시작하세요.

AI 모드에서 사진과 스타일 프롬프트는 OpenAI로 전송됩니다. 이 앱은 원본과 결과를 서버 파일이나 데이터베이스에 저장하지 않습니다. 서버에서 원본을 검증하고 메타데이터를 제거한 참조 이미지를 전송합니다. 외부 Google Fonts는 계속 사용합니다.

## API

| 경로 | 용도 |
| --- | --- |
| `GET /api/health` | 서버 상태 `{ "status": "ok" }` |
| `GET /api/config` | 공개된 처리 모드, 업로드 제한, 스타일 목록 (키 제외) |
| `POST /api/transform` | 사진 업로드 및 스타일 변환 |

변환 요청은 `multipart/form-data`이며 `image` 파일 하나와 `style` 필드 하나를 받습니다. 스타일은 `caricature`, `animation`, `poster` 중 하나입니다. 성공 응답은 `image/jpeg` 바이너리, `X-Transform-Mode: openai` (데모 모드라면 `demo`), `Cache-Control: no-store`입니다. 프론트엔드는 Blob URL로 비교·다운로드합니다. SDK 대기 시간은 180초, 브라우저는 200초입니다. 중복 과금 요청을 피하도록 SDK 자동 재시도는 껐습니다. 브라우저 연결이 끊어지면 진행 중인 SDK 요청도 중단합니다. 요청 중단이 이미 시작된 생성의 과금 취소를 보장하지는 않습니다.

```powershell
curl.exe -X POST http://127.0.0.1:3000/api/transform -F "image=@C:/photos/me.jpg" -F "style=caricature" --output result.jpg
```

오류 응답은 `{ "error": { "code": "INVALID_STYLE", "message": "..." } }` 형태입니다. 400(필드 누락/잘못된 스타일), 413(용량 초과), 415(지원하지 않는 형식), 422(손상/형식 위장/애니메이션 이미지), 500(내부 오류)을 구분합니다. 파일은 4MiB, 4천만 픽셀 이하의 정지 JPG/PNG/WEBP만 받습니다. 서버에서 실제 디코딩 후 EXIF 방향을 적용하고 메타데이터를 제거하며 긴 변을 1600px 이하로 줄입니다.

## 파일 구조와 OpenAI 연동 지점

```text
dist/                     프론트엔드 원본
  api.js                  POST /api/transform 요청/오류 처리
  config.js               공개 설정 (비밀 키 없음)
src/
  app.js                  Express 앱, 업로드/검증/응답 (Vercel 진입점)
  config.js               .env 읽기
  errors.js               공개 가능한 API 오류
  services/transform.js   변환 제공자 선택
  services/openai-images.js 공식 SDK 이미지 편집, 스타일 프롬프트, 오류 처리
local.js                  로컬 listen 실행
scripts/prepare-vercel.js dist → public 복사
test/api.test.js          API 통합 테스트
.env.example              공유 가능한 환경 변수 예제
vercel.json               Vercel 빌드 설정
```

## 공식 OpenAI 문서에 따른 요청

[모델 문서](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)에서 이미지 생성·편집 지원을 확인했습니다. [공식 이미지 편집 가이드](https://developers.openai.com/api/docs/guides/image-generation)와 [API 참조](https://developers.openai.com/api/reference/resources/images/methods/edit)에 따라 공식 Node.js SDK의 `client.images.edit()`를 사용합니다. SDK는 `POST https://api.openai.com/v1/images/edits`에 multipart 파일을 전송합니다.

```js
const result = await client.images.edit({
  model: 'gpt-image-2.5-sunburst',
  image: await toFile(imageBuffer, 'original.jpg', { type: 'image/jpeg' }),
  prompt: stylePrompt,
  n: 1,
  size: '1024x1024',
  quality: 'medium',
  output_format: 'jpeg',
  output_compression: 85,
});
const imageBytes = Buffer.from(result.data[0].b64_json, 'base64');
```

`imageBuffer`는 원본의 EXIF 방향을 적용하고 1600px 이내로 정규화한 JPEG입니다. 데모 효과를 적용한 사진을 보내지 않습니다. 얼굴의 정체성을 보존하도록 지시하면서 캐리커처(유쾌한 특징 과장), 애니메이션(독창적인 셀 애니메이션), 영화 포스터(시네마틱 조명과 제목)의 프롬프트를 따로 적용합니다. 브라우저가 임의의 모델/프롬프트/API 키를 전달하도록 허용하지 않습니다. API 결과는 base64를 디코딩한 뒤 실제 이미지 디코딩을 검증해 반환합니다.

인증 실패, 모델 접근 제한, 사용량/요청 제한, 사진 처리 거절, 연결 실패, 시간 초과는 각각 한국어 오류로 안내합니다. OpenAI의 원본 오류 본문이나 키를 브라우저와 로그에 출력하지 않습니다. `.env`는 `.gitignore`와 `.vercelignore`에서 제외하고, 정적 파일은 `dist/`만 제공합니다. 실제 OpenAI 사용량은 해당 프로젝트에 청구됩니다.

## 향후 Vercel 배포

아직 Vercel에 배포하지 않았습니다. 기존 Sites URL은 이전 프론트엔드 데모이며 이 Node 서버와 연결되지 않습니다.

1. `yunju1030/caricature` 저장소를 Vercel로 가져오고 **Root Directory는 저장소 루트(`.`)**로 설정하세요. 프로젝트가 다른 저장소의 하위 폴더에 있다면 해당 `morph-studio` 폴더를 선택하세요.
2. Framework Preset은 **Other**를 사용합니다. `vercel.json`에서 `framework: null`, Output Directory `public`을 지정합니다. Node.js 22 이상을 선택하세요. 대시보드에 `/api/*`를 `/index.html`로 보내는 Rewrite가 있다면 제거하세요.
3. 빌드가 `dist/`를 `public/`로 복사하고, `api/health.js`, `api/config.js`, `api/transform.js`를 각각 Node.js Function으로 배포합니다. 세 진입점은 같은 Express 앱을 사용합니다. `public/`는 자동 생성 파일이므로 직접 수정하지 마세요. Function 실행 시간은 200초로 설정하며 Fluid Compute가 활성화된 환경을 기준으로 합니다.
4. Vercel 환경 변수에 `IMAGE_PROVIDER=openai`와 `OPENAI_API_KEY`를 등록하세요. 로컬 `.env`는 배포하지 않습니다. 비용이 발생하는 API를 공개하기 전에는 서비스에 맞는 사용자 인증·호출 제한을 추가하세요.
5. 배포 후 `/`, `/api/health`, 파일 업로드를 확인하세요. `HOST`와 `PORT`는 로컬 실행용이며 Vercel에는 필요하지 않습니다.

[Vercel Express 공식 문서](https://vercel.com/docs/frameworks/backend/express)에 따라 정적 파일은 `public/`에서 CDN으로 제공됩니다. 함수 업로드 제한을 고려해 현재는 4MiB로 맞췄습니다. 더 큰 파일은 [Vercel 업로드 제한 안내](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)에 따라 Blob 직접 업로드 방식으로 확장하세요. 향후 OpenAI 결과가 함수 응답 용량을 초과하면 저장소 URL 반환 방식도 필요합니다.

## 검증

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

자동 테스트는 실제 API 요금 없이 SDK의 전송 요청을 모의 처리합니다. 원본 참조 이미지·정확한 모델명·세 스타일 프롬프트·base64 결과 처리·오류 응답·시간 초과·프론트엔드 Blob 연결을 검사합니다.

실제 API 연결을 별도로 확인하려면 `node scripts/smoke-openai.js`를 실행하세요. 합성 아바타 한 장을 편집하므로 **API 요금이 발생합니다**. 키와 이미지 데이터는 출력하지 않습니다. `node scripts/enable-openai.js`는 기존 키 보존을 확인하면서 `.env`의 처리 모드만 OpenAI로 변경하는 선택적 도구입니다.

변경된 프로젝트 `.env`의 키로 실제 이미지 편집 요청에 성공했습니다. `gpt-image-2.5-sunburst`에서 1024×1024 JPEG 결과를 반환했습니다. 코드에서는 키를 자동 교체하지 않습니다. 키 변경 후에는 실행 중인 서버를 재시작해야 새 값이 적용됩니다.

`node scripts/check-secrets.js`는 키를 출력하지 않고 공개 파일에 키가 들어 있는지, `.env`가 Git에서 제외되는지, 실행 설정의 키가 프로젝트 `.env`와 같은지 확인합니다. 실제 키가 있는 로컬 환경에서 실행하는 검사입니다.
