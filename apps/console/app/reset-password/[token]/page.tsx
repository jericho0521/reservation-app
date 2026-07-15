import { PasswordResetCompletionForm } from "../../../components/auth/password-reset-completion-form";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export default async function PasswordResetCompletionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = tokenPattern.test(token);
  return <div className="auth-page"><section className="panel auth-panel"><span className="eyebrow">Account recovery</span><h1>{valid ? "Choose a new password" : "This reset link is invalid"}</h1><p>{valid ? "Completing this reset revokes every existing session for the account." : "Request a new reset link and try again."}</p>{valid ? <PasswordResetCompletionForm token={token} /> : <a href="/admin/reset-password">Request another reset</a>}</section></div>;
}
