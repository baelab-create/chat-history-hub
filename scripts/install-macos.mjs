// Run only after configuring and verifying collector/sync.mjs on this Mac.
import {mkdir,copyFile,readFile,writeFile,chmod,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('This installer is for macOS');
const source=fileURLToPath(new URL('../',import.meta.url));
// Background agents cannot reliably access macOS privacy-protected Documents.
const target=join(homedir(),'Library','Application Support','ChatHistoryHub');
const legacy=join(homedir(),'Documents','Codex','chat-history-hub-sync');
const label='com.baelab.chat-history-hub';
const plist=join(homedir(),'Library','LaunchAgents',label+'.plist');
const config=JSON.parse(await readFile(join(source,'private/collector/config.json'),'utf8'));
if(!config.recipient||!config.deviceName)throw Error('Configure and verify the collector first');
await mkdir(join(target,'collector'),{recursive:true});await mkdir(join(target,'private/collector'),{recursive:true,mode:0o700});
for(const file of ['device-crypto.mjs','device-catalog.mjs','collector/metadata.mjs','collector/read-local.py','collector/sync.mjs'])await copyFile(join(source,file),join(target,file));
for(const file of ['config.json','identity.json','snapshot.json','cloud-observation.json','last-success.json']){
 const dest=join(target,'private/collector',file);
 try{await access(dest);continue}catch{}
 let from=join(legacy,'private/collector',file);
 try{await access(from)}catch{from=join(source,'private/collector',file)}
 try{await copyFile(from,dest);await chmod(dest,0o600)}catch(e){if(e.code!=='ENOENT')throw e}
}
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const output=join(target,'private/collector/service.log');
await writeFile(output,'',{flag:'a',mode:0o600});
const contents=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(target,'collector/sync.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(target)}</string><key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer>
<key>StandardOutPath</key><string>${xml(output)}</string><key>StandardErrorPath</key><string>${xml(output)}</string>
<key>ProcessType</key><string>Background</string></dict></plist>`;
if(process.argv.includes('--prepare')){await writeFile(join(source,'work',label+'.plist'),contents);console.log('Prepared collector and launchd configuration; not scheduled yet.');}
else{
 await mkdir(join(homedir(),'Library','LaunchAgents'),{recursive:true});await writeFile(plist,contents,{mode:0o600});
 try{execFileSync('launchctl',['bootout',`gui/${process.getuid()}/${label}`],{stdio:'ignore'})}catch{}
 try{execFileSync('launchctl',['bootstrap',`gui/${process.getuid()}`,plist],{stdio:'inherit'});console.log('LaunchAgent registered. Verify a NEW last-success.json timestamp and uploaded:true in service.log before claiming collection succeeded.')}
 catch{console.error('Configuration installed, but macOS did not start the service. Run launchctl bootstrap from your own Terminal, or sign out and back in.');process.exitCode=2}
}
