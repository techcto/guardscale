import {cookies} from 'next/headers';
import {sessionCookie, verifySession} from '@/lib/session';
import OrganizationsConsole from './organizations-console';
export default async function Organizations(){
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDIAN_SESSION_SECRET??'');
  if(process.env.GUARDIAN_DEPLOYMENT_MODE!=='saas'||session?.role!=='root')return <main><section className="hero"><div className="eyebrow">Organizations</div><h1>Not available.</h1><p className="muted page-intro">Organization management is available to the root operator in SaaS mode.</p></section></main>;
  return <main><section className="hero"><div className="eyebrow">Organizations</div><h1>Manage your workspaces.</h1><p className="muted page-intro">Every organization is an isolated tenant with its own nodes, incidents, and enrollment token.</p></section><OrganizationsConsole/></main>;
}
