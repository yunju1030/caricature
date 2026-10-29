# Morph Studio

HTML / CSS / JavaScript 이미지 변환 프론트엔드. `dist/index.html`을 열어 사용하거나 `npx serve dist`로 실행하세요. 별도 빌드가 필요 없습니다.

## 기능

- 클릭·드래그 업로드, 형식/10MB 제한 및 이미지 디코딩 검사
- 캐리커처 / 애니메이션 / 영화 포스터 스타일 선택
- 이미지 변환 및 원본 비교 슬라이더, PNG 다운로드
- 반응형 UI, 키보드 비교 조작, 로딩 및 오류 안내

기본 데모는 Canvas 색상 효과와 포스터 타이포그래피를 적용합니다. 실제 AI 캐리커처를 생성하지 않습니다. 데모에서 사진은 서버로 전송되지 않습니다. 외부 Google Fonts는 로딩되며 실패 시 시스템 글꼴을 사용합니다.

## Node.js 백엔드 연결

1. `dist/config.js`에서 `demo: false`로 변경하고 `apiEndpoint`를 설정하세요.
2. `POST /api/transform`은 multipart/form-data의 `image` 파일과 `style` (`caricature`, `animation`, `poster`)을 받습니다.
3. 서버는 스타일을 허용 목록으로 검증하고 해당 프롬프트로 OpenAI 이미지 편집 API를 호출합니다. API 키는 서버 환경 변수에만 보관하세요.
4. 응답은 `Content-Type: image/png` 등으로 이미지 바이너리를 반환합니다. 실패 시 적절한 4xx/5xx를 반환합니다. 프론트엔드는 최대 120초 후 요청을 중단합니다.
5. 별도 도메인의 서버라면 해당 프론트엔드 origin에 대해 CORS를 설정하세요. 업로드 크기/실제 파일 형식 검증, 인증, 호출 제한도 서버에서 적용하세요.

`api.js`에 네트워크 통신을 분리했습니다. OpenAI API 및 Node.js 서버 구현과 키는 포함하지 않습니다.
