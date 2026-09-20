'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';

export default function UserMenu({displayName,role}:{displayName:string;role:string}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onClick(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as globalThis.Node))setOpen(false)}
    document.addEventListener('mousedown',onClick);
    return ()=>document.removeEventListener('mousedown',onClick);
  },[]);
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});window.location.href='/login'}
  return <div className="user-menu position-relative" ref={ref}>
    <button className="user-menu-button" type="button" onClick={()=>setOpen(o=>!o)} aria-haspopup="menu" aria-expanded={open}>
      <span className="user-menu-avatar">{displayName.slice(0,1).toUpperCase()}</span>
    </button>
    {open&&<div className="user-menu-popover" role="menu">
      <div className="user-menu-name">{displayName}</div>
      <div className="muted small mb-2">{role}</div>
      <Link className="user-menu-item" href="/settings" role="menuitem" onClick={()=>setOpen(false)}>Settings</Link>
      <button className="user-menu-item user-menu-logout" role="menuitem" onClick={logout}>Log out</button>
    </div>}
  </div>;
}
