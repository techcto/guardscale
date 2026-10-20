import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Machine-specific defaults only. AWS credentials remain in the AWS CLI store.
export function localDeploymentDefaults(env=process.env){
 const filename=env.CFT_LOCAL_CONFIG??fileURLToPath(new URL('./cft.local.json',import.meta.url));
 let raw;
 try{raw=readFileSync(filename,'utf8')}catch(error){
  if(error.code==='ENOENT'&&!env.CFT_LOCAL_CONFIG)return {};
  throw Error('Cannot read local deployment settings. Check CFT_LOCAL_CONFIG or devops/cft.local.json.');
 }
 let config;try{config=JSON.parse(raw)}catch{throw Error('Local deployment settings must be valid JSON.');}
 if(!config||Array.isArray(config)||typeof config!=='object')throw Error('Local deployment settings must be an object.');
 for(const [key,value] of Object.entries(config)){
  if(!['profile','region','stack'].includes(key))throw Error('Local deployment settings support only profile, region and stack; never put credentials here.');
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||/[\x00-\x1f]/.test(value))throw Error('Local deployment settings contain an invalid '+key+'.');
 }
 return config;
}
