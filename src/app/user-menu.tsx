'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';

export default function UserMenu({id,displayName,role}:{id:string;displayName:string;role:string}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onClick(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as globalThis.Node))setOpen(false)}
    document.addEventListener('mousedown',onClick);
    return ()=>document.removeEventListener('mousedown',onClick);
  },[]);
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});window.location.href='/login'}
  const avatar=<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-9 2.2-9 5v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2c0-2.8-4.6-5-9-5Z"/></svg>;
  return <div className="user-menu position-relative" ref={ref}>
    <button className="user-menu-button" type="button" onClick={()=>setOpen(o=>!o)} aria-haspopup="menu" aria-expanded={open}>
      <span className="user-menu-avatar">{avatar}</span>
    </button>
    {open&&<div className="user-menu-popover" role="menu">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="user-menu-avatar user-menu-avatar-lg">{avatar}</span>
        <div className="overflow-hidden">
          <div className="user-menu-name">{displayName}</div>
          <div className="muted small">{role}</div>
        </div>
      </div>
      <Link className="user-menu-item" href={`/users/${id}`} role="menuitem" onClick={()=>setOpen(false)}>Profile</Link>
      <Link className="user-menu-item" href="/settings" role="menuitem" onClick={()=>setOpen(false)}>Settings</Link>
      <button className="user-menu-item user-menu-logout" role="menuitem" onClick={logout}>Log out</button>
    </div>}
  </div>;
}
