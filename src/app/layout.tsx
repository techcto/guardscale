import Link from 'next/link';import 'bootstrap/dist/css/bootstrap.min.css';import './globals.css';
export const metadata={title:'Guardian.US',description:'AI-powered infrastructure detection and response'};
export default function Layout({children}:{children:React.ReactNode}){
  const saas=process.env.GUARDIAN_DEPLOYMENT_MODE==='saas';
  return <html lang="en"><body><div className="shell-with-nav">
    <aside className="side-nav">
      <Link className="brand" href="/">GUARDIAN.US</Link>
      {saas&&<button className="org-picker-button" type="button">Guardian.US<span className="muted small">workspace ▾</span></button>}
      <nav className="nav nav-vertical">
        <Link href="/nodes">Nodes</Link>
        <Link href="/incidents">Incidents</Link>
        <Link href="/users">Users</Link>
        {saas&&<Link href="/billing">Billing</Link>}
        <Link href="/settings">Settings</Link>
      </nav>
    </aside>
    <main className="content-area">{children}</main>
  </div></body></html>;
}
