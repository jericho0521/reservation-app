import { InvitationAcceptanceForm } from "../../../components/auth/invitation-acceptance-form";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = tokenPattern.test(token);
  return <div className="auth-page"><section className="panel auth-panel"><span className="eyebrow">Staff invitation</span><h1>{valid ? "Activate your staff account" : "This invitation link is invalid"}</h1><p>{valid ? "Choose your display name and password to join the assigned business locations." : "Ask the business owner for a current one-time invitation link."}</p>{valid ? <InvitationAcceptanceForm token={token} /> : null}</section></div>;
}
