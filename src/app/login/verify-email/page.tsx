import Link from 'next/link';
import VerifyEmail from './verify-email';
export default async function VerifyEmailPage({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <main className="min-vh-100 d-flex align-items-center justify-content-center p-3"><section className="g-card login-card"><Link className="eyebrow" href="/">← GuardScale</Link><h1>Verify your email.</h1><VerifyEmail token={token??''}/><p className="muted small" style={{marginTop:20}}><Link href="/login">Back to sign in</Link></p></section></main>}
