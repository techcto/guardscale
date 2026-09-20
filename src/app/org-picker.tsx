'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';

type OrgSummary={id:string;name:string;orgType:'personal'|'business';role:string};

export default function OrgPicker({activeOrgId,activeOrgName,isRoot}:{activeOrgId:string;activeOrgName:string;isRoot:boolean}){
  const [open,setOpen]=useState(false);
  const [orgs,setOrgs]=useState<OrgSummary[]|null>(null);
  const [busy,setBusy]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onClick(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as globalThis.Node))setOpen(false)}
    document.addEventListener('mousedown',onClick);
    return ()=>document.removeEventListener('mousedown',onClick);
  },[]);
  function load(){fetch('/api/orgs').then(r=>r.ok?r.json():[]).then(setOrgs)}
  async function switchTo(orgId:string){
    if(orgId===activeOrgId||busy)return;
    setBusy(true);
    const r=await fetch('/api/orgs/active',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orgId})});
    setBusy(false);
    if(r.ok)window.location.assign('/');
  }
  return <div className="org-picker position-relative" ref={ref}>
    <button className="org-picker-button" type="button" onClick={()=>{setOpen(o=>!o);if(!orgs)load()}} aria-haspopup="menu" aria-expanded={open}>
      {activeOrgName}<span className="muted small">workspace ▾</span>
    </button>
    {open&&<div className="org-picker-popover" role="menu">
      {orgs===null&&<p className="muted small">Loading…</p>}
      {orgs?.length===0&&<p className="muted small">No organizations yet.</p>}
      {orgs?.map(o=><button key={o.id} type="button" className={`org-picker-item${o.id===activeOrgId?' active':''}`} role="menuitem" disabled={busy} onClick={()=>switchTo(o.id)}>
        <span>{o.name}</span><span className="muted small">{o.orgType}</span>
      </button>)}
      {isRoot&&<Link className="org-picker-item" href="/settings?tab=Organizations" role="menuitem" onClick={()=>setOpen(false)}>+ Add organization</Link>}
    </div>}
  </div>;
}
