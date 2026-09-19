'use client';
import{FormEvent,useEffect,useState}from'react';import type{GuardianUser}from'@/lib/model';import Drawer,{DrawerBackdrop}from'@/app/drawer';
export default function UsersConsole(){
 const[users,setUsers]=useState<GuardianUser[]>([]),[open,setOpen]=useState(false),[error,setError]=useState('');
 async function load(){const r=await fetch('/api/v1/users');if(r.ok)setUsers(await r.json())}
 useEffect(()=>{let active=true;fetch('/api/v1/users').then(r=>r.ok?r.json():[]).then(data=>{if(active)setUsers(data)});return()=>{active=false}},[]);
 async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),r=await fetch('/api/v1/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:f.get('username'),displayName:f.get('displayName'),password:f.get('password'),role:f.get('role')})});if(!r.ok){setError((await r.json()).error);return}setOpen(false);setError('');void load()}
 async function remove(id:string){if(!confirm('Remove this user?'))return;await fetch(`/api/v1/users/${id}`,{method:'DELETE'});void load()}
 return <section className="card"><div className="section-heading"><div><h2>Team access</h2><p className="muted">The launch-time root operator is managed through deployment secrets and is not listed here.</p></div><button className="button primary" onClick={()=>setOpen(true)}>Add user</button></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id}><td><strong>{u.displayName}</strong><br/><span className="muted">{u.username}</span></td><td>{u.role}</td><td><span className="status">{u.status}</span></td><td><button className="copy-button" onClick={()=>remove(u.id)}>Remove</button></td></tr>):<tr><td colSpan={4} className="empty-state"><strong>No additional users.</strong><span>Add an operator or read-only viewer.</span></td></tr>}</tbody></table></div>
 <DrawerBackdrop open={open} onClose={()=>setOpen(false)}/>
 <Drawer open={open} title="Add user" onClose={()=>setOpen(false)}>
  <form className="drawer-form" onSubmit={add}>
   <label>Display name<input name="displayName" required autoFocus/></label>
   <label>Username<input name="username" required/></label>
   <label>Temporary password<input name="password" type="password" minLength={12} required/></label>
   <label>Role<select name="role"><option value="operator">Operator</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <button className="button primary" type="submit">Create</button>
  </form>
 </Drawer>
 </section>
}
