import Link from 'next/link';
import {browserSession} from '@/lib/browser-session';

export default async function PublicAuthLinks({saas}:{saas:boolean}){
 const session=await browserSession();
 return session?<Link href="/console">Console ↗</Link>:<><Link href="/login">Sign in</Link>{saas&&<Link className="button gs-outline" href="/signup">Sign up →</Link>}</>;
}
