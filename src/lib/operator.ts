import{NextRequest}from'next/server';import{sessionCookie,verifySession}from'./session';
export function operator(req:NextRequest){return verifySession(req.cookies.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'')}
