'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';
export default function ConsoleShell({children,organization,account,saas}:{children:ReactNode;organization:ReactNode;account:ReactNode;saas:boolean}){
 const path=usePathname();
 if(path==='/'||path==='/api-reference'||path.startsWith('/docs/')||path==='/signup'||path.startsWith('/login'))return children;
 const links=[['/console','Dashboard'],['/servers','Servers'],['/incidents','Incidents'],['/providers','Providers'],['/settings','Settings'],...(saas?[['/billing','Plans']]:[])];
 return <div className="gs-console"><header className="gs-console-header"><Link className="brand" href="/"><img src="/guardscale-mark.svg" alt="" width={28} height={28}/>GuardScale</Link><nav aria-label="Console navigation">{links.map(([href,label])=><Link key={href} href={href} aria-current={path===href||path.startsWith(href+'/')?'page':undefined}>{label}</Link>)}</nav><div className="gs-console-account">{organization}{account}</div></header><div className="content-area">{children}</div></div>;
}
