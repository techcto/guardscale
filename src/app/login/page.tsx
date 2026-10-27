import Link from 'next/link';
import LoginForm from './login-form';
import {redirect} from 'next/navigation';
import {browserSession} from '@/lib/browser-session';
import LiveLogPanel from '../live-log-panel';
import '../hero-log.css';
import './login.css';
export default async function Login({searchParams}:{searchParams:Promise<{mode?:string;verify?:string}>}){if(await browserSession())redirect('/console');const saas=process.env.GUARDSCALE_DEPLOYMENT_MODE==='saas';const {mode,verify}=await searchParams;return <main className="gs-auth-page"><LiveLogPanel/><section className="g-card login-card"><Link className="eyebrow" href="/">← GuardScale</Link><h1>Protect your infrastructure.</h1><p className="muted">{saas?'Sign in or create your isolated GuardScale workspace.':'Sign in to your private installation. Contact your administrator for access.'}</p>{verify==='done'&&<div className="notice" role="status"><strong>Email verified</strong><span>Your email address is confirmed. Sign in to continue.</span></div>}<LoginForm allowSignup={saas} initialSignup={saas&&mode==='signup'}/></section></main>}
