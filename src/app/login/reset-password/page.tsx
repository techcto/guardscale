import {Suspense} from 'react';
import ResetPasswordForm from './reset-password-form';
export default function ResetPassword(){return <main className="login-page"><section className="login-card"><div className="eyebrow">Guardian.US control plane</div><h1>Choose a new password.</h1><Suspense fallback={null}><ResetPasswordForm/></Suspense></section></main>}
