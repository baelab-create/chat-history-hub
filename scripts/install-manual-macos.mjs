import {mkdir,copyFile,readFile,writeFile,access} from 'node:fs/promises';
import {homedir,hostname} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('This installer requires macOS');
const source=fileURLToPath(new URL('../',import.meta.url));
const target=join(homedir(),'Library/Application Support/ChatHistoryHubManual');
const legacy=join(homedir(),'Library/Application Support/ChatHistoryHub');
for(const dir of ['collector','scripts','private/collector'])await mkdir(join(target,dir),{recursive:true,mode:0o700});
for(const file of ['device-crypto.mjs','collector/metadata.mjs','collector/read-local.py','collector/app-source.mjs','collector/lock.mjs','collector/collect-once.mjs','collector/manual-server.mjs'])await copyFile(join(source,file),join(target,file));
let config;for(const base of [target,legacy]){try{config=JSON.parse(await readFile(join(base,'private/collector/config.json'),'utf8'));break}catch(e){if(e.code!=='ENOENT')throw e}}
if(!config){const recipient=JSON.parse(await readFile(join(source,'setup/recipient.json'),'utf8'));config={deviceName:hostname(),recipient:recipient.publicKey,python:execFileSync('/usr/bin/which',['python3'],{encoding:'utf8'}).trim()}}
await writeFile(join(target,'private/collector/config.json'),JSON.stringify(config),{mode:0o600});
for(const name of ['identity.json','snapshot.json','connection.json']){
 const dest=join(target,'private/collector',name);try{await access(dest);continue}catch{}
 try{await copyFile(join(legacy,'private/collector',name),dest)}catch(e){if(e.code!=='ENOENT')throw e}
}
const apps=join(homedir(),'Applications');await mkdir(apps,{recursive:true});
const app=join(apps,'Chat History Hub Manual.app');
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const appleString=s=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
const command=shellQuote(process.execPath)+' '+shellQuote(join(target,'collector/manual-server.mjs'))+' ';
const script=`on open location requestURL\n if requestURL does not start with "chathistoryhub://sync/" then return\n do shell script ${appleString(command)} & quoted form of requestURL & " >/dev/null 2>&1 &"\nend open location\n`;
const scriptPath=join(target,'scripts/ManualLauncher.applescript');await writeFile(scriptPath,script);
execFileSync('/usr/bin/osacompile',['-o',app,scriptPath],{stdio:'pipe'});
const plist=join(app,'Contents/Info.plist');
execFileSync(config.python||'python3',['-c',"import plistlib,sys; p=sys.argv[1]; d=plistlib.load(open(p,'rb')); d.update(LSUIElement=True,CFBundleIdentifier='com.baelab.chat-history-hub.manual',CFBundleURLTypes=[{'CFBundleURLSchemes':['chathistoryhub']}]); plistlib.dump(d,open(p,'wb'))",plist],{stdio:'pipe'});
execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',app],{stdio:'pipe'});
// Disable the previous job only. No new launchd job is created.
const label='com.baelab.chat-history-hub';
try{execFileSync('/bin/launchctl',['bootout',`gui/${process.getuid()}/${label}`],{stdio:'pipe'})}catch{}
try{execFileSync('/bin/launchctl',['disable',`gui/${process.getuid()}/${label}`],{stdio:'pipe'})}catch{}
console.log('Manual connection installed. No collection or scheduled job started.');
