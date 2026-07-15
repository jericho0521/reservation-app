import { PasswordResetRequestForm } from "../../components/auth/password-reset-request-form";

export default function PasswordResetPage() {
  return <div className="auth-page"><section className="panel auth-panel"><span className="eyebrow">Account recovery</span><h1>Reset your password</h1><p>Submit the account email. The response never confirms whether an account exists.</p><PasswordResetRequestForm /></section></div>;
}
