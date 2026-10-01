import BillingConsole from './billing-console';
export default function Billing(){
  if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas')return <main><section className="hero"><div className="eyebrow">Plans & billing</div><h1>Billing isn&apos;t enabled on this deployment.</h1><p className="muted page-intro">This is an on-premise, single-organization deployment of GuardScale. Billing and plan selection are available in SaaS mode.</p></section></main>;
  return <main><section className="hero"><div className="eyebrow">Plans & billing</div><h1>Scale protection with your fleet.</h1><p className="muted page-intro">Subscriptions are securely processed by Stripe. GuardScale never receives or stores card details.</p></section><BillingConsole/></main>;
}
