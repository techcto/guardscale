import {rootSession,saasMode} from '@/lib/admin';
import {Card,Facts,PageHeader} from '../admin-ui';
const configured=(v?:string)=>v?'Configured':'Not configured';
export default async function AdminSettings(){
 await rootSession();
 const e=process.env,saas=saasMode();
 const facts:[string,string][]=[
  ['Deployment mode',saas?'SaaS':'Private installation'],
  ['Data store',e.GUARDSCALE_TABLE?(e.GUARDSCALE_DYNAMODB_ENDPOINT?'DynamoDB local':'DynamoDB'):'In-memory (not persistent)'],
  ...(saas?[
   ['Usage metering','Server hours, log MB, AI credits'],
   ['Usage export to Stripe',e.GUARDSCALE_USAGE_EXPORT==='enabled'?'Enabled':'Disabled'],
   ['Server overage price',configured(e.STRIPE_SERVER_OVERAGE_PRICE_ID)],
   ['Log overage price',configured(e.STRIPE_LOG_OVERAGE_PRICE_ID)],
   ['AI overage price',configured(e.STRIPE_AI_OVERAGE_PRICE_ID)],
   ['AI credit weights',configured(e.GUARDSCALE_AI_CREDIT_WEIGHTS_JSON)],
   ['Stripe billing',configured(e.STRIPE_SECRET_KEY)],
  ] as [string,string][]:[]),
 ];
 return <><PageHeader eyebrow="System" title="Settings" description="Installation-wide configuration, read-only. Values come from deployment configuration; secrets are never displayed."/>
 <Card title="Installation"><Facts items={facts}/></Card>
 <p className="muted small">Organization settings such as detection, notifications, and response policies live under each organization&apos;s Settings.</p></>;
}
