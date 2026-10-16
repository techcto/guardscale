import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(process.env.NODE_ENV==='production')throw Error('Local fixture only');
const root=fileURLToPath(new URL('./',import.meta.url));const security=process.argv.includes('--security');
const bedrock=process.argv.includes('--bedrock');
const scanner=process.argv.includes('--ffuf')?'ffuf':process.argv.includes('--nuclei')?'nuclei':'';
if(scanner&&!security||process.argv.includes('--ffuf')&&process.argv.includes('--nuclei'))throw Error('Choose one scanner with --security');
if(bedrock&&!security)throw Error('Bedrock assertions require --security');
if(process.argv.slice(2).some(v=>!['--security','--bedrock','--ffuf','--nuclei'].includes(v)))throw Error('Usage: test.mjs [--security] [--bedrock] [--ffuf|--nuclei]');
const args=['compose','-f',root+'compose.yml',...(security?['-f',root+'security.yml','--profile','local-security']:[]),...(bedrock?['-f',root+'bedrock.yml']:[]),...(scanner?['-f',root+'tools.yml']:[]),'--profile','local-fixture','--profile','local-tests'];
function run(extra){const r=spawnSync('docker',[...args,...extra],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
if(security)run(['restart','site','probe']); // Reset only disposable detection/probe cooldowns for repeatable tests.
run(['run','--rm','--no-deps','--build',...(bedrock?['-e','GUARDSCALE_TEST_BEDROCK=true']:[]),...(scanner?['-e','GUARDSCALE_SECURITY_TOOL='+scanner]:[]),'browser',...(security?['node','/tests/security-tests.mjs']:[])]);
