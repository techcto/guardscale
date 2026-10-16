'use client';

import {useEffect,useMemo,useState} from 'react';

export default function AddNode({nodeCount,onAdded,initialProvider,existingServerId,existingAgentId}:{nodeCount:number;onAdded:()=>void;initialProvider?:string|null;existingServerId?:string;existingAgentId?:string}){
  const [provider,setProvider]=useState(initialProvider==='ec2'?'ec2':'linux');
  const [open,setOpen]=useState(false),[copied,setCopied]=useState('');
  const [enrollment,setEnrollment]=useState<{tenantId:string;enrollmentToken:string}|null>(null),[error,setError]=useState('');
  const [serverLimit,setServerLimit]=useState<number|null>(null);
  const [controlUrl,setControlUrl]=useState('');
  useEffect(()=>{let active=true;fetch('/api/v1/billing/plan').then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setServerLimit(data.serverLimit)});return()=>{active=false}},[]);
  const atLimit=!existingServerId&&serverLimit!==null&&nodeCount>=serverLimit;
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
      bootstrap:`curl -fsSLo /tmp/install-guardscale.sh '${base}/install-agent.sh'\n# Review the downloaded installer before running it with sudo.\nsudo env GUARDSCALE_URL='${/^https?:\/\/[a-zA-Z0-9.:/-]+$/.test(controlUrl)?controlUrl:'<reachable-guardscale-url>'}' ${existingServerId&&/^[a-zA-Z0-9_-]+$/.test(existingServerId)?`GUARDSCALE_NODE_ID='${existingServerId}' GUARDSCALE_AGENT_ID='${existingAgentId&&/^[a-zA-Z0-9_-]+$/.test(existingAgentId)?existingAgentId:'agent-'+existingServerId}' `:''}bash /tmp/install-guardscale.sh --enrollment-key '${tenant}.${token}'`,
      verify:`sudo systemctl --no-pager --full status guardscale\nsudo journalctl -u guardscale -n 100 --no-pager\nsudo journalctl -u guardscale -f`,
      diagnostics:`sudo guardscale diagnostics --config /etc/guardscale/config.yaml\n# PHP needs log_errors=On and a writable error_log path.\n# Configure logs.php_error and logs.php_slow in /etc/guardscale/config.yaml.\n# Restart guardscale after changing log paths.`,
      identity:`sudo grep -E '^(  id:|  agent_id:)' /etc/guardscale/config.yaml\ncurl -fsS http://localhost/ >/dev/null || true\n# Activity and heartbeat should appear on this server's detail page within 30 seconds.`,
    };
  },[enrollment,controlUrl,existingServerId,existingAgentId]);
  async function copy(name:string,value:string){await navigator.clipboard.writeText(value);setCopied(name);setTimeout(()=>setCopied(''),1600)}
  function close(){setOpen(false);onAdded()}
  return <><button className="button primary" onClick={begin}>{existingServerId?"Connection settings":"Connect server"}</button>{open&&<div className="g-modal-backdrop" role="presentation" onMouseDown={close}><section className="g-modal" role="dialog" aria-modal="true" aria-labelledby="add-node-title" onMouseDown={e=>e.stopPropagation()}>
    <header className="g-modal-header"><div><div className="eyebrow">{existingServerId?'Agent connection':'Agent onboarding'}</div><h2 id="add-node-title">{existingServerId?"Update or reconnect this server":"Connect a server"}</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></header>
    {atLimit?<>
      <div className="notice"><strong>Server limit reached</strong><span>Your current plan includes up to {serverLimit} server{serverLimit===1?'':'s'}. Upgrade for a higher limit.</span></div>
      <a className="button primary" href="/settings/billing">Upgrade plan</a>
    </>:<>
    {error&&<div className="notice"><strong>Enrollment unavailable</strong><span>{error}</span><button className="button" onClick={begin}>Retry enrollment</button></div>}
    {!enrollment&&!error&&<p role="status" className="muted">Preparing secure installation commands…</p>}
    {existingServerId&&<div className="notice"><strong>Reconnect existing identity</strong><span>This command preserves this server and agent ID. Updating replaces the installed binary and resets configuration from the release template. Back up /etc/guardscale/config.yaml and restore custom log paths and protection settings afterward.</span></div>}
    <div className="notice"><strong>Fleet-ready enrollment</strong><span>Use this same command on one instance or thousands. Each EC2 instance derives a stable node ID from IMDSv2 and creates its own agent ID. The installer also detects amd64 or arm64 automatically.</span></div>
    <div className="notice"><strong>Protect this command</strong><span>The enrollment key is scoped to your organization. Store it in your deployment secret manager and never place it in an AMI, source control, build log, or screenshot.</span></div>
    <label className="field">Hosting provider<select className="form-select mt-2" value={provider} onChange={e=>setProvider(e.target.value)}><option value="ec2">Amazon EC2</option><option value="linux">Linux server / other cloud</option></select></label><p className="muted small mt-3">{provider==='ec2'?'Open an SSH or Systems Manager session on the EC2 instance. Enable IMDSv2 for automatic instance identity; no AWS API keys are needed.':'Open an SSH session on your Linux VM or physical server. A stable identity is derived from its machine ID.'} Requires sudo, systemd, Bash, curl, and outbound HTTPS.</p>
    <label className="field">GuardScale URL reachable from this server<input value={controlUrl} onChange={e=>setControlUrl(e.target.value)} placeholder="https://your-guardscale-host"/></label><p className="muted small">Use this installation’s HTTPS URL, reachable from the server. Enrollment credentials must belong to the same installation.</p>
    {enrollment&&!error&&<ol className="steps"><Step number="1" title="Review and run on your server" command={commands.bootstrap} copied={copied==='bootstrap'} onCopy={()=>copy('bootstrap',commands.bootstrap)}/><Step number="2" title="Verify service and follow logs" command={commands.verify} copied={copied==='verify'} onCopy={()=>copy('verify',commands.verify)}/><Step number="3" title="Confirm identity and live activity" command={commands.identity} copied={copied==='identity'} onCopy={()=>copy('identity',commands.identity)}/><Step number="4" title="Check Apache and PHP log collection" command={commands.diagnostics} copied={copied==='diagnostics'} onCopy={()=>copy('diagnostics',commands.diagnostics)}/></ol>}
    <p className="muted small">The agent starts automatically at boot. This server appears after its first authenticated heartbeat.</p>
    {existingServerId&&<details aria-label="Stop or disable agent" style={{marginTop:28,borderTop:'2px solid #dc3545',paddingTop:16}}>
      <summary style={{color:'#a12633',fontWeight:700,cursor:'pointer'}}>Stop or disable agent</summary>
      <p className="muted small mt-3">Run these on the server, not the GuardScale control plane. Stopping interrupts log collection and protection commands; this does not uninstall the agent or delete saved history. Existing temporary blocks retain their expiry.</p>
      <div style={{background:'#fff5f5',border:'1px solid #f1c5cb',borderRadius:10,padding:14,marginBottom:14}}>
        <div className="step-title"><strong style={{color:'#a12633'}}>Stop now and disable startup at boot</strong><button className="copy-button" onClick={()=>copy('disable','sudo systemctl disable --now guardscale')}>{copied==='disable'?'Copied':'Copy disable command'}</button></div>
        <pre style={{borderColor:'#f1c5cb',background:'#fffafa'}}><code>sudo systemctl disable --now guardscale</code></pre>
      </div>
      <p className="small">Stop only until restarted or the next boot: <code>sudo systemctl stop guardscale</code></p>
      <p className="small">Re-enable and start: <code>sudo systemctl enable --now guardscale</code></p>
      <p className="muted small">Health becomes stale after the configured heartbeat timeout. Use Delete server separately to retire its identity.</p>
    </details>}
    </>}
  </section></div>}</>
}
function Step({number,title,command,copied,onCopy}:{number:string;title:string;command:string;copied:boolean;onCopy:()=>void}){return <li><div className="step-title"><span>{number}</span><strong>{title}</strong><button className="copy-button" onClick={onCopy}>{copied?'Copied':'Copy'}</button></div><pre><code>{command}</code></pre></li>}
