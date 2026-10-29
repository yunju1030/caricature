/* Backend boundary: multipart request { image: File, style: string }.
   Response: image/* binary. The server calls the image editing API securely. */
window.transformImage = async function(file, style, signal) {
  const form = new FormData();
  form.append('image', file);
  form.append('style', style);
  const response = await fetch(window.MORPH_CONFIG.apiEndpoint, { method: 'POST', body: form, signal });
  if (!response.ok) throw new Error('이미지 변환에 실패했어요. 잠시 후 다시 시도해 주세요.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('서버에서 올바른 이미지가 반환되지 않았어요.');
  return blob;
};
