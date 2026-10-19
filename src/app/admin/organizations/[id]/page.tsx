import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {adminDate,organizationUsage,serverSummary} from '@/lib/admin-directory';
import {store} from '@/lib/store';
import {Avatar,Card,DataTable,Entity,Facts,PageHeader,PrivacyNote,Status} from '../../admin-ui';
import ServersTable from '../../servers-table';
import UsageCard from '../../usage-card';
import OpenOrganization from '../../open-organization';
export default async function AdminOrganization({params}:{params:Promise<{id:string}>}){
 await rootSession();if(!saasMode())notFound();
 const {id}=await params,org=await store.organizationById(id);if(!org)notFound();
 const [members,nodes,subscription,usage]=await Promise.all([store.membersOfOrg(id),store.nodes(id),store.activeSubscriptionForOrg(id),organizationUsage(id)]);
 return <><PageHeader crumb={{href:'/admin/organizations',label:'Organizations'}} title={org.name} description={org.contactEmail??org.slug} avatar={<Avatar name={org.name} large/>} actions={<OpenOrganization orgId={org.id}/>}/>
 <PrivacyNote>logs, events, incidents, website URLs, and credentials stay inside the organization. Only inventory and usage totals are shown here.</PrivacyNote>
 <Card title="Overview"><Facts items={[['Type',org.orgType],['Plan',usage.plan+(subscription?` · ${subscription.status}`:'')],['Contact phone',org.contactPhone??'—'],['Created',adminDate(org.createdAt)],['Members',members.length],['Servers',`${nodes.length} of ${usage.servers}`]]}/></Card>
 <UsageCard usage={usage}/>
 <Card title="Members"><DataTable head={['User','Role','Status']} empty="No members." count={members.length}>{members.map(({user,membership})=><tr key={user.id}><td><Entity href={`/admin/users/${user.id}`} name={user.displayName} sub={user.username}/></td><td>{membership.role}</td><td><Status value={membership.status}/></td></tr>)}</DataTable></Card>
 <Card title="Servers"><ServersTable servers={nodes.map(serverSummary)}/></Card></>;
}
