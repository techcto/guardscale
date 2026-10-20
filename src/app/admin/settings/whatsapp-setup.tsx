'use client';
import {useState} from 'react';
export default function WhatsAppSetup(){
 const [recipient,setRecipient]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function check(test=false){
  setBusy(true);
  try{
   const response=await fetch('/api/admin/whatsapp'+(test?'':'?verify=true'),test?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'test',recipient})}:undefined);
   const data=await response.json();if(!response.ok)throw new Error(data.error??'Check failed');
   setStatus(test?data.message:data.error??(data.inspection?`Sender registered: ${data.inspection.registered?'yes':'no'}. SNS destination matches: ${data.inspection.routing?'yes':'no'}. Approved template: ${data.inspection.template?'yes':'no'}. `:'')+(data.verifiedAt?'A recipient reply has been verified.':'Reply path not verified. Send a test and reply with its Verify code, then check again.'));
  }catch(error){setStatus(error instanceof Error?error.message:'Check failed')}finally{setBusy(false)}
 }
 return <section className="g-card"><h2>Messaging verification</h2>
  <p>Register your WhatsApp sender and verify your SES email identity before launch. Supply the sender ID, email From address, event topic and template through CloudFormation. Change them by updating the stack, not organization settings.</p>
  <p>Manage authorized recipients under Settings → Notifications. This page only checks configuration and tests the WhatsApp reply path.</p>
  <button className="button" disabled={busy} onClick={()=>check()}>Check launch configuration</button>
  <label className="field">Saved organization recipient<input placeholder="+15551234567" value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
  <button className="button" disabled={busy||!recipient} onClick={()=>check(true)}>Send WhatsApp reply test</button>
  <p className="muted small">After replying with the Verify code, check again. Provider acceptance is not delivery confirmation. Email tests are under Settings → Notifications.</p>
  {status&&<p role="status">{status}</p>}
 </section>;
}
