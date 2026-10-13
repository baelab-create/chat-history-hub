const endpoint='http://127.0.0.1:41791/collect';
export const makeNonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const invocation=nonce=>'chathistoryhub://sync/'+nonce;
// Called ONLY from an explicit click. No page-load/focus/visibility listeners.
export async function requestManualCollection(nonce,{signal}={}){
 const deadline=Date.now()+30000;
 const timeout=AbortSignal.timeout(115000),requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
 while(true){
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Hub '+nonce},cache:'no-store',credentials:'omit',targetAddressSpace:'loopback',signal:requestSignal});
   if(response.status===403)throw Error('다른 최신화 요청이 진행 중입니다. 잠시 후 다시 눌러 주세요.');
   if(!response.ok)throw Error('수집하지 못했습니다. 이 PC의 ChatGPT 앱을 열고 로그인 상태를 확인해 주세요.');
   const raw=await response.text();if(raw.length>20000000)throw Error('목록 크기를 확인해 주세요.');
   const result=JSON.parse(raw);if(!result.success||!result.envelope)throw Error('수집 결과를 확인하지 못했습니다.');
   return result;
  }catch(error){
   if(signal?.aborted)throw Error('최신화를 취소했습니다.');
   if(timeout.aborted)throw Error('연결 제한 시간을 넘었습니다. 앱 실행과 브라우저의 연결 허용 상태를 확인해 주세요.');
   if(!(error instanceof TypeError)||Date.now()>=deadline)throw error instanceof TypeError?Error('연결 도구를 찾지 못했습니다. 처음이라면 연결 도구를 설치하고, 브라우저의 앱 열기·로컬 연결 허용을 확인해 주세요.'):error;
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }
}
