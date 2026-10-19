import Link from 'next/link';
import {adminDate,type ServerSummary} from '@/lib/admin-directory';
import {DataTable,Entity,Status} from './admin-ui';
export default function ServersTable({servers}:{servers:(ServerSummary&{organization?:string})[]}){
 const org=servers.some(s=>s.organization);
 return <DataTable head={['Server',...(org?['Organization']:[]),'Status','Websites','Last heartbeat']} empty="No connected servers." count={servers.length}>{servers.map(s=><tr key={s.orgId+s.id}><td><Entity href={`/admin/servers/${s.orgId}/${encodeURIComponent(s.id)}`} name={s.name} sub={s.platform}/></td>{org&&<td><Link href={`/admin/organizations/${s.orgId}`}>{s.organization}</Link></td>}<td><Status value={s.status}/></td><td>{s.sites}</td><td className="muted">{adminDate(s.lastSeen)}</td></tr>)}</DataTable>;
}
