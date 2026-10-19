'use client';
import {useState} from 'react';
export default function OpenOrganization({orgId}:{orgId:string}){
  const [busy,setBusy]=useState(false);
  async function switchTo(){
    setBusy(true);
    const r=await fetch('/api/orgs/active',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({orgId})});
    if(r.ok)window.location.assign('/console');else setBusy(false);
  }
  return <button className="btn button btn-light" disabled={busy} onClick={switchTo}>Open organization console</button>;
}
