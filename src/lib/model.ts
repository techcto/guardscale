export type OrgType='personal'|'business';
export type Organization={id:string;name:string;slug:string;ownerId:string;orgType:OrgType;contactEmail?:string;contactPhone?:string;enrollmentToken:string;createdAt:string};
export type MembershipRole='admin'|'operator'|'viewer';
export type OrgMembership={id:string;orgId:string;userId:string;role:MembershipRole;status:'active'|'disabled';invitedByUserId?:string;createdAt:string;updatedAt:string};
export type NodeStatus='pending'|'healthy'|'stale'|'offline';
export type Node={tenantId:string;serverId:string;agentId:string;displayName:string;platform?:string;websiteUrls?:string[];discoveredHosts?:string[];tags:string[];status:NodeStatus;createdAt:string;lastHeartbeat:string;deletedAt?:string};
export type IncidentRecord={tenantId:string;serverId:string;agentId:string;incidentId:string;state:string;startedAt:string;updatedAt:string;payload:unknown};
export type GuardScaleEvent={id?:string;tenantId:string;serverId:string;agentId:string;type:string;at:string;metadata?:Record<string,string>};
export const normalizedEvents=['viewer.request','edge.cache.hit','edge.cache.miss','waf.allow','waf.block','origin.request','origin.response','origin.timeout','app.php.slow','app.php.max_children','host.cpu','host.memory','service.restart','monitor.down','protection.enabled','protection.expired'] as const;
export type UserRole='root'|'admin'|'operator'|'viewer';
export type GuardScaleUser={id:string;username:string;displayName:string;status:'active'|'disabled';createdAt:string;updatedAt:string};
export type Settings={
  tenantId:string;
  detection:{warningPercent:number;criticalPercent:number;emergencyPercent:number;trafficMultiplier:number;distributedCrawlerCorrelation:boolean;applicationFailureDetection:boolean;heartbeatStaleSeconds:number};
  notifications:{whatsappEnabled:boolean;whatsappSenderId:string;emailEnabled:boolean;recipients:string};
  response:{allowRemoteRequests:boolean;dryRun:boolean;defaultTtlSeconds:number;maxTtlSeconds:number;autoGuardian?:{enabled:boolean;waitSeconds:number;maxTtlSeconds:number;maxActionsPerHour:number}};
  privacy:{evidenceRetentionDays:number;maxEvidenceLines:number;removeQueryValues:boolean;fingerprintUserAgents:boolean};
  billing?:{overageEnabled:boolean;capPercent:number;alertPercents:number[];updatedAt:string};
  updatedAt:string;
};
export type Product={id:string;name:string;description:string;stripePriceId:string;monthlyPrice:number;serverLimit:number;active:boolean};
export type Subscription={id:string;orgId:string;productId:string;stripeCustomerId?:string;stripeSubscriptionId?:string;status:'trialing'|'active'|'past_due'|'canceled'|'unpaid';currentPeriodStart?:string;currentPeriodEnd?:string;updatedAt:string};
// Measured usage for one organization hour or billing period. AI usage is kept per model; unknown calls have no reported tokens.
export type UsageAi=Record<string,{calls:number;inputTokens:number;outputTokens:number;unknownCalls:number}>;
export type UsageCounts={serverHours:number;logBytes:number;ai:UsageAi};
export type UsageDelta={serverHours?:number;logBytes?:number;ai?:{model:string;calls?:number;inputTokens?:number;outputTokens?:number;unknownCalls?:number}};
export type UsageHour=UsageCounts&{hour:string;periodStart:string;billable:boolean;exported:Record<string,number>;exportAttempts?:number;lastExportError?:string};
export function defaultSettings(tenantId:string):Settings{return{
  tenantId,
  detection:{warningPercent:2,criticalPercent:10,emergencyPercent:30,trafficMultiplier:5,distributedCrawlerCorrelation:true,applicationFailureDetection:true,heartbeatStaleSeconds:180},
  notifications:{whatsappEnabled:true,whatsappSenderId:process.env.GUARDSCALE_WHATSAPP_ORIGINATION_ID??'',emailEnabled:true,recipients:process.env.GUARDSCALE_NOTIFICATION_RECIPIENTS??''},
  response:{allowRemoteRequests:false,dryRun:true,defaultTtlSeconds:300,maxTtlSeconds:900,autoGuardian:{enabled:false,waitSeconds:120,maxTtlSeconds:60,maxActionsPerHour:3}},
  privacy:{evidenceRetentionDays:30,maxEvidenceLines:500,removeQueryValues:true,fingerprintUserAgents:true},
  updatedAt:new Date(0).toISOString(),
}}
