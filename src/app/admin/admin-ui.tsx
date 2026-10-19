import Link from 'next/link';
import type {ReactNode} from 'react';
// Admin building blocks in the GuardScale console style: compact hero header, cards, status pills.
const paths:Record<string,string>={
 Organizations:'M3 21V7l9-4 9 4v14M8 21v-5h8v5M8 10h.01M12 10h.01M16 10h.01',
 Users:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6',
 Servers:'M4 4h16v6H4ZM4 14h16v6H4ZM8 7h.01M8 17h.01',
 Settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
};
export function Icon({name,size=18}:{name:string;size?:number}){return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>}
export function Avatar({name,large}:{name:string;large?:boolean}){const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('')||'?';return <span className={`admin-avatar${large?' admin-avatar-lg':''}`} aria-hidden="true">{initials}</span>}
export function PageHeader({eyebrow,crumb,title,description,avatar,actions}:{eyebrow?:string;crumb?:{href:string;label:string};title:ReactNode;description?:ReactNode;avatar?:ReactNode;actions?:ReactNode}){
 return <section className="hero compact-hero admin-hero"><div className="admin-hero-main">{avatar}<div><div className="eyebrow">{crumb?<><Link href={crumb.href}>{crumb.label}</Link> ›</>:eyebrow}</div><h1 className="admin-header-title">{title}</h1>{description&&<p className="muted">{description}</p>}</div></div>{actions}</section>;
}
export function Entity({href,name,sub}:{href:string;name:string;sub?:ReactNode}){return <Link className="admin-entity" href={href}><Avatar name={name}/><span><strong>{name}</strong>{sub&&<small>{sub}</small>}</span></Link>}
const pills:Record<string,string>={active:'',healthy:'',complete:'',failed:' failed',disabled:' failed'};
export function Status({value}:{value:string}){return <span className={`status admin-status${pills[value]??' neutral'}`}>{value}</span>}
export function Card({title,children}:{title?:string;children:ReactNode}){return <section className="card g-card">{title&&<h2 className="h5">{title}</h2>}{children}</section>}
export function DataTable({head,empty,count,children}:{head:string[];empty:string;count:number;children:ReactNode}){
 return <div className="table-wrap"><table className="table align-middle mb-0"><thead><tr>{head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{count?children:<tr><td colSpan={head.length} className="empty-state"><strong>{empty}</strong></td></tr>}</tbody></table></div>;
}
export function Facts({items}:{items:[string,ReactNode][]}){return <dl className="admin-facts">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
export function PrivacyNote({children}:{children:ReactNode}){return <p className="admin-privacy">Privacy: {children}</p>}
