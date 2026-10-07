import {decryptCatalog} from './vault.js';
export const googleLoginConfiguration={"enabled":true,"firebase":{"apiKey":"AIzaSyBXE4UNgFmlnfQ5TkpR6h4DIKE2rjbI0_Q","authDomain":"baelab-ledger.firebaseapp.com","projectId":"baelab-ledger","appId":"1:301215647344:web:9026cd464a9403629516b5"}};
// Included in the standalone build. Configuration is supplied only after provisioning.
let googleSession;
function googleDeadline(promise,label,timeout=20000,code='connection-timeout'){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(label),{code})),timeout)})]).finally(()=>clearTimeout(timer));
}
async function getGoogleSession(){
 if(googleSession)return googleSession;
 const [appSdk,authSdk,dbSdk]=await googleDeadline(Promise.all([
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
 ]),'Google 로그인 준비');
 googleSession=await configureGoogleSession(appSdk,authSdk,dbSdk);
 return googleSession;
}
async function configureGoogleSession(appSdk,authSdk,dbSdk){
 // Isolate Hub sign-in from other apps on the same GitHub Pages origin.
 const app=appSdk.initializeApp(googleLoginConfiguration.firebase,'chat-history-hub');
 const auth=authSdk.getAuth(app);
 await googleDeadline(authSdk.setPersistence(auth,authSdk.browserLocalPersistence),'로그인 저장 설정');
 await googleDeadline(auth.authStateReady(),'저장된 로그인 확인');
 return {auth,authSdk,dbSdk,db:dbSdk.getFirestore(app)};
}
const isHubOwner=user=>Boolean(user?.emailVerified&&user.email?.toLowerCase()==='baewongyu@gmail.com');
export async function unlockWithGoogle(){
 const root=document.getElementById('unlock');
 root.replaceChildren();
 const create=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e};
 const brand=create('div','MY CONVERSATIONS');brand.className='eyebrow';
 const heading=create('h1','내 대화 목록');
 const help=create('p','등록된 Google 계정으로 로그인해 주세요.');
 const button=create('button','Google로 로그인');button.type='button';button.className='google-login-button';
 const status=create('p','');status.id='unlock-status';status.setAttribute('role','status');
 const note=create('p','같은 브라우저에서는 로그인이 유지됩니다. 공용 PC에서는 사용 후 로그아웃해 주세요.');note.className='privacy-note';
 root.append(brand,heading,help,button,status,note);
 let session;
 button.disabled=true;status.textContent='저장된 로그인 정보를 확인하고 있습니다…';
 try{session=await getGoogleSession();button.disabled=false;status.textContent=''}
 catch(error){status.textContent=error.code==='auth/web-storage-unsupported'?'이 브라우저에서 로그인 정보를 저장할 수 없습니다. 사이트 데이터 저장을 허용한 뒤 다시 시도해 주세요.':'Google 로그인 연결을 불러오지 못했습니다. 아래 버튼으로 다시 시도해 주세요.';button.textContent='로그인 연결 다시 시도';button.disabled=false;button.onclick=()=>location.reload();return new Promise(()=>{})}
 return new Promise(resolve=>{
  let openedUserId=null,loggingOut=false;
  session.authSdk.onAuthStateChanged(session.auth,user=>{
   if(openedUserId&&(!isHubOwner(user)||user.uid!==openedUserId)){
    document.getElementById('catalog').hidden=true;
    if(!loggingOut)location.reload();
   }
  });
  const attempt=async()=>{
   button.disabled=true;status.textContent='로그인 확인 중입니다…';
   try{
    let user=session.auth.currentUser;
    if(!user){
     const provider=new session.authSdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
     user=(await googleDeadline(session.authSdk.signInWithPopup(session.auth,provider),'Google 인증창 연결',120000,'auth/popup-timeout')).user;
    }
    if(!isHubOwner(user))throw Object.assign(new Error('Wrong account'),{code:'permission-denied'});
    status.textContent='본인 계정을 확인했습니다. 대화 목록을 여는 중입니다…';
    // Firestore rules, rather than the visible UI, enforce access to this document.
    const record=await googleDeadline(session.dbSdk.getDocFromServer(session.dbSdk.doc(session.db,'private','chatHistoryAccess')),'목록 연결');
    if(!record.exists()||typeof record.data().unlockSecret!=='string')throw Object.assign(new Error('Missing vault'),{code:'missing-vault'});
    const response=await googleDeadline(fetch('./catalog.enc.json',{cache:'no-store'}),'목록 다운로드');
    if(!response.ok)throw Error('catalog-fetch-failed');
    const envelope=await response.json();
    const catalog=await decryptCatalog(envelope,record.data().unlockSecret);
    if(!Array.isArray(catalog.items))throw Error('invalid-catalog');
    if(session.auth.currentUser?.uid!==user.uid)throw Object.assign(new Error('Session changed'),{code:'auth/user-token-expired'});
    openedUserId=user.uid;
    document.getElementById('unlock').hidden=true;document.getElementById('catalog').hidden=false;
    document.getElementById('lock').textContent='로그아웃';
    document.getElementById('lock').onclick=async()=>{
     const lock=document.getElementById('lock');lock.disabled=true;loggingOut=true;
     try{await googleDeadline(session.authSdk.signOut(session.auth),'로그아웃');document.getElementById('catalog').hidden=true;location.reload()}
     catch{loggingOut=false;lock.disabled=false;lock.textContent='로그아웃 다시 시도';const error=document.getElementById('error');if(error){error.textContent='로그아웃을 완료하지 못했습니다. 다시 눌러 주세요.';error.hidden=false}}
    };
    resolve(catalog);
   }catch(error){
    const code=error.code||'';
    if(['permission-denied','auth/user-disabled','auth/user-token-expired','auth/invalid-user-token'].includes(code)){try{await session.authSdk.signOut(session.auth)}catch{}}
    const messages={
     'permission-denied':'이 Google 계정에는 목록을 열 권한이 없습니다. 등록된 계정으로 다시 로그인해 주세요.',
     'auth/popup-closed-by-user':'Google 인증창과 연결을 완료하지 못했습니다. Chrome 또는 Edge에서 이 GitHub 페이지를 열어 다시 로그인해 주세요.',
     'auth/popup-blocked':'Google 인증창이 차단되었습니다. 주소창의 팝업 차단 표시에서 이 사이트의 팝업을 허용해 주세요.',
     'auth/popup-timeout':'Google 인증창과 연결을 완료하지 못했습니다. Chrome 또는 Edge에서 이 GitHub 페이지를 열어 로그인해 주세요. 인증 중이었다면 아래 버튼으로 다시 시작할 수 있습니다.',
     'auth/network-request-failed':'Google 로그인 서비스와 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.',
     'auth/unauthorized-domain':'이 주소에서는 Google 로그인을 사용할 수 없습니다. GitHub 대화 목록 주소로 열어 주세요.',
     'auth/user-disabled':'사용할 수 없는 계정입니다. Google 로그인을 다시 확인해 주세요.',
     'auth/user-token-expired':'로그인이 만료되었습니다. Google로 다시 로그인해 주세요.',
     'auth/invalid-user-token':'로그인을 다시 확인해야 합니다. Google로 다시 로그인해 주세요.',
     'unavailable':'목록 연결이 잠시 끊겼습니다. 로그인은 유지되며 아래 버튼으로 다시 열 수 있습니다.',
     'missing-vault':'Google 로그인은 성공했지만 목록 초기 연결이 아직 완료되지 않았습니다.',
     'connection-timeout':'목록 연결 응답이 늦어지고 있습니다. 잠시 후 다시 눌러 주세요.'
    };
    status.textContent=messages[code]||'대화 목록을 열지 못했습니다. 다시 로그인해 주세요.';
    button.textContent=session.auth.currentUser?'목록 다시 열기':'Google로 로그인';
    if(code==='auth/popup-timeout'){button.textContent='로그인 다시 시작';button.onclick=()=>location.reload()}
   }finally{button.disabled=false}
  };
  button.onclick=attempt;
  if(session.auth.currentUser)void attempt();
 });
}

