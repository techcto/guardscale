'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Icon} from './admin-ui';
export default function AdminNavigation({saas}:{saas:boolean}){
 const path=usePathname();
 const groups=[...(saas?[{heading:'Directory',items:[['Organizations','/admin/organizations'],['Users','/admin/users'],['Servers','/admin/servers']]}]:[]),{heading:'System',items:[['Settings','/admin/settings']]}];
 return <aside className="admin-sidenav"><Link className="admin-sidenav-back" href="/console">← Main console</Link><nav aria-label="Admin navigation">{groups.map(g=><div key={g.heading}><p className="admin-sidenav-heading">{g.heading}</p>{g.items.map(([label,href])=><Link key={href} href={href} aria-current={path===href||path.startsWith(href+'/')?'page':undefined}><Icon name={label}/>{label}</Link>)}</div>)}</nav></aside>;
}
