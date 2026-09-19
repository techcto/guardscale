import{NextRequest,NextResponse}from'next/server';import{verifyResetToken}from'@/lib/session';import{hashPassword}from'@/lib/password';import{store}from'@/lib/store';
export async function POST(req:NextRequest){
  const {token,password}=await req.json() as {token?:string;password?:string};
  const secret=process.env.GUARDIAN_SESSION_SECRET;
  if(!secret)return NextResponse.json({error:'Sessions are not configured'},{status:503});
  if(!password||password.length<12)return NextResponse.json({error:'Use a password of at least 12 characters'},{status:400});
  const claim=await verifyResetToken(token,secret);
  if(!claim)return NextResponse.json({error:'This reset link is invalid or has expired'},{status:400});
  const user=await store.userById(claim.userId);
  if(!user||user.status!=='active')return NextResponse.json({error:'This reset link is invalid or has expired'},{status:400});
  await store.putUser({...user,updatedAt:new Date().toISOString()},hashPassword(password));
  return NextResponse.json({status:'reset'});
}
