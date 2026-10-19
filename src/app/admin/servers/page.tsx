import {notFound} from 'next/navigation';
import {rootSession,saasMode} from '@/lib/admin';
import {directoryServers} from '@/lib/admin-directory';
import {Card,PageHeader} from '../admin-ui';
import ServersTable from '../servers-table';
export default async function AdminServers(){
 await rootSession();if(!saasMode())notFound();
 const servers=await directoryServers(),healthy=servers.filter(s=>s.status==='healthy').length;
 return <><PageHeader eyebrow="Directory" title="Servers" description="Every server connected to an organization. Inventory only; logs, events, and incidents stay inside each organization."/>
 <div className="admin-stats"><div className="card g-card"><span>Connected</span><strong>{servers.length}</strong></div><div className="card g-card"><span>Healthy</span><strong>{healthy}</strong></div><div className="card g-card"><span>Need attention</span><strong>{servers.length-healthy}</strong></div></div>
 <Card><ServersTable servers={servers}/></Card></>;
}
