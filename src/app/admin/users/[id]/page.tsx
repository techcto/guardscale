import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {adminDate,serverSummary} from '@/lib/admin-directory';
import {store} from '@/lib/store';
import {Avatar,Card,DataTable,Entity,Facts,PageHeader,PrivacyNote,Status} from '../../admin-ui';
import ServersTable from '../../servers-table';
export default async function AdminUser({params}:{params:Promise<{id:string}>}){
 await rootSession();if(!saasMode())notFound();
 const {id}=await params,user=await store.userById(id);if(!user)notFound();
 const organizations=await Promise.all((await store.orgsForUser(id)).map(async ({org,membership})=>({org,membership,servers:(await store.nodes(org.id)).map(serverSummary)})));
 const servers=organizations.flatMap(o=>o.servers.map(s=>({...s,organization:o.org.name})));
 return <><PageHeader crumb={{href:'/admin/users',label:'Users'}} title={user.displayName} description={user.username} avatar={<Avatar name={user.displayName} large/>} actions={<Status value={user.status}/>}/>
 <PrivacyNote>only account details and server inventory are shown. Logs, events, incidents, and response actions stay private to the user&apos;s organizations.</PrivacyNote>
 <Card title="Account"><Facts items={[['Username',user.username],['Joined',adminDate(user.createdAt)],['Organizations',organizations.length],['Servers',servers.length]]}/></Card>
 <Card title="Organizations"><DataTable head={['Organization','Role','Access','Servers']} empty="No organizations." count={organizations.length}>{organizations.map(({org,membership,servers})=><tr key={org.id}><td><Entity href={`/admin/organizations/${org.id}`} name={org.name} sub={org.orgType}/></td><td>{membership.role}</td><td><Status value={membership.status}/></td><td>{servers.length}</td></tr>)}</DataTable></Card>
 <Card title="Servers"><ServersTable servers={servers}/></Card></>;
}
