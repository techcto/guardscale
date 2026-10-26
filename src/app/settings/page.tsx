import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {sessionCookie, verifySession} from '@/lib/session';
import SettingsConsole from './settings-console';
import DeleteDrawer from '@/app/delete-drawer';
import {userDeletion} from '@/lib/admin';
export default async function Settings({searchParams}:{searchParams:Promise<{tab?:string}>}){
  const {tab}=await searchParams;
  if(tab?.toLowerCase()==='billing')redirect('/settings/billing');
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');
  const saas=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas',deletion=saas&&session&&session.role!=='root'?await userDeletion(session.id):null;
  return <main><section className="hero"><div className="eyebrow">Control center</div><h1>Settings</h1><p className="muted page-intro">Customize detection, notifications, evidence retention, and safe response behavior.</p></section><SettingsConsole saas={saas} isRoot={session?.role==='root'} initialTab={tab}/>{session&&deletion&&<section className="g-card mt-4"><h2>Delete account</h2><p className="muted">Permanently delete your GuardScale account and sign out. Organizations you own that nobody else uses are deleted with it, including their servers, logs, incidents and usage; shared organizations you own pass to another active member.</p><DeleteDrawer impact={deletion} url={`/api/v1/users/${session.id}`} redirect="/login"/></section>}</main>;
}
