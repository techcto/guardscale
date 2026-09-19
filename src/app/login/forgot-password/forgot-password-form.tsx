'use client';
import {FormEvent, useState} from 'react';

export default function ForgotPasswordForm(){
  const [sent,setSent]=useState(false),[busy,setBusy]=useState(false),[devLink,setDevLink]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    const data=new FormData(e.currentTarget);
    const res=await fetch('/api/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:data.get('username')})});
    const body=await res.json().catch(()=>({}));
    setBusy(false);
    setSent(true);
    if(body.resetLink)setDevLink(body.resetLink);
  }
  if(sent)return <div className="notice"><strong>Check your email</strong><span>If that account exists, a password reset link has been sent and expires in 15 minutes.</span>{devLink&&<span className="muted small">Local/log notification mode — reset link: <a href={devLink}>{devLink}</a></span>}</div>;
  return <form className="login-form" onSubmit={submit}>
    <label>Username<input name="username" autoComplete="username" required autoFocus/></label>
    <button className="button primary" disabled={busy}>{busy?'Please wait…':'Send reset link'}</button>
  </form>;
}
