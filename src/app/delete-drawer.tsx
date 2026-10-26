'use client';
import {useState} from 'react';
import type {DeletionImpact} from '@/lib/admin';
import Drawer,{DrawerBackdrop} from './drawer';
// Cloud-style deletion: show what goes with the record, type DELETE to confirm, then delete for real.
export default function DeleteDrawer({impact,url,redirect}:{impact:DeletionImpact;url:string;redirect:string}){
 const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function remove(){
  setBusy(true);setError('');
  const r=await fetch(url,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation})});
  if(r.ok){window.location.assign(redirect);return}
  setError((await r.json()).error);setBusy(false);
 }
 const close=()=>{if(!busy){setOpen(false);setConfirmation('');setError('')}};
 return <>
  <button type="button" className="btn btn-outline-danger" onClick={()=>setOpen(true)}>Delete</button>
  <DrawerBackdrop open={open} onClose={close}/>
  <Drawer open={open} onClose={close} title="Delete">
   {impact.blocker?<p className="alert alert-warning" role="alert">{impact.blocker}</p>:<>
    <p className="text-danger">This action cannot be undone. This will permanently delete this {impact.type} and all of its content: {impact.name}.</p>
    <p className="small text-muted">{impact.subtext}</p>
    {impact.related.filter(r=>r.items.length).map(r=><div key={r.name}><strong className="small">{r.name}</strong><ul className="small">{r.items.map(i=><li key={i}>{i}</li>)}</ul></div>)}
    <label className="form-label" htmlFor="delete-confirmation">Type DELETE to confirm</label>
    <input id="delete-confirmation" className="form-control mb-3" autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/>
    {error&&<p className="alert alert-danger" role="alert">{error}</p>}
    <div className="d-flex gap-2"><button className="btn btn-danger" disabled={busy||confirmation!=='DELETE'} onClick={()=>void remove()}>{busy?'Deleting…':'Delete'}</button><button className="btn btn-outline-secondary" disabled={busy} onClick={close}>Cancel</button></div>
   </>}
  </Drawer>
 </>;
}
