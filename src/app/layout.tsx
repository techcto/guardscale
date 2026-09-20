import Link from 'next/link';import {cookies} from 'next/headers';import 'bootstrap/dist/css/bootstrap.min.css';import './globals.css';
import {sessionCookie, verifySession} from '@/lib/session';
import UserMenu from './user-menu';
export const metadata={title:'Guardian.US',description:'AI-powered infrastructure detection and response',icons:{icon:'/guardian-mark.svg'}};
export default async function Layout({children}:{children:React.ReactNode}){
  const saas=process.env.GUARDIAN_DEPLOYMENT_MODE==='saas';
  const jar=await cookies();
  const session=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDIAN_SESSION_SECRET??'');
  if(!session)return <html lang="en"><body><main className="content-area">{children}</main></body></html>;
  return <html lang="en"><body><div className="shell-with-nav">
    <aside className="side-nav">
      <Link className="brand" href="/"><img src="/guardian-mark.svg" alt="" width={22} height={22}/>GUARDIAN.US</Link>
      {saas&&<button className="org-picker-button" type="button">Guardian.US<span className="muted small">workspace ▾</span></button>}
      <nav className="nav nav-vertical">
        <Link href="/">Dashboard</Link>
        <Link href="/nodes">Nodes</Link>
        <Link href="/incidents">Incidents</Link>
        <Link href="/users">Users</Link>
        {saas&&<Link href="/billing">Billing</Link>}
        <Link href="/settings">Settings</Link>
      </nav>
      <UserMenu displayName={session.username} role={session.role}/>
    </aside>
    <main className="content-area">{children}</main>
  </div></body></html>;
}
