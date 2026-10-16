import {NextRequest,NextResponse} from 'next/server';
import {destructiveAccess} from '@/lib/destructive-access';
import {approveProtection} from '@/lib/protection-commands';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator approval and same origin required'},{status:403});
 const value=await req.json().catch(()=>null);if(value?.confirmation!=='Protect')return NextResponse.json({error:'Explicit Protect confirmation required'},{status:400});
 try{return NextResponse.json(await approveProtection(session.orgId,(await params).id,session.id));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Approval failed'},{status:409});}
}
