export type Organization={id:string;name:string;enrollmentToken:string;createdAt:string};
export type NodeStatus='pending'|'healthy'|'stale'|'offline';
export type Node={tenantId:string;serverId:string;agentId:string;displayName:string;platform?:string;tags:string[];status:NodeStatus;createdAt:string;lastHeartbeat:string};
export type IncidentRecord={tenantId:string;serverId:string;agentId:string;incidentId:string;state:string;startedAt:string;updatedAt:string;payload:unknown};
export type GuardianEvent={tenantId:string;serverId:string;agentId:string;type:string;at:string;metadata?:Record<string,string>};
export const normalizedEvents=['viewer.request','edge.cache.hit','edge.cache.miss','waf.allow','waf.block','origin.request','origin.response','origin.timeout','app.php.slow','app.php.max_children','host.cpu','host.memory','service.restart','monitor.down','protection.enabled','protection.expired'] as const;
export type UserRole='root'|'admin'|'operator'|'viewer';
export type GuardianUser={id:string;tenantId:string;username:string;displayName:string;role:UserRole;status:'active'|'disabled';createdAt:string;updatedAt:string};
export type Settings={
  tenantId:string;
  detection:{warningPercent:number;criticalPercent:number;emergencyPercent:number;trafficMultiplier:number;distributedCrawlerCorrelation:boolean;applicationFailureDetection:boolean;heartbeatStaleSeconds:number};
  notifications:{whatsappEnabled:boolean;whatsappSenderId:string;emailEnabled:boolean;recipients:string};
  response:{allowRemoteRequests:boolean;dryRun:boolean;defaultTtlSeconds:number;maxTtlSeconds:number};
  privacy:{evidenceRetentionDays:number;maxEvidenceLines:number;removeQueryValues:boolean;fingerprintUserAgents:boolean};
  updatedAt:string;
};
export type Product={id:string;name:string;description:string;stripePriceId:string;monthlyPrice:number;serverLimit:number;active:boolean};
export type Subscription={id:string;userId:string;productId:string;stripeCustomerId:string;stripeSubscriptionId:string;status:'trialing'|'active'|'past_due'|'canceled'|'unpaid';currentPeriodEnd?:string;updatedAt:string};
export function defaultSettings(tenantId:string):Settings{return{
  tenantId,
  detection:{warningPercent:2,criticalPercent:10,emergencyPercent:30,trafficMultiplier:5,distributedCrawlerCorrelation:true,applicationFailureDetection:true,heartbeatStaleSeconds:180},
  notifications:{whatsappEnabled:true,whatsappSenderId:process.env.GUARDIAN_WHATSAPP_ORIGINATION_ID??'+15550100000',emailEnabled:true,recipients:process.env.GUARDIAN_NOTIFICATION_RECIPIENTS??''},
  response:{allowRemoteRequests:false,dryRun:true,defaultTtlSeconds:300,maxTtlSeconds:900},
  privacy:{evidenceRetentionDays:30,maxEvidenceLines:500,removeQueryValues:true,fingerprintUserAgents:true},
  updatedAt:new Date(0).toISOString(),
}}
