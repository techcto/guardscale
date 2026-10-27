import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(process.env.NODE_ENV==='production')throw Error('Local fixture only');
const root=fileURLToPath(new URL('./',import.meta.url));const security=process.argv.includes('--security');
const envFile=fileURLToPath(new URL('../../.env',import.meta.url));
const bedrock=process.argv.includes('--bedrock');
const responseTest=process.argv.includes('--response');
if(responseTest&&!security)throw Error('--response requires --security and an already configured real WhatsApp fixture');
const scanner=process.argv.includes('--ffuf')?'ffuf':process.argv.includes('--nuclei')?'nuclei':'';
if(scanner&&!security||process.argv.includes('--ffuf')&&process.argv.includes('--nuclei'))throw Error('Choose one scanner with --security');
if(bedrock&&!security)throw Error('Bedrock assertions require --security');
if(process.argv.slice(2).some(v=>!['--security','--bedrock','--ffuf','--nuclei','--response'].includes(v)))throw Error('Usage: test.mjs [--security] [--bedrock] [--response|--ffuf|--nuclei]');
const args=['compose',...(bedrock||responseTest?['--env-file',envFile]:[]),'-f',root+'compose.yml',...(security?['-f',root+'security.yml','--profile','local-security']:[]),...(bedrock?['-f',root+'bedrock.yml']:[]),...(responseTest?['-f',root+'whatsapp.yml','--profile','local-whatsapp']:[]),...(scanner?['-f',root+'tools.yml']:[]),'--profile','local-fixture','--profile','local-tests'];
function run(extra){const r=spawnSync('docker',[...args,...extra],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
if(security&&!responseTest)run(['restart','site','probe']); // Response test preserves the operator's ongoing probe session.
if(responseTest)run(['restart','site']); // Reset detector cooldown without stopping the ongoing probe process.
run(['run','--rm','--no-deps','--build',...(bedrock?['-e','GUARDSCALE_TEST_BEDROCK=true']:[]),...(responseTest?['-e','GUARDSCALE_TEST_REAL_MESSAGING=true','-v',root+'response-tests.mjs:/tests/response-tests.mjs:ro']:[]),...(scanner?['-e','GUARDSCALE_SECURITY_TOOL='+scanner]:[]),'browser',...(responseTest?['node','/tests/response-tests.mjs']:security?['node','/tests/security-tests.mjs']:[])]);
