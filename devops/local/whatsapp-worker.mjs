import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true'||!process.env.GUARDSCALE_LOCAL_WHATSAPP_RECIPIENT)throw Error('Explicit local WhatsApp fixture settings required');
const env={...process.env,GUARDSCALE_ROOT_PASSWORD:readFileSync('/run/secrets/root_password','utf8').trim(),GUARDSCALE_SESSION_SECRET:readFileSync('/run/secrets/session_secret','utf8').trim()};
const child=spawn('node',['dist/worker/index.js'],{stdio:'inherit',env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
