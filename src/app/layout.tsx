import Link from 'next/link';import {cookies} from 'next/headers';import 'bootstrap/dist/css/bootstrap.min.css';import './globals.css';
import {sessionCookie, verifySession} from '@/lib/session';
import {store} from '@/lib/store';
import UserMenu from './user-menu';
import OrgPicker from './org-picker';
export const metadata={title:'Guardian.US',description:'AI-powered infrastructure detection and response',icons:{icon:'/guardian-mark.svg'}};
export default async function Layout({children}:{children:React.ReactNode}){
  const saas=process.env.GUARDIAN_DEPLOYMENT_MODE==='saas';
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDIAN_SESSION_SECRET??'');
  if(!session)return <html lang="en"><body>{children}</body></html>;
  const activeOrg=session.orgId?await store.organizationById(session.orgId):null;
  return <html lang="en"><body><div className="shell-with-nav">
    <aside className="side-nav">
      <Link className="brand" href="/"><img src="/guardian-mark.svg" alt="" width={22} height={22}/>GUARDIAN.US</Link>
      {saas&&<OrgPicker activeOrgId={session.orgId} activeOrgName={activeOrg?.name??'Select organization'} isRoot={session.role==='root'}/>}
      <nav className="nav nav-vertical">
        <Link href="/">Dashboard</Link>
        <Link href="/nodes">Nodes</Link>
        <Link href="/incidents">Incidents</Link>
        {activeOrg?.orgType!=='personal'&&<Link href="/users">Users</Link>}
      </nav>
    </aside>
    <div className="position-fixed top-0 end-0 m-3 z-3">
      <UserMenu id={session.id} displayName={session.username} role={session.role}/>
    </div>
    <main className="content-area">{children}</main>
  </div></body></html>;
}
