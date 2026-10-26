import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const local=existsSync(root+'.env')?parseEnv(readFileSync(root+'.env','utf8')):{};
const env={...local,...process.env};
if(!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY??''))throw Error('Local forwarding requires a Stripe sandbox key; live keys are refused');
const port=env.GUARDSCALE_WEB_PORT??'80';if(!/^\d{2,5}$/.test(port)||Number(port)>65535)throw Error('Invalid local port');
const binary=existsSync(root+'bin/stripe')?root+'bin/stripe':'stripe';
const child=spawn(binary,['--config',root+'bin/stripe-cli.toml','listen','--events','checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted','--forward-to',`http://127.0.0.1:${port}/api/billing/webhook`],{env:{...env,STRIPE_API_KEY:env.STRIPE_SECRET_KEY},stdio:['ignore','pipe','pipe']});
for(const input of [child.stdout,child.stderr])createInterface({input}).on('line',line=>{
 const secret=line.match(/whsec_[a-zA-Z0-9]+/)?.[0];
 if(secret&&secret!==env.STRIPE_WEBHOOK_SECRET){console.error('Local signing secret changed. Update STRIPE_WEBHOOK_SECRET in the ignored .env and restart local containers.');child.kill();process.exitCode=1;return;}
 console.log(line.replace(/(?:whsec_|[sr]k_(?:test|live)_)[a-zA-Z0-9]+/g,'[redacted]'));
});
child.on('error',()=>{console.error('Stripe CLI unavailable. Install it or put the verified binary at bin/stripe.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=process.exitCode||code||0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
