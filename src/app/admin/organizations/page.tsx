import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {adminDate,organizationUsage} from '@/lib/admin-directory';
import {store} from '@/lib/store';
import {Card,DataTable,Entity,PageHeader} from '../admin-ui';
export default async function AdminOrganizations(){
 await rootSession();if(!saasMode())notFound();
 const rows=await Promise.all((await store.organizations()).map(async org=>({org,members:(await store.membersOfOrg(org.id)).length,servers:(await store.nodes(org.id)).length,usage:await organizationUsage(org.id)})));
 rows.sort((a,b)=>a.org.name.localeCompare(b.org.name));
 const hours=(u:typeof rows[number]['usage'])=>u.rows[0].used??0;
 return <><PageHeader eyebrow="Directory" title="Organizations" description="Every organization is an isolated tenant with its own servers, incidents, plan, and metered usage."/>
 <Card><DataTable head={['Organization','Plan','Members','Servers','Server hours this period','Created']} empty="No organizations yet." count={rows.length}>{rows.map(({org,members,servers,usage})=><tr key={org.id}><td><Entity href={`/admin/organizations/${org.id}`} name={org.name} sub={org.contactEmail??org.slug}/></td><td>{usage.plan}</td><td>{members}</td><td>{servers}</td><td>{hours(usage).toLocaleString('en-US')}</td><td className="muted">{adminDate(org.createdAt)}</td></tr>)}</DataTable></Card></>;
}
