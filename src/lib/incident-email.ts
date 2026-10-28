import {assessmentSummary,type IncidentAlert} from './incident-alert';
import {requestSampleLines} from './request-samples';

const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function reviewLink(value:string|undefined){
 if(!value)return undefined;
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}
}
const button=(label:string,url:string,color='#0078bd')=>`<a href="${escape(url)}" style="display:inline-block;padding:13px 20px;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;">${escape(label)}</a>`;
export function emailText(text:string){return text.replace(/^\*([^*\n]+)\*$/gm,'$1');}
function bodyHTML(text:string){
 return emailText(text).split(/(https?:\/\/[^\s<>"']+)/g).map(part=>{
  const link=part.startsWith('http')?reviewLink(part):undefined;
  return link?`<a href="${escape(link)}" style="color:#0078bd;overflow-wrap:anywhere;">${escape(part)}</a>`:escape(part);
 }).join('').replace(/\n/g,'<br>');
}
function layout(subject:string,content:string){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#edf3f8;color:#07111e;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d1dfeb;border-radius:10px;"><tr><td style="padding:22px 28px;background:#07111e;color:#ffffff;font-size:25px;font-weight:bold;">Guard<span style="color:#65c9ff;">Scale</span></td></tr><tr><td style="padding:28px;">${content}</td></tr><tr><td style="padding:18px 28px;background:#f6f9fc;color:#536a7e;font-size:12px;line-height:1.5;">Evidence first. Human approval. Scoped, temporary response.<br>No action is authorized by opening this email or clicking a compose shortcut.</td></tr></table></td></tr></table></body></html>`;}
export function notificationEmail(subject:string,text:string,reviewUrl?:string){
 const link=reviewLink(reviewUrl);
 return layout(subject,`<h1 style="font-size:25px;line-height:1.3;margin:0 0 20px;">${escape(subject)}</h1><div style="font-size:15px;line-height:1.65;overflow-wrap:anywhere;">${bodyHTML(text)}</div>${link?`<p style="margin:25px 0 0;">${button('Review incident',link)}</p>`:''}`);
}
export function incidentEmail(a:IncidentAlert&{replyTo?:string}){
 const signed=!!a.replyTo&&/^[a-z0-9.+_-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.replyTo);
 const link=reviewLink(a.reviewUrl);
 const actions=([['Protect',`Request a temporary HTTP(S) block of this source for ${a.blockSeconds} seconds.`],['Watch','Continue monitoring without adding a block.'],['Dismiss','Close this incident, stop extensions and request removal of its block.']] as const).filter(([name])=>!a.protectionBlocked||name!=='Protect');
 const date=new Date(a.detectedAt),detected=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC':a.detectedAt;
 const instructions=signed?`REPLY WITH ONE WORD\n\n${actions.map(([name,description])=>name.toUpperCase()+' — '+description).join('\n\n')}\n\nPut the command on the first line, using the address that received this alert. No attachments or image signatures. Approvals expire 15 minutes after detection; the block duration is ${a.blockSeconds} seconds. Wait for agent confirmation.`:'Review this incident in your authenticated GuardScale console. Direct email replies are not enabled for this installation.';
 const samples=requestSampleLines(a.requestSamples),sampleText=samples.length?'\n\nObserved request paths\n'+samples.join('\n')+'\nQuery values omitted. These are observed requests, not proof of an attack.':'';
 const text=`GuardScale | Review server activity\n\n${instructions}\n\nServer: ${a.server}\nSource IP: ${a.source??'Not available'}\nDetected: ${detected}\n\nAssessment\n${assessmentSummary(a)}${sampleText}\n\nReview incident\n${link??'Open the authenticated GuardScale console.'}`;
 const rows=signed?actions.map(([name,description])=>{
  const at=a.replyTo!.lastIndexOf('@'),address=encodeURIComponent(a.replyTo!.slice(0,at))+'@'+a.replyTo!.slice(at+1);
  const url='mailto:'+address+'?subject='+encodeURIComponent('Re: GuardScale: review server activity')+'&body='+encodeURIComponent(name);
  return `<tr><td style="padding:11px 12px 11px 0;vertical-align:top;width:110px;">${button(name,url,name==='Protect'?'#0078bd':'#334d65')}</td><td style="padding:13px 0;font-size:14px;line-height:1.5;">${escape(description)}</td></tr>`;
 }):[];
 const controls=signed?`<div style="padding:20px;background:#eef7ff;border:1px solid #b8d8ef;border-radius:8px;"><h2 style="font-size:21px;margin:0 0 9px;">Reply ${a.protectionBlocked?'Watch or Dismiss':'Protect, Watch or Dismiss'}</h2><p style="font-size:14px;line-height:1.5;margin:0 0 8px;">Choose a shortcut below, or press Reply and type one command on the first line.</p><table role="presentation" cellspacing="0" cellpadding="0" width="100%">${rows.join('')}</table><p style="font-size:12px;line-height:1.5;color:#456175;margin:14px 0 0;">Shortcuts open an email draft. Review it and press Send from the address that received this alert. Remove attachments and image signatures.</p></div><p style="font-size:13px;line-height:1.6;color:#456175;">Respond within <strong>15 minutes of detection</strong>. A new block lasts <strong>${a.blockSeconds} seconds</strong>. Protection is active only after the server agent confirms it.</p>`:`<p style="font-size:15px;line-height:1.6;">Review this incident in GuardScale. Email commands are not enabled for this installation.</p>`;
 const assessment=assessmentSummary(a)+(a.protectionBlocked?' This source arrived through a proxy or CDN. Origin firewall protection is unavailable; review edge/WAF or HTTP-layer controls.':'');
 const sampleHTML=samples.length?`<h2 style="font-size:18px;margin:24px 0 8px;">Observed request paths</h2><div style="padding:14px;background:#f6f9fc;font:13px/1.7 monospace;overflow-wrap:anywhere;">${samples.map(escape).join('<br>')}</div><p style="font-size:12px;color:#536a7e;">Query values omitted. These are observed requests, not proof of an attack.</p>`:'';
 const html=layout('GuardScale: review server activity',`<p style="margin:0 0 8px;color:#0078bd;font-size:12px;font-weight:bold;letter-spacing:1px;">SERVER EVENT · HUMAN REVIEW</p><h1 style="font-size:27px;line-height:1.25;margin:0 0 22px;">Review unusual server activity</h1>${controls}${link?`<p style="margin:22px 0;">${button('Review incident',link)}</p>`:''}<table role="presentation" width="100%" style="font-size:14px;line-height:1.7;border-top:1px solid #d5e1eb;padding-top:15px;"><tr><td style="color:#536a7e;width:95px;">Server</td><td><strong>${escape(a.server)}</strong></td></tr><tr><td style="color:#536a7e;">Source IP</td><td>${escape(a.source??'Not available')}</td></tr><tr><td style="color:#536a7e;">Detected</td><td>${escape(detected)}</td></tr></table><h2 style="font-size:18px;margin:24px 0 8px;">Assessment</h2><p style="font-size:14px;line-height:1.65;margin:0;">${escape(assessment)}</p>${sampleHTML}<p style="font-size:12px;color:#536a7e;line-height:1.5;margin:18px 0 0;">AI advice can be wrong. Review the evidence and source scope before approving protection.</p>`);
 return {text,html};
}
