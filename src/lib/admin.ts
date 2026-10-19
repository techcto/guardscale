import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {sessionCookie,verifySession} from './session';
export const saasMode=()=>process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';
// Layouts are not re-rendered on every navigation, so each admin page calls this itself.
export async function rootSession(){const s=await verifySession((await cookies()).get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');if(!s)redirect('/login');if(s.role!=='root')redirect('/settings');return s}
