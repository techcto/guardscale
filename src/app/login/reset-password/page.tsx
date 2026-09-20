import {Suspense} from 'react';
import ResetPasswordForm from './reset-password-form';
export default function ResetPassword(){return <main className="min-vh-100 d-flex align-items-center justify-content-center"><section className="g-card login-card"><div className="eyebrow">Guardian.US control plane</div><h1>Choose a new password.</h1><Suspense fallback={null}><ResetPasswordForm/></Suspense></section></main>}
