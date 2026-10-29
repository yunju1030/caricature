// multipart/form-data -> encoded image + server provider mode. No browser API key.
window.transformImage = async function(file, style, signal) {
  const form = new FormData();
  form.append('image', file);
  form.append('style', style);
  let response;
  try {
    response = await fetch(window.MORPH_CONFIG.apiEndpoint, { method: 'POST', body: form, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('서버에 연결할 수 없어요. npm start로 서버를 실행한 뒤 localhost 주소에서 이용해 주세요.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const deploymentError = response.status === 404 || response.status === 405;
    throw new Error(body?.error?.message || (deploymentError ? '배포된 변환 API가 연결되지 않았어요. 최신 배포의 서버 설정을 확인해 주세요.' : response.status === 504 ? '서버 처리 시간이 초과되었어요. 잠시 후 다시 시도해 주세요.' : response.status === 413 ? '사진 용량이 너무 커요. 4MB 이하로 줄여 주세요.' : `이미지 변환 요청에 실패했어요. (HTTP ${response.status}) 다시 시도해 주세요.`));
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error(blob.type.includes('text/html') ? 'API 대신 웹페이지가 반환됐어요. 배포의 API 경로 설정을 확인해 주세요.' : '서버에서 올바른 이미지가 반환되지 않았어요.');
  return { blob, mode: response.headers.get('X-Transform-Mode') || 'unknown' };
};
