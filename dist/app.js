const $ = id => document.getElementById(id);
let selectedStyle = 'caricature', uploadedFile = null, sourceURL = null, resultURL = null, busy = false, resultStyle = '', resultType = '', toastTimer, uploadVersion = 0, reading = false;
const styleNames = {caricature:'캐리커처',animation:'애니메이션',poster:'영화 포스터'};
fetch('/api/config', { signal: AbortSignal.timeout(5000) }).then(response => response.ok ? response.json() : null).then(settings => {
  if (!settings) return;
  $('providerLabel').textContent = settings.provider === 'demo' ? '데모 스튜디오' : 'AI 스튜디오';
  $('processingNote').textContent = settings.provider === 'demo' ? '⌁ 데모 모드 · 서버 필터로 변환해요' : '⌁ AI 변환 시 사진이 OpenAI로 전송돼요';
}).catch(() => {});
function notify(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
function clearResult() { if(resultURL) URL.revokeObjectURL(resultURL); resultURL=null; $('errorMessage').hidden=true; $('download').disabled=true; $('comparison').hidden=true; $('disclaimer').hidden=true; $('empty').hidden=false; $('badge').textContent='미리보기'; $('resultHint').textContent='✧ 상상을 더하면, 새로운 내가 보여요'; }
async function upload(file) {
  if(busy) return;
  if(!file) return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) return notify('JPG, PNG, WEBP 파일을 선택해 주세요.');
  if(file.size>window.MORPH_CONFIG.maxUploadBytes) return notify('4MB 이하의 사진을 선택해 주세요.');
  const version = ++uploadVersion;
  reading = true;
  const url=URL.createObjectURL(file), image=new Image();
  try { image.src=url; await image.decode(); if(image.naturalWidth*image.naturalHeight>40000000) throw new Error(); }
  catch { URL.revokeObjectURL(url); if(version === uploadVersion) { reading=false; notify('사진을 읽을 수 없어요. 4천만 픽셀 이하의 사진을 선택해 주세요.'); } return; }
  if(version !== uploadVersion) { URL.revokeObjectURL(url); return; }
  reading = false;
  if(sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL=url; uploadedFile=file; clearResult();
  $('before').src=url; $('after').src=url; $('empty').hidden=true; $('comparison').hidden=false; $('beforeLayer').style.clipPath='inset(0 0 0 0)'; $('sliderLine').hidden=true; $('compare').hidden=true; document.querySelector('.after-label').hidden=true;
  $('uploadTitle').textContent=file.name; $('uploadText').textContent='다른 사진으로 바꾸기'; $('badge').textContent='사진 준비 완료'; $('resultHint').textContent='✧ 스타일을 선택하고 변환해 보세요';
}
$('file').addEventListener('change',e=>{upload(e.target.files[0]); e.target.value='';});
for(const type of ['dragenter','dragover']) $('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.add('drag');});
for(const type of ['dragleave','drop']) $('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.remove('drag');if(type==='drop')upload(e.dataTransfer.files[0]);});
document.querySelectorAll('.style').forEach(button=>button.addEventListener('click',()=>{if(busy)return;selectedStyle=button.dataset.style;document.querySelectorAll('.style').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});}));
function setCompare(value) { $('beforeLayer').style.clipPath=`inset(0 ${100-value}% 0 0)`; $('sliderLine').style.left=`${value}%`; }
$('compare').addEventListener('input',e=>setCompare(e.target.value));
$('generate').addEventListener('click',async()=>{
  if(busy)return;
  if(reading) return notify('사진을 읽고 있어요. 잠시 기다려 주세요.');
  if(!uploadedFile){notify('먼저 변환할 사진을 업로드해 주세요.');$('file').click();return;}
  busy=true;$('generate').disabled=true;$('file').disabled=true;$('download').disabled=true;$('loading').hidden=false;$('generate').querySelector('span').textContent='이미지 변환 중…';
  $('preview').setAttribute('aria-busy', 'true');
  $('errorMessage').hidden = true;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),200000);
  try {
    const { blob, mode } = await window.transformImage(uploadedFile,selectedStyle,controller.signal);
    const demo = mode === 'demo';
    const url=URL.createObjectURL(blob), check=new Image();check.src=url;try{await check.decode();}catch{URL.revokeObjectURL(url);throw new Error('변환된 이미지를 읽을 수 없어요.');}
    if(resultURL)URL.revokeObjectURL(resultURL); resultURL=url;resultStyle=selectedStyle;resultType=blob.type;$('after').src=url;$('before').src=sourceURL;$('empty').hidden=true;$('comparison').hidden=false;$('sliderLine').hidden=false;$('compare').hidden=false;document.querySelector('.after-label').hidden=false;$('compare').value=50;setCompare(50);
    $('badge').textContent=demo?'데모 효과 적용':'변환 완료';$('disclaimer').hidden=!demo;$('resultHint').textContent='↔ 슬라이더를 움직여 원본과 비교하세요';notify('새로운 이미지가 완성됐어요.');
  } catch(error) {
    const message = error.name==='AbortError'?'요청 시간이 초과되었어요. 다시 시도해 주세요.':error.message;
    $('errorMessage').textContent = message;
    $('errorMessage').hidden = false;
    notify(message);
  }
  finally{clearTimeout(timer);busy=false;$('preview').setAttribute('aria-busy','false');$('loading').hidden=true;$('generate').disabled=false;$('file').disabled=false;$('download').disabled=!resultURL;$('generate').querySelector('span').textContent='이미지 변환하기';}
});
$('download').addEventListener('click',()=>{if(!resultURL)return;const link=document.createElement('a');link.href=resultURL;const extension=({'image/jpeg':'jpg','image/webp':'webp','image/png':'png'})[resultType]||'png';link.download=`morph-${resultStyle}.${extension}`;link.click();notify(`${styleNames[resultStyle]} 이미지를 다운로드했어요.`);});
$('help').addEventListener('click',()=>$('guide').showModal());$('closeGuide').addEventListener('click',()=>$('guide').close());$('guide').addEventListener('click',e=>{if(e.target===$('guide')){const r=$('guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('guide').close();}});
