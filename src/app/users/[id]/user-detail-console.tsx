'use client';
import{useEffect,useState}from'react';import {useRouter} from'next/navigation';import Link from'next/link';import type{MembershipRole}from'@/lib/model';

type OrgMember={id:string;username:string;displayName:string;role:MembershipRole;status:'active'|'disabled';createdAt:string};

export default function UserDetailConsole({userId}:{userId:string}){
  const router=useRouter();
  const[user,setUser]=useState<OrgMember|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  function load(){return fetch(`/api/v1/users/${userId}`).then(r=>r.ok?r.json().then(setUser):Promise.resolve(setError('This user was not found.')))}
  useEffect(()=>{void load()},[userId]);
  async function patch(patch:Partial<{role:MembershipRole;status:'active'|'disabled'}>){
    setBusy(true);setError('');
    const r=await fetch(`/api/v1/users/${userId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
    setBusy(false);
    if(!r.ok){setError((await r.json()).error??'Unable to update user');return}
    setUser(await r.json());setSaved(true);setTimeout(()=>setSaved(false),1500);
  }
  async function remove(){
    if(!confirm('Remove this user? This cannot be undone.'))return;
    setBusy(true);setError('');
    const r=await fetch(`/api/v1/users/${userId}`,{method:'DELETE'});
    setBusy(false);
    if(!r.ok){setError((await r.json()).error??'Unable to remove user');return}
    router.replace('/users');
  }
  if(error&&!user)return <main><section className="hero"><div className="eyebrow">User</div><h1>{userId}</h1></section><div className="g-card"><p className="muted">{error}</p><Link href="/users">Back to users</Link></div></main>;
  if(!user)return <main><section className="hero"><div className="eyebrow">User</div><h1>{userId}</h1></section></main>;
  return <main>
    <section className="hero compact-hero">
      <div><div className="eyebrow">User</div><h1>{user.displayName}</h1><p className="muted page-intro">{user.username} · joined {new Date(user.createdAt).toLocaleDateString()}</p></div>
      <span className={`status${user.status==='active'?'':' neutral'}`}>{user.status}</span>
    </section>
    <section className="g-card" style={{marginBottom:16}}>
      <div className="section-heading"><div><h2>Role and access</h2><p className="muted">Changing role or status takes effect on this user&apos;s next request.</p></div></div>
      {error&&<p className="form-error">{error}</p>}
      <div className="form-grid">
        <label>Role<select value={user.role} disabled={busy} onChange={e=>patch({role:e.target.value as MembershipRole})}>
          <option value="admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select></label>
        <label>Status<select value={user.status} disabled={busy} onChange={e=>patch({status:e.target.value as 'active'|'disabled'})}>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select></label>
      </div>
      {saved&&<p className="muted small">Saved.</p>}
    </section>
    <section className="g-card">
      <div className="section-heading"><div><h2>Danger zone</h2><p className="muted">Remove this user&apos;s access entirely.</p></div></div>
      <button className="button" disabled={busy} onClick={remove}>Remove user</button>
    </section>
  </main>;
}
