import { LoginForm } from "../../components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="login-heading">
        <span className="eyebrow">Owner console</span>
        <h1 id="login-heading">Welcome back</h1>
        <p>Sign in with your owner or staff account.</p>
        <LoginForm />
        <a className="auth-secondary-link" href="/admin/reset-password">Forgot your password?</a>
      </section>
    </div>
  );
}
