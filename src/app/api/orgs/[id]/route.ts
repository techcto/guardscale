import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{requestOrigin}from'@/lib/session';import{readBody}from'@/lib/read-body';import{DeletionBlocked,deleteOrganization}from'@/lib/admin';
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas')return NextResponse.json({error:'Organizations are disabled in private mode'},{status:403});
  const session=await operator(req);
  if(!session||session.role!=='root'||req.headers.get('origin')!==requestOrigin(req))return NextResponse.json({error:'forbidden'},{status:403});
  try{if(JSON.parse(await readBody(req,1024)).confirmation!=='DELETE')return NextResponse.json({error:'Type DELETE to confirm'},{status:400})}catch{return NextResponse.json({error:'Type DELETE to confirm'},{status:400})}
  try{if(!await deleteOrganization((await params).id))return NextResponse.json({error:'not found'},{status:404})}
  catch(e){if(e instanceof DeletionBlocked)return NextResponse.json({error:e.message},{status:409});throw e}
  return NextResponse.json({status:'deleted'});
}
