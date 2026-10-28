import {requestSampleLines,type RequestSample} from './request-samples';
export type IncidentAlert={protectionBlocked?:boolean;server:string;source?:string;country?:string;detectedAt:string;analysisStatus:string;summary?:string;reviewUrl:string;websites?:string[];requestSamples?:RequestSample[];code:string;blockSeconds:number};
export const assessmentSummary=(a:IncidentAlert)=>a.analysisStatus==='complete'?a.summary??'Review the measured findings in the console.':`AI assessment: ${a.analysisStatus}. ${a.summary??'Review the measured findings before acting.'}`;
const label=(value:string)=>value.replace(/[\r\n*_`]/g,' ').slice(0,100);
export function incidentAlert(a:IncidentAlert,channel:'email'|'whatsapp'){
 const heading=(text:string)=>channel==='whatsapp'?`*${text}*`:text;
 const details=[`Server: ${label(a.server)}`,`Source IP: ${label(a.source??'Not available')}`];
 if(a.country)details.push(`Country: ${label(a.country)}`);
 details.push(`Detected: ${a.detectedAt}`);
 const parts=[heading('GuardScale | Server event'), 'Hey, we detected unusual activity on your server. Please review before taking action.',details.join('\n')];
 if(a.websites?.length)parts.push(heading('Websites')+'\n'+a.websites.join('\n'));
 parts.push(heading('Assessment')+'\n'+assessmentSummary(a).slice(0,600));
 if(a.protectionBlocked)parts.push('This source arrived through a proxy or CDN. Origin firewall protection is unavailable; review edge/WAF or HTTP-layer controls.');
 const samples=requestSampleLines(a.requestSamples);
 if(samples.length)parts.push(heading('Observed request paths')+'\n'+samples.join('\n')+'\nQuery values omitted. These are observed requests, not proof of an attack.');
 if(channel==='whatsapp'&&a.protectionBlocked)parts.push(heading('What would you like to do?')+'\nReply Watch to keep monitoring, or Dismiss to dismiss this incident. If several alerts are pending, include the matching code:',`Watch ${a.code}\nDismiss ${a.code}`);
 else if(channel==='whatsapp')parts.push(heading('What would you like to do?')+`\n\nReply Protect\nBlock this source on this server for ${a.blockSeconds} seconds.\n\nReply Watch\nKeep monitoring without adding a block.\n\nReply Dismiss\nDismiss this incident and request removal of its active block.`, 'A one-word reply works when exactly one current alert needs review. If several alerts are pending, use the matching line below:',`Protect ${a.code}\nWatch ${a.code}\nDismiss ${a.code}`, 'Commands expire 15 minutes after detection. Watch keeps an existing block until its expiry. Dismiss stops renewal and asks the agent to remove the incident block. Protection is confirmed only after the server agent reports it.');
 else parts.push('Use the authenticated console to review or approve temporary protection. Direct email replies are not supported.');
 parts.push(heading('Review incident')+'\n'+a.reviewUrl);
 return parts.join('\n\n');
}
