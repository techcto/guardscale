import {NextRequest,NextResponse} from 'next/server';
import {operator} from '@/lib/operator';
import {signToken} from '@/lib/session';
import {integrationIdentity,IntegrationToken} from '@/lib/integration-auth';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'invalid origin'},{status:403});
 const session=await operator(req);
 if(!session||!await integrationIdentity(req))return NextResponse.json({error:'unauthorized'},{status:401});
 const input=await req.json().catch(()=>({}));
 if(input.permission!==undefined&&!['read','response'].includes(input.permission))return NextResponse.json({error:'Invalid permission'},{status:400});
 if(input.permission==='response'&&!['root','admin'].includes(session.role))return NextResponse.json({error:'Administrator required for response tools'},{status:403});
 const expiresAt=Date.now()+3600000;
 const token=await signToken<IntegrationToken>({purpose:input.permission==='response'?'integration-response':'integration-read',userId:session.id,orgId:session.orgId,expiresAt},process.env.GUARDSCALE_SESSION_SECRET??'');
 return NextResponse.json({token,expiresAt},{headers:{'Cache-Control':'no-store'}});
}
