import{NextResponse}from'next/server';import{sessionCookie}from'@/lib/session';
export async function POST(){const res=NextResponse.json({status:'signed-out'});res.cookies.set(sessionCookie,'',{httpOnly:true,path:'/',maxAge:0});return res}
