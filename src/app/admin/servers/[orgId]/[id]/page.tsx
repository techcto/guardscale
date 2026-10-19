import Link from 'next/link';
import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {adminDate,serverSummary} from '@/lib/admin-directory';
import {store} from '@/lib/store';
import {Avatar,Card,DataTable,Entity,Facts,PageHeader,PrivacyNote,Status} from '../../../admin-ui';
export default async function AdminServer({params}:{params:Promise<{orgId:string;id:string}>}){
 await rootSession();if(!saasMode())notFound();
 const {orgId,id}=await params,[org,node]=await Promise.all([store.organizationById(orgId),store.node(orgId,decodeURIComponent(id))]);if(!org||!node)notFound();
 const s=serverSummary(node),members=await store.membersOfOrg(orgId);
 return <><PageHeader crumb={{href:'/admin/servers',label:'Servers'}} title={s.name} description={<Link href={`/admin/organizations/${org.id}`}>{org.name}</Link>} avatar={<Avatar name={s.name} large/>} actions={<Status value={s.status}/>}/>
 <PrivacyNote>only server inventory is shown. Logs, events, incidents, and website addresses stay private to the organization.</PrivacyNote>
 <Card title="Overview"><Facts items={[['Organization',<Link key="o" href={`/admin/organizations/${org.id}`}>{org.name}</Link>],['Status',<Status key="s" value={s.status}/>],['Platform',s.platform],['Websites',s.sites],['Connected',adminDate(s.connectedAt)],['Last heartbeat',adminDate(s.lastSeen)]]}/></Card>
 <Card title="People with access"><DataTable head={['User','Role','Status']} empty="No members." count={members.length}>{members.map(({user,membership})=><tr key={user.id}><td><Entity href={`/admin/users/${user.id}`} name={user.displayName} sub={user.username}/></td><td>{membership.role}</td><td><Status value={membership.status}/></td></tr>)}</DataTable></Card></>;
}
