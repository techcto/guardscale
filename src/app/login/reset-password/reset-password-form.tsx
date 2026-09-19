'use client';
import {FormEvent, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';

export default function ResetPasswordForm(){
  const router=useRouter(),token=useSearchParams().get('token')??'';
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setError('');
    const data=new FormData(e.currentTarget);
    const res=await fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password:data.get('password')})});
    setBusy(false);
    if(!res.ok){setError((await res.json()).error??'Unable to reset password');return}
    router.replace('/login');
  }
  if(!token)return <p className="form-error">This reset link is missing its token. Request a new one.</p>;
  return <form className="login-form" onSubmit={submit}>
    <label>New password<input name="password" type="password" minLength={12} autoComplete="new-password" required autoFocus/></label>
    <span className="muted small">Use at least 12 characters.</span>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="button primary" disabled={busy}>{busy?'Please wait…':'Set new password'}</button>
  </form>;
}
