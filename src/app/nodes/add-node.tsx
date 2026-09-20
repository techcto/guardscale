'use client';

import {useMemo,useState} from 'react';

const safeId=(prefix:string)=>`${prefix}-${crypto.randomUUID().slice(0,8)}`;
const clean=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,64);
const FREE_NODE_LIMIT=5;

export default function AddNode({nodeCount,onAdded}:{nodeCount:number;onAdded:()=>void}){
  const [open,setOpen]=useState(false),[agentId,setAgentId]=useState(''),[serverId,setServerId]=useState(''),[tagsInput,setTagsInput]=useState('');
  const [platform,setPlatform]=useState<'amd64'|'arm64'>('amd64'),[copied,setCopied]=useState('');
  const [enrollment,setEnrollment]=useState<{tenantId:string;enrollmentToken:string}|null>(null),[error,setError]=useState('');
  const atLimit=nodeCount>=FREE_NODE_LIMIT;
  async function begin(){
    if(atLimit){setOpen(true);return}
    if(!agentId)setAgentId(safeId('agent'));
    if(!serverId)setServerId(safeId('node'));
    setError('');
    const r=await fetch('/api/v1/nodes/enrollment');
    if(!r.ok){setError('Unable to issue an enrollment credential for this account.');setOpen(true);return}
    setEnrollment(await r.json());
    setOpen(true);
  }
  const commands=useMemo(()=>{
    const agent=clean(agentId)||'<agent-id>',server=clean(serverId)||'<node-id>';
    const tags=tagsInput.split(',').map(t=>clean(t)).filter(Boolean);
    const tagsJson=tags.length?`,"tags":[${tags.map(t=>`"${t}"`).join(',')}]`:'';
    const base='https://gaurdian-net.s3.us-east-1.amazonaws.com/agent/latest';
    const tenant=enrollment?.tenantId??'<tenant-id>',token=enrollment?.enrollmentToken??'<enrollment-token-from-your-deployment-secret>';
    return {
      install:`curl -fsSLo guardian '${base}/guardian-linux-${platform}'\nsudo install -m 0755 guardian /usr/local/bin/guardian\nsudo install -d -m 0750 /etc/guardian /var/lib/guardian\ncurl -fsSLo /tmp/guardian.service '${base}/guardian.service'\nsudo install -m 0644 /tmp/guardian.service /etc/systemd/system/guardian.service\ncurl -fsSLo /etc/guardian/config.example.yaml '${base}/config.example.yaml'`,
      config:`sudo cp /etc/guardian/config.example.yaml /etc/guardian/config.yaml\n# Edit /etc/guardian/config.yaml and set:\n# server.id: ${server}\n# server.tenant: ${tenant}\n# logs.apache_access: your Apache access-log path\nsudo guardian test-config --config /etc/guardian/config.yaml`,
      enroll:`curl --fail-with-body -X POST "${typeof window==='undefined'?'http://localhost':window.location.origin}/api/v1/agents/heartbeat" \\\n  -H "Authorization: Bearer ${tenant}.${agent}.${token}" \\\n  -H 'Content-Type: application/json' \\\n  --data '{"server_id":"${server}"${tagsJson}}'\nsudo systemctl daemon-reload\nsudo systemctl enable --now guardian`,
    };
  },[agentId,serverId,tagsInput,platform,enrollment]);
  async function copy(name:string,value:string){await navigator.clipboard.writeText(value);setCopied(name);setTimeout(()=>setCopied(''),1600)}
  function close(){setOpen(false);onAdded()}
  return <><button className="button primary" onClick={begin}>Add node</button>{open&&<div className="g-modal-backdrop" role="presentation" onMouseDown={close}><section className="g-modal" role="dialog" aria-modal="true" aria-labelledby="add-node-title" onMouseDown={e=>e.stopPropagation()}>
    <header className="g-modal-header"><div><div className="eyebrow">Agent onboarding</div><h2 id="add-node-title">Add a node</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></header>
    {atLimit?<>
      <div className="notice"><strong>Node limit reached</strong><span>Your current plan includes up to {FREE_NODE_LIMIT} nodes. Upgrade to Scale for up to 50 nodes.</span></div>
      <a className="button primary" href="/settings?tab=Billing">Upgrade plan</a>
    </>:<>
    {error&&<div className="notice"><strong>Enrollment unavailable</strong><span>{error}</span></div>}
    <div className="notice"><strong>Outbound-only enrollment</strong><span>This enrollment credential is scoped to your organization. Keep it in a secret manager or root-only environment. Never paste it into source control or screenshots.</span></div>
    <div className="form-grid"><Field label="Node ID" value={serverId} set={setServerId}/><Field label="Agent ID" value={agentId} set={setAgentId}/><label>Tags (optional, comma-separated)<input value={tagsInput} placeholder="web-tier, prod, us-east-1" onChange={e=>setTagsInput(e.target.value)}/></label><label>Linux architecture<select value={platform} onChange={e=>setPlatform(e.target.value as 'amd64'|'arm64')}><option value="amd64">x86_64 / amd64</option><option value="arm64">ARM64</option></select></label></div>
    <ol className="steps"><Step number="1" title="Download and install" command={commands.install} copied={copied==='install'} onCopy={()=>copy('install',commands.install)}/><Step number="2" title="Configure log access" command={commands.config} copied={copied==='config'} onCopy={()=>copy('config',commands.config)}/><Step number="3" title="Send the first heartbeat" command={commands.enroll} copied={copied==='enroll'} onCopy={()=>copy('enroll',commands.enroll)}/></ol>
    <p className="muted small">Confirm the configured log paths are readable, then use <code>journalctl -u guardian</code> to inspect startup. The node appears in the list below after its first heartbeat.</p>
    </>}
  </section></div>}</>
}
function Field({label,value,set,placeholder}:{label:string;value:string;set:(v:string)=>void;placeholder?:string}){return <label>{label}<input value={value} placeholder={placeholder} onChange={e=>set(clean(e.target.value))}/></label>}
function Step({number,title,command,copied,onCopy}:{number:string;title:string;command:string;copied:boolean;onCopy:()=>void}){return <li><div className="step-title"><span>{number}</span><strong>{title}</strong><button className="copy-button" onClick={onCopy}>{copied?'Copied':'Copy'}</button></div><pre><code>{command}</code></pre></li>}
