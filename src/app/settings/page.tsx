import {cookies} from 'next/headers';
import {sessionCookie, verifySession} from '@/lib/session';
import SettingsConsole from './settings-console';
export default async function Settings(){
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDIAN_SESSION_SECRET??'');
  const saas=process.env.GUARDIAN_DEPLOYMENT_MODE==='saas';
  return <main><section className="hero"><div className="eyebrow">Control center</div><h1>Settings</h1><p className="muted page-intro">Customize detection, notifications, evidence retention, and safe response behavior.</p></section><SettingsConsole saas={saas} isRoot={session?.role==='root'}/></main>;
}
