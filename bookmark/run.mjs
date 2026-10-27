// Embedded into a user-clicked bookmark. No network reads, cookies or body capture.
export async function runBookmarklet({collect,readDates,attachDates,encrypt,recipient,hubUrl}){
 try{
  if(location.origin!=='https://chatgpt.com'){alert('ChatGPT 페이지에서 대화 사이드바를 펼친 뒤 이 북마크를 눌러 주세요.');return;}
  let raw=collect();
  if(raw.items.length>200){alert('간편 가져오기는 한 번에 200개까지 지원합니다. 더 많은 과거 대화는 기존 확장 프로그램을 사용해 주세요.');return;}
  raw=attachDates(raw,readDates(raw.items.map(row=>row.id)));
  if(document.activeElement?.matches('textarea,[contenteditable="true"]')&&!confirm('대화 목록 화면으로 이동합니다. 작성 중인 내용이 있다면 취소하고 먼저 마무리해 주세요.'))return;
  // Only ciphertext enters the URL fragment; plaintext never goes to the web host.
  const envelope=await encrypt({...raw,importKind:'hub-bookmark-v1',deviceId:crypto.randomUUID()},recipient);
  const fragment='#hub-import='+encodeURIComponent(JSON.stringify(envelope));
  if(fragment.length>180000)throw Error('간편 가져오기 크기를 넘었습니다. 기존 확장 프로그램을 사용해 주세요.');
  location.assign(hubUrl+fragment);
 }catch(error){alert(error.message||'대화 목록을 읽지 못했습니다. ChatGPT 사이드바를 펼쳐 주세요.');}
}
