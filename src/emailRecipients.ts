/** Normalize recipient lists for existing OMS process data (no schema migration). */
const emailPattern=/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
export function recipientEmails(value:unknown):string[]{
 const raw=Array.isArray(value)?value.join('; '):String(value??'');
 return [...new Set([...raw.matchAll(emailPattern)].map(match=>match[0].toLowerCase()))];
}
export function mergeRecipientEmails(...values:unknown[]):string{
 return recipientEmails(values.map(value=>Array.isArray(value)?value.join('; '):String(value??'')).join('; ')).join('; ');
}
export function toggleRecipientEmail(value:unknown,address:string):string{
 const existing=recipientEmails(value),email=recipientEmails(address)[0];
 if(!email)return existing.join('; ');
 return (existing.includes(email)?existing.filter(value=>value!==email):[...existing,email]).join('; ');
}
