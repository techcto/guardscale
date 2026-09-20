import Link from 'next/link';
import ForgotPasswordForm from './forgot-password-form';
export default function ForgotPassword(){return <main className="min-vh-100 d-flex align-items-center justify-content-center"><section className="g-card login-card"><div className="eyebrow">Guardian.US control plane</div><h1>Reset your password.</h1><p className="muted">Enter your username and we&apos;ll email you a link to choose a new password.</p><ForgotPasswordForm/><p className="muted small" style={{marginTop:20}}><Link href="/login">Back to sign in</Link></p></section></main>}
