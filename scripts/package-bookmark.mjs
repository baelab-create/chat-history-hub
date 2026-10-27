import {readFile,writeFile} from 'node:fs/promises';
import {inspectSidebar} from '../extension/collector.js';
import {runBookmarklet} from '../bookmark/run.mjs';
import {readReactDates,withReactDates} from '../extension/react-dates.js';
const root=new URL('../',import.meta.url);
const cryptoSource=await readFile(new URL('device-crypto.mjs',root),'utf8');
const cryptoCode=(cryptoSource.slice(0,cryptoSource.indexOf('export async function recipientFromPassword'))+cryptoSource.slice(cryptoSource.indexOf('async function aesKey'),cryptoSource.indexOf('export async function decryptDevice'))).replaceAll('export ','');
const {publicKey}=JSON.parse(await readFile(new URL('setup/recipient.json',root),'utf8'));
const license=await readFile(new URL('extension/THIRD_PARTY_LICENSES.txt',root),'utf8');
const body=`(()=>{/*${license}*/${cryptoCode}\nconst collect=${inspectSidebar.toString()};const readDates=${readReactDates.toString()};const attachDates=${withReactDates.toString()};const run=${runBookmarklet.toString()};void run({collect,readDates,attachDates,encrypt:encryptDevice,recipient:${JSON.stringify(publicKey)},hubUrl:'https://baelab-create.github.io/chat-history-hub/'});})()`;
const href='javascript:'+encodeURIComponent(body);
const escaped=href.replaceAll('&','&amp;').replaceAll('"','&quot;');
const template=await readFile(new URL('setup/simple.template.html',root),'utf8');
const output=template.replace('BOOKMARK_HREF',escaped);
const dest=new URL('setup/simple.html',root);
if(process.argv.includes('--check')){if(await readFile(dest,'utf8')!==output)throw Error('Bookmark page is stale; run node scripts/package-bookmark.mjs');console.log('Bookmark page matches source');}
else{await writeFile(dest,output);console.log('Bookmark page rebuilt');}
