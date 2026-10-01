import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {sessionCookie, verifySession} from '@/lib/session';
import SettingsConsole from './settings-console';
export default async function Settings({searchParams}:{searchParams:Promise<{tab?:string}>}){
  const {tab}=await searchParams;
  if(tab?.toLowerCase()==='billing')redirect('/settings/billing');
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');
  const saas=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
  return <main><section className="hero"><div className="eyebrow">Control center</div><h1>Settings</h1><p className="muted page-intro">Customize detection, notifications, evidence retention, and safe response behavior.</p></section><SettingsConsole saas={saas} isRoot={session?.role==='root'} initialTab={tab}/></main>;
}
