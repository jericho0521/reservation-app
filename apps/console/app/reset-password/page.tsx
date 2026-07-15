import { PasswordResetRequestForm } from "../../components/auth/password-reset-request-form";

export default function PasswordResetPage() {
  return <div className="auth-page"><section className="panel auth-panel"><span className="eyebrow">Account recovery</span><h1>Reset your password</h1><p>If the account exists and email delivery is enabled, a one-time reset link will be sent.</p><PasswordResetRequestForm /><a href="/admin/login">Return to sign in</a></section></div>;
}
