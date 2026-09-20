import{NextRequest,NextResponse}from'next/server';import{operator}from'@/lib/operator';import{store}from'@/lib/store';
export async function GET(req:NextRequest){const session=await operator(req);if(!session)return NextResponse.json({error:'unauthorized'},{status:401});return NextResponse.json(await store.incidents(session.orgId))}
