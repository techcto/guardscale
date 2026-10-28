const tokens=(value:string)=>value.split(/[\s,;]+/).map(v=>v.trim()).filter(Boolean);
export function splitRecipients(value:string){
 const values=tokens(value);
 return {whatsapp:values.filter(v=>!v.includes('@')).join('\n'),email:values.filter(v=>v.includes('@')).join('\n')};
}
export function joinRecipients(whatsapp:string,email:string){
 const phones=tokens(whatsapp),emails=tokens(email).map(v=>v.toLowerCase());
 if(phones.some(v=>!/^\+[1-9]\d{7,14}$/.test(v)))throw Error('WhatsApp recipients must be international numbers such as +15551234567, without spaces.');
 if(emails.some(v=>v.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))throw Error('Enter valid email recipients in the Email section.');
 const values=[...new Set([...phones,...emails])];if(values.length>20)throw Error('Choose at most 20 notification recipients in total.');
 return values.join(',');
}
