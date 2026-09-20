'use client';
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
  return <div className="user-menu" ref={ref}>
    {open&&<div className="user-menu-popover">
      <div className="user-menu-name">{displayName}</div>
      <div className="muted small">{role}</div>
      <button className="user-menu-logout" onClick={logout}>Log out</button>
    </div>}
    <button className="user-menu-button" type="button" onClick={()=>setOpen(o=>!o)}>
      <span className="user-menu-avatar">{displayName.slice(0,1).toUpperCase()}</span>
      <span className="user-menu-label"><strong>{displayName}</strong><span className="muted small">{role}</span></span>
    </button>
  </div>;
}
