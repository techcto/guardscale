import {redirect} from 'next/navigation';
export default function Signup(){redirect(process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas'?'/login?mode=signup':'/login')}
