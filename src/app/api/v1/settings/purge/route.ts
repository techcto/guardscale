import {NextRequest,NextResponse} from 'next/server';
import {destructiveAccess} from '@/lib/destructive-access';
import {store} from '@/lib/store';
export const maxDuration=300;
export async function POST(req:NextRequest){
  const session=await destructiveAccess(req);if(!session)return NextResponse.json({error:'Administrator access and same-origin request required'},{status:403});
  const input=await req.json().catch(()=>null);
  if(input?.confirmation!=='PURGE')return NextResponse.json({error:'Type PURGE to confirm'},{status:400});
  try{return NextResponse.json(await store.purgeCollectedData(session.orgId))}
  catch{return NextResponse.json({error:'Purge did not finish. Some records may have been removed; retry to clear the remainder.'},{status:500})}
}
