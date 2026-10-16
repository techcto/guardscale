import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,chmod,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
if(process.env.NODE_ENV==='production')throw Error('Refusing fixture startup in production');
const security=process.argv.includes('--security');
const bedrock=process.argv.includes('--bedrock');
const toolsEnabled=process.argv.includes('--tools');
if(toolsEnabled&&!security)throw Error('--tools requires the isolated --security fixture');
if(toolsEnabled)for(const tool of ['ffuf','nuclei'])try{await access(root+'../../submodules/'+tool+'/go.mod');}catch{throw Error('Initialize scanner sources first: git submodule update --init --recursive');}
if(process.argv.slice(2).some(v=>!['--security','--bedrock','--tools'].includes(v)))throw Error('Usage: start.mjs [--security] [--bedrock] [--tools]');
await mkdir(root+'.secrets',{recursive:true,mode:0o700});
// User-requested disposable localhost login; never used by release services.
await writeFile(root+'.secrets/root-password','test',{mode:0o600});
await chmod(root+'.secrets/root-password',0o600);
for(const name of ['session-secret']){
 try{await writeFile(root+'.secrets/'+name,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;}
 await chmod(root+'.secrets/'+name,0o600);
}
const compose=['compose','-f',root+'compose.yml',...(security?['-f',root+'security.yml','--profile','local-security']:[]),...(bedrock?['-f',root+'bedrock.yml']:[]),...(toolsEnabled?['-f',root+'tools.yml']:[]),'--profile','local-fixture'];
const result=spawnSync('docker',[...compose,'up','-d','--build'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
// The agent reads enrollment/config on startup. Re-read after bootstrap updates it.
const restarted=spawnSync('docker',[...compose,'restart','site'],{stdio:'inherit'});
if(restarted.status!==0)process.exit(restarted.status??1);
const verified=spawnSync('docker',[...compose,'run','--rm','--no-deps','enroll','node','/scripts/verify.mjs'],{stdio:'inherit'});
if(verified.status!==0)process.exit(verified.status??1);
console.log(security?'Security console: http://localhost:8185 | PHP: http://localhost:8186':'Console: http://localhost:8183 | PHP: http://localhost:8184');
console.log('Local-only login: root / test. The real PHP server is in root’s default GuardScale workspace.');
