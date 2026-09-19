'use client';

import {useMemo,useState} from 'react';

const safeId=(prefix:string)=>`${prefix}-${crypto.randomUUID().slice(0,8)}`;
const clean=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,64);

export default function AddServer(){
  const [open,setOpen]=useState(false),[tenantId,setTenantId]=useState(''),[agentId,setAgentId]=useState(''),[serverId,setServerId]=useState('');
  const [platform,setPlatform]=useState<'amd64'|'arm64'>('amd64'),[copied,setCopied]=useState('');
  function begin(){if(!tenantId)setTenantId(safeId('tenant'));if(!agentId)setAgentId(safeId('agent'));if(!serverId)setServerId(safeId('server'));setOpen(true)}
  const commands=useMemo(()=>{
    const tenant=clean(tenantId)||'<tenant-id>',agent=clean(agentId)||'<agent-id>',server=clean(serverId)||'<server-id>';
    const base='https://gaurdian-us.s3.us-east-1.amazonaws.com/agent/latest';
    return {
      install:`curl -fsSLo guardian '${base}/guardian-linux-${platform}'\nsudo install -m 0755 guardian /usr/local/bin/guardian\nsudo install -d -m 0750 /etc/guardian /var/lib/guardian\ncurl -fsSLo /tmp/guardian.service '${base}/guardian.service'\nsudo install -m 0644 /tmp/guardian.service /etc/systemd/system/guardian.service\ncurl -fsSLo /etc/guardian/config.example.yaml '${base}/config.example.yaml'`,
      config:`sudo cp /etc/guardian/config.example.yaml /etc/guardian/config.yaml\n# Edit /etc/guardian/config.yaml and set:\n# server.id: ${server}\n# server.tenant: ${tenant}\n# logs.apache_access: your Apache access-log path\nsudo guardian test-config --config /etc/guardian/config.yaml`,
      enroll:`export GUARDIAN_AGENT_TOKEN='<token-from-your-deployment-secret>'\ncurl --fail-with-body -X POST "${typeof window==='undefined'?'http://localhost':window.location.origin}/api/v1/agents/heartbeat" \\\n  -H "Authorization: Bearer ${tenant}.${agent}.$GUARDIAN_AGENT_TOKEN" \\\n  -H 'Content-Type: application/json' \\\n  --data '{"server_id":"${server}"}'\nsudo systemctl daemon-reload\nsudo systemctl enable --now guardian`,
    };
  },[tenantId,agentId,serverId,platform]);
  async function copy(name:string,value:string){await navigator.clipboard.writeText(value);setCopied(name);setTimeout(()=>setCopied(''),1600)}
  return <><button className="button primary" onClick={begin}>Add server</button>{open&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-server-title" onMouseDown={e=>e.stopPropagation()}>
    <header className="modal-header"><div><div className="eyebrow">Agent onboarding</div><h2 id="add-server-title">Add a server</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setOpen(false)}>×</button></header>
    <div className="notice"><strong>Outbound-only enrollment</strong><span>Keep the agent token in a secret manager or root-only environment. Never paste it into source control or screenshots.</span></div>
    <div className="form-grid"><Field label="Tenant ID" value={tenantId} set={setTenantId}/><Field label="Agent ID" value={agentId} set={setAgentId}/><Field label="Server ID" value={serverId} set={setServerId}/><label>Linux architecture<select value={platform} onChange={e=>setPlatform(e.target.value as 'amd64'|'arm64')}><option value="amd64">x86_64 / amd64</option><option value="arm64">ARM64</option></select></label></div>
    <ol className="steps"><Step number="1" title="Download and install" command={commands.install} copied={copied==='install'} onCopy={()=>copy('install',commands.install)}/><Step number="2" title="Configure log access" command={commands.config} copied={copied==='config'} onCopy={()=>copy('config',commands.config)}/><Step number="3" title="Send the first heartbeat" command={commands.enroll} copied={copied==='enroll'} onCopy={()=>copy('enroll',commands.enroll)}/></ol>
    <p className="muted small">Confirm the configured log paths are readable, then use <code>journalctl -u guardian</code> to inspect startup.</p>
  </section></div>}</>
}
function Field({label,value,set}:{label:string;value:string;set:(v:string)=>void}){return <label>{label}<input value={value} onChange={e=>set(clean(e.target.value))}/></label>}
function Step({number,title,command,copied,onCopy}:{number:string;title:string;command:string;copied:boolean;onCopy:()=>void}){return <li><div className="step-title"><span>{number}</span><strong>{title}</strong><button className="copy-button" onClick={onCopy}>{copied?'Copied':'Copy'}</button></div><pre><code>{command}</code></pre></li>}
