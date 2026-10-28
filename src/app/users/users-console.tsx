'use client';
import{FormEvent,useEffect,useState}from'react';import Link from'next/link';import {useRouter} from'next/navigation';import type{MembershipRole}from'@/lib/model';import Drawer,{DrawerBackdrop}from'@/app/drawer';
type OrgMember={id:string;username:string;displayName:string;role:MembershipRole;status:'active'|'disabled'};
export default function UsersConsole(){
 const router=useRouter();
 const[users,setUsers]=useState<OrgMember[]>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 const[mode,setMode]=useState<'existing'|'new'>('existing'),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/v1/users');if(r.ok)setUsers(await r.json())}
 useEffect(()=>{let active=true;fetch('/api/v1/users').then(r=>r.ok?r.json():[]).then(data=>{if(active)setUsers(data)});return()=>{active=false}},[]);
 async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const r=await fetch('/api/v1/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,email:f.get('email'),role:f.get('role'),...(mode==='new'?{displayName:f.get('displayName'),password:f.get('password')}:{})})});const result=await r.json();if(!r.ok){setError(result.error??'Unable to add user');return}setOpen(false);void load()}catch{setError('Unable to add user. Please try again.')}finally{setBusy(false)}}
 async function remove(id:string){if(!confirm('Remove this user?'))return;await fetch(`/api/v1/users/${id}`,{method:'DELETE'});void load()}
 return <section className="g-card"><div className="section-heading"><div><h2>Team access</h2><p className="muted">The launch-time root operator is managed through deployment secrets and is not listed here.</p></div><button className="button primary" onClick={()=>setOpen(true)}>Add user</button></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id} className="row-link" onClick={()=>router.push(`/users/${u.id}`)}><td><Link href={`/users/${u.id}`}><strong>{u.displayName}</strong></Link><br/><span className="muted">{u.username}</span></td><td>{u.role}</td><td><span className="status">{u.status}</span></td><td><button className="copy-button" onClick={e=>{e.stopPropagation();void remove(u.id)}}>Remove</button></td></tr>):<tr><td colSpan={4} className="empty-state"><strong>No additional users.</strong><span>Add an operator or read-only viewer.</span></td></tr>}</tbody></table></div>
 <DrawerBackdrop open={open} onClose={()=>setOpen(false)}/>
 <Drawer open={open} title="Add user" onClose={()=>setOpen(false)}>
  <form className="drawer-form" onSubmit={add}>
   <label>User account<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as 'existing'|'new');setError('')}}><option value="existing">Existing user</option><option value="new">New user</option></select></label>
   <p className="muted small">{mode==='existing'?'Add an existing GuardScale account to this organization. They keep their current login and can switch organizations after signing in.':'Create a new account. In SaaS mode, they must verify their email before signing in.'}</p>
   {mode==='new'&&<label>Display name<input name="displayName" required maxLength={100}/></label>}<label>Email<input name="email" type="email" autoComplete="off" required autoFocus/></label>
   {mode==='new'&&<label>Temporary password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required/></label>}
   <label>Role<select name="role"><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <button className="button primary" type="submit" disabled={busy}>{busy?'Adding…':mode==='existing'?'Add to organization':'Create user'}</button>
  </form>
 </Drawer>
 </section>
}
