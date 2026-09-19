'use client';
import {ReactNode, useEffect} from 'react';

export default function Drawer({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
  useEffect(()=>{
    if(!open)return;
    function onKey(e:KeyboardEvent){if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open,onClose]);
  return <div className={`offcanvas offcanvas-end guardian-drawer${open?' show':''}`} tabIndex={-1} aria-hidden={!open} style={{visibility:open?'visible':'hidden'}}>
    <div className="offcanvas-header">
      <h5 className="offcanvas-title">{title}</h5>
      <button type="button" className="btn-close" aria-label="Close" onClick={onClose}/>
    </div>
    <div className="offcanvas-body">{children}</div>
  </div>;
}

export function DrawerBackdrop({open,onClose}:{open:boolean;onClose:()=>void}){
  if(!open)return null;
  return <div className="offcanvas-backdrop fade show" onClick={onClose}/>;
}
