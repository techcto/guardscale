import type {Subscription} from './model';
export function hasPaidEntitlement(v:Subscription){return (v.status==='active'||v.status==='trialing')&&Boolean(v.stripeSubscriptionId?.startsWith('sub_')&&v.stripeCustomerId?.startsWith('cus_'))}
