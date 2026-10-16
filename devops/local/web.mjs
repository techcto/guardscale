import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(process.env.GUARDSCALE_LOCAL_FIXTURE!=='true'||process.env.NODE_ENV==='production')throw Error('Local fixture only');
process.env.GUARDSCALE_ROOT_PASSWORD=readFileSync('/run/secrets/root_password','utf8').trim();
process.env.GUARDSCALE_SESSION_SECRET=readFileSync('/run/secrets/session_secret','utf8').trim();
// Test the same built application/server used by releases, without dev HMR.
const child=spawn('node',['.next/standalone/server.js'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production',PORT:'3000',HOSTNAME:'0.0.0.0'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
