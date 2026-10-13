import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir,hostname} from 'node:os';
import {join} from 'node:path';
if(process.platform!=='darwin')throw Error('This installer is for macOS');
const root=new URL('../',import.meta.url),dir=new URL('private/collector/',root);
await mkdir(dir,{recursive:true,mode:0o700});
let config;try{config=JSON.parse(await readFile(join(homedir(),'Library/Application Support/ChatHistoryHub/private/collector/config.json'),'utf8'))}
catch(error){if(error.code!=='ENOENT')throw error}
if(!config){
 const recipient=JSON.parse(await readFile(new URL('setup/recipient.json',root),'utf8'));
 const locate=name=>execFileSync('/usr/bin/which',[name],{encoding:'utf8',env:{...process.env,PATH:(process.env.PATH||'')+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'}}).trim();
 config={deviceName:hostname(),recipient:recipient.publicKey,repository:'baelab-create/chat-history-hub',python:locate('python3'),gh:locate('gh')};
}
if(execFileSync(config.gh,['api','user','--jq','.login'],{encoding:'utf8'}).trim()!=='baelab-create')throw Error('Sign GitHub CLI into baelab-create before installing');
await writeFile(new URL('config.json',dir),JSON.stringify(config),{mode:0o600});
await import('./install-macos.mjs');
