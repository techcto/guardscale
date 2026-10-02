'use client';

import {useEffect,useMemo,useState} from 'react';

export default function AddNode({nodeCount,onAdded}:{nodeCount:number;onAdded:()=>void}){
  const [open,setOpen]=useState(false),[copied,setCopied]=useState('');
  const [enrollment,setEnrollment]=useState<{tenantId:string;enrollmentToken:string}|null>(null),[error,setError]=useState('');
  const [serverLimit,setServerLimit]=useState<number|null>(null);
  useEffect(()=>{let active=true;fetch('/api/v1/billing/plan').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setServerLimit(data.serverLimit)});return()=>{active=false}},[]);
  const atLimit=serverLimit!==null&&nodeCount>=serverLimit;
  async function begin(){
    if(atLimit){setOpen(true);return}
    setError('');
    const r=await fetch('/api/v1/nodes/enrollment');
    if(!r.ok){setError('Unable to issue an enrollment credential for this account.');setOpen(true);return}
    setEnrollment(await r.json());
    setOpen(true);
  }
  const commands=useMemo(()=>{
    const base='https://guardscale.s3.us-east-1.amazonaws.com/agent/latest';
    const tenant=enrollment?.tenantId??'<tenant-id>',token=enrollment?.enrollmentToken??'<enrollment-token-from-your-deployment-secret>';
    return {
      bootstrap:`curl -fsSLo /tmp/install-guardscale.sh '${base}/install-agent.sh'\nsudo bash /tmp/install-guardscale.sh --enrollment-key '${tenant}.${token}'`,
      verify:`sudo systemctl --no-pager --full status guardscale\nsudo journalctl -u guardscale -n 100 --no-pager\nsudo journalctl -u guardscale -f`,
      identity:`sudo grep -E '^(  id:|  agent_id:)' /etc/guardscale/config.yaml\ncurl -fsS http://localhost/ >/dev/null || true\n# Activity and heartbeat should appear on this node's detail page within 30 seconds.`,
    };
  },[enrollment]);
  async function copy(name:string,value:string){await navigator.clipboard.writeText(value);setCopied(name);setTimeout(()=>setCopied(''),1600)}
  function close(){setOpen(false);onAdded()}
  return <><button className="button primary" onClick={begin}>Add node</button>{open&&<div className="g-modal-backdrop" role="presentation" onMouseDown={close}><section className="g-modal" role="dialog" aria-modal="true" aria-labelledby="add-node-title" onMouseDown={e=>e.stopPropagation()}>
    <header className="g-modal-header"><div><div className="eyebrow">Agent onboarding</div><h2 id="add-node-title">Add a node</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></header>
    {atLimit?<>
      <div className="notice"><strong>Node limit reached</strong><span>Your current plan includes up to {serverLimit} node{serverLimit===1?'':'s'}. Upgrade for a higher limit.</span></div>
      <a className="button primary" href="/settings/billing">Upgrade plan</a>
    </>:<>
    {error&&<div className="notice"><strong>Enrollment unavailable</strong><span>{error}</span></div>}
    <div className="notice"><strong>Fleet-ready enrollment</strong><span>Use this same command on one instance or thousands. Each EC2 instance derives a stable node ID from IMDSv2 and creates its own agent ID. The installer also detects amd64 or arm64 automatically.</span></div>
    <div className="notice"><strong>Protect this command</strong><span>The enrollment key is scoped to your organization. Store it in your deployment secret manager and never place it in an AMI, source control, build log, or screenshot.</span></div>
    <ol className="steps"><Step number="1" title="Copy, paste, and run" command={commands.bootstrap} copied={copied==='bootstrap'} onCopy={()=>copy('bootstrap',commands.bootstrap)}/><Step number="2" title="Verify service and follow logs" command={commands.verify} copied={copied==='verify'} onCopy={()=>copy('verify',commands.verify)}/><Step number="3" title="Confirm identity and live activity" command={commands.identity} copied={copied==='identity'} onCopy={()=>copy('identity',commands.identity)}/></ol>
    <p className="muted small">The service starts automatically and survives reboot. GuardScale reports a heartbeat every 30 seconds and sends at most one sanitized activity signal per second. Raw logs remain on the node.</p>
    </>}
  </section></div>}</>
}
function Step({number,title,command,copied,onCopy}:{number:string;title:string;command:string;copied:boolean;onCopy:()=>void}){return <li><div className="step-title"><span>{number}</span><strong>{title}</strong><button className="copy-button" onClick={onCopy}>{copied?'Copied':'Copy'}</button></div><pre><code>{command}</code></pre></li>}
