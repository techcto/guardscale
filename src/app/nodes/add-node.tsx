'use client';

import {useEffect,useMemo,useState} from 'react';

export default function AddNode({nodeCount,onAdded,initialProvider}:{nodeCount:number;onAdded:()=>void;initialProvider?:string|null}){
  const [provider,setProvider]=useState(initialProvider==='ec2'?'ec2':'linux');
  const [open,setOpen]=useState(false),[copied,setCopied]=useState('');
  const [enrollment,setEnrollment]=useState<{tenantId:string;enrollmentToken:string}|null>(null),[error,setError]=useState('');
  const [serverLimit,setServerLimit]=useState<number|null>(null);
  const [controlUrl,setControlUrl]=useState('');
  useEffect(()=>{let active=true;fetch('/api/v1/billing/plan').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setServerLimit(data.serverLimit)});return()=>{active=false}},[]);
  const atLimit=serverLimit!==null&&nodeCount>=serverLimit;
  async function begin(){
    if(!controlUrl)setControlUrl(window.location.origin);
    if(atLimit){setOpen(true);return}
    setEnrollment(null);
    setError('');
    setOpen(true);
    try{const r=await fetch('/api/v1/nodes/enrollment');
    if(!r.ok){setError(r.status===404?'No active organization. Refresh this page to initialize your GuardScale workspace.':'Your account cannot enroll servers. An organization admin or operator is required.');return}
    setEnrollment(await r.json())}catch{setError('Cannot reach GuardScale. Check your connection and retry.')}
  }
  const commands=useMemo(()=>{
    const base='https://guardscale.s3.us-east-1.amazonaws.com/agent/latest';
    const tenant=enrollment?.tenantId??'<tenant-id>',token=enrollment?.enrollmentToken??'<enrollment-token-from-your-deployment-secret>';
    return {
      bootstrap:`curl -fsSLo /tmp/install-guardscale.sh '${base}/install-agent.sh'\n# Review the downloaded installer before running it with sudo.\nsudo env GUARDSCALE_URL='${/^https?:\/\/[a-zA-Z0-9.:/-]+$/.test(controlUrl)?controlUrl:'<reachable-guardscale-url>'}' bash /tmp/install-guardscale.sh --enrollment-key '${tenant}.${token}'`,
      verify:`sudo systemctl --no-pager --full status guardscale\nsudo journalctl -u guardscale -n 100 --no-pager\nsudo journalctl -u guardscale -f`,
      identity:`sudo grep -E '^(  id:|  agent_id:)' /etc/guardscale/config.yaml\ncurl -fsS http://localhost/ >/dev/null || true\n# Activity and heartbeat should appear on this server's detail page within 30 seconds.`,
    };
  },[enrollment,controlUrl]);
  async function copy(name:string,value:string){await navigator.clipboard.writeText(value);setCopied(name);setTimeout(()=>setCopied(''),1600)}
  function close(){setOpen(false);onAdded()}
  return <><button className="button primary" onClick={begin}>Connect server</button>{open&&<div className="g-modal-backdrop" role="presentation" onMouseDown={close}><section className="g-modal" role="dialog" aria-modal="true" aria-labelledby="add-node-title" onMouseDown={e=>e.stopPropagation()}>
    <header className="g-modal-header"><div><div className="eyebrow">Agent onboarding</div><h2 id="add-node-title">Connect a server</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></header>
    {atLimit?<>
      <div className="notice"><strong>Server limit reached</strong><span>Your current plan includes up to {serverLimit} server{serverLimit===1?'':'s'}. Upgrade for a higher limit.</span></div>
      <a className="button primary" href="/settings/billing">Upgrade plan</a>
    </>:<>
    {error&&<div className="notice"><strong>Enrollment unavailable</strong><span>{error}</span><button className="button" onClick={begin}>Retry enrollment</button></div>}
    <div className="notice"><strong>Fleet-ready enrollment</strong><span>Use this same command on one instance or thousands. Each EC2 instance derives a stable node ID from IMDSv2 and creates its own agent ID. The installer also detects amd64 or arm64 automatically.</span></div>
    <div className="notice"><strong>Protect this command</strong><span>The enrollment key is scoped to your organization. Store it in your deployment secret manager and never place it in an AMI, source control, build log, or screenshot.</span></div>
    <label className="field">Hosting provider<select className="form-select mt-2" value={provider} onChange={e=>setProvider(e.target.value)}><option value="ec2">Amazon EC2</option><option value="linux">Linux server / other cloud</option></select></label><p className="muted small mt-3">{provider==='ec2'?'Open an SSH or Systems Manager session on the EC2 instance. Enable IMDSv2 for automatic instance identity; no AWS API keys are needed.':'Open an SSH session on your Linux VM or physical server. A stable identity is derived from its machine ID.'} Requires sudo, systemd, Bash, curl, and outbound HTTPS. For localhost testing, remote servers need a reachable control-plane URL, not your browser’s localhost address.</p>
    <label className="field">GuardScale URL reachable from this server<input value={controlUrl} onChange={e=>setControlUrl(e.target.value)} placeholder="https://your-guardscale-host"/></label><p className="muted small">An EC2 instance cannot reach this computer using localhost. Use a reachable HTTPS tunnel for this local preview, or the URL of the deployed GuardScale installation. Enrollment credentials must come from that same installation.</p>
    {enrollment&&!error&&<ol className="steps"><Step number="1" title="Review and run on your server" command={commands.bootstrap} copied={copied==='bootstrap'} onCopy={()=>copy('bootstrap',commands.bootstrap)}/><Step number="2" title="Verify service and follow logs" command={commands.verify} copied={copied==='verify'} onCopy={()=>copy('verify',commands.verify)}/><Step number="3" title="Confirm identity and live activity" command={commands.identity} copied={copied==='identity'} onCopy={()=>copy('identity',commands.identity)}/></ol>}
    <p className="muted small">The service starts automatically and survives reboot. Registration completes when the agent sends its first heartbeat. Agent capabilities depend on the installed release; the updated collector batches sanitized Apache and PHP entries instead of forwarding original log files.</p>
    </>}
  </section></div>}</>
}
function Step({number,title,command,copied,onCopy}:{number:string;title:string;command:string;copied:boolean;onCopy:()=>void}){return <li><div className="step-title"><span>{number}</span><strong>{title}</strong><button className="copy-button" onClick={onCopy}>{copied?'Copied':'Copy'}</button></div><pre><code>{command}</code></pre></li>}
