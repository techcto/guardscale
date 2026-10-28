import {NextRequest,NextResponse} from 'next/server';
import {destructiveAccess} from '@/lib/destructive-access';
import {sendMembershipEmail} from '@/lib/membership-email';
import {SignupError} from '@/lib/signup-policy';

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
 try{return NextResponse.json(await sendMembershipEmail(req,session.orgId,(await params).id),{status:202});}
 catch(error){return NextResponse.json({error:error instanceof SignupError?error.message:'Unable to send the invitation email. Organization access remains active.'},{status:error instanceof SignupError?error.status:503,...(error instanceof SignupError&&error.retryAfter?{headers:{'Retry-After':String(error.retryAfter)}}:{})});}
}
