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
    throw new Error(body?.error?.message || (response.status === 413 ? '사진 용량이 너무 커요. 4MB 이하로 줄여 주세요.' : '이미지 변환 요청에 실패했어요. 다시 시도해 주세요.'));
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('서버에서 올바른 이미지가 반환되지 않았어요.');
  return { blob, mode: response.headers.get('X-Transform-Mode') || 'unknown' };
};
