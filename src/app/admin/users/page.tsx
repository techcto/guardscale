import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {adminDate,directoryUsers} from '@/lib/admin-directory';
import {Card,DataTable,Entity,PageHeader,Status} from '../admin-ui';
export default async function AdminUsers(){
 await rootSession();if(!saasMode())notFound();
 const rows=await directoryUsers();
 return <><PageHeader eyebrow="Directory" title="Users" description="Everyone with access to an organization. The launch-time root operator is managed through deployment secrets and is not listed."/>
 <Card><DataTable head={['User','Organizations','Status','Joined']} empty="No users yet. Users appear here once they belong to an organization." count={rows.length}>{rows.map(({user,organizations})=><tr key={user.id}><td><Entity href={`/admin/users/${user.id}`} name={user.displayName} sub={user.username}/></td><td>{organizations}</td><td><Status value={user.status}/></td><td className="muted">{adminDate(user.createdAt)}</td></tr>)}</DataTable></Card></>;
}
