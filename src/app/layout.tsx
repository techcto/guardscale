import ConsoleShell from './console-shell';
import {cookies} from 'next/headers';import 'bootstrap/dist/css/bootstrap.min.css';import './globals.css';
import {sessionCookie, verifySession} from '@/lib/session';
import {store} from '@/lib/store';
import UserMenu from './user-menu';
import OrgPicker from './org-picker';
import {defaultActiveOrgForRoot} from '@/lib/org-resolve';
import './navigation.css';
export const metadata={metadataBase:new URL('https://guardscale.org'),title:'GuardScale',description:'AI-powered infrastructure detection and response',alternates:{canonical:'/'},openGraph:{title:'GuardScale',description:'AI-powered infrastructure detection and response',url:'https://guardscale.org',siteName:'GuardScale',type:'website'},icons:{icon:'/guardscale-mark.svg'}};
export default async function Layout({children}:{children:React.ReactNode}){
  const saas=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
  const jar=await cookies();
  const verified=await verifySession(jar.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');
  const session=verified?.role==='root'&&(!verified.orgId||!await store.organizationById(verified.orgId))?{...verified,orgId:await defaultActiveOrgForRoot()}:verified;
  if(!session)return <html lang="en"><body>{children}</body></html>;
  const activeOrg=session.orgId?await store.organizationById(session.orgId):null;
  return <html lang="en"><body><ConsoleShell saas={saas} organization={saas?<OrgPicker activeOrgId={session.orgId} activeOrgName={activeOrg?.name??"Select organization"} isRoot={session.role==="root"}/>:<span className="gs-private-mode">Private installation</span>} account={<UserMenu id={session.id} displayName={session.username} role={session.role} canManageUsers={activeOrg?.orgType!=="personal"}/>} >{children}</ConsoleShell></body></html>;
}
