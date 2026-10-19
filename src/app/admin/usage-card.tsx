import {formatUnits,periodLabel,type organizationUsage} from '@/lib/admin-directory';
import {Card,DataTable} from './admin-ui';
// Metered usage for the current billing period: plan tiles over a per-meter table (Osirus admin billing panel).
export default function UsageCard({usage}:{usage:Awaited<ReturnType<typeof organizationUsage>>}){
 const period=periodLabel(usage.period);
 return <Card title="Usage this billing period"><p className="admin-usage-period">{period} · {usage.period.source==='stripe_subscription'?'Stripe subscription period':'Calendar month'}</p>
 <div className="admin-stats mb-3"><div className="card g-card"><span>Plan</span><strong>{usage.plan}</strong></div><div className="card g-card"><span>Server limit</span><strong>{usage.servers}</strong></div><div className="card g-card"><span>Usage export</span><strong>{usage.exportEnabled?`${usage.exportedHours} hrs sent`:'Off'}</strong></div></div>
 <DataTable head={['Meter','Used','Included','Overage']} empty="No usage recorded." count={usage.rows.length}>{usage.rows.map(r=><tr key={r.meter}><td><strong>{r.meter}</strong></td><td>{formatUnits(r.used,r.unit)}</td><td className="muted">{r.included===null?'Unlimited':formatUnits(r.included,r.unit)}</td><td>{r.overage>0?<span className="status failed">{formatUnits(r.overage,r.unit)}</span>:<span className="muted">—</span>}</td></tr>)}</DataTable>
 {usage.unpricedAiCalls>0&&<p className="muted small mt-3 mb-0">{usage.unpricedAiCalls} AI calls used a model without a credit weight and are not counted as credits.</p>}</Card>;
}
