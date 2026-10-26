'use client';
import {useEffect, useState} from 'react';
// Posts the token once the page runs in a browser, as Osirus's /account/verify page does.
export default function VerifyEmail({token}:{token:string}){
  const [error,setError]=useState(token?'':'This verification link is incomplete. Sign in to request a new one.');
  useEffect(()=>{
    if(!token)return;
    let active=true;
    fetch('/api/auth/verify-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})}).then(async r=>{const body=await r.json().catch(()=>({}));if(!active)return;if(r.ok&&body.redirect)window.location.replace(body.redirect);else setError(body.error??'Unable to verify this link. Sign in to request a new one.')});
    return()=>{active=false};
  },[token]);
  return error?<div className="notice" role="alert"><strong>Verification link not valid</strong><span>{error}</span></div>:<p className="muted" role="status">Confirming your email address…</p>;
}
