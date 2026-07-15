import { SetupOwnerForm } from "../../components/auth/setup-owner-form";

type SetupQueryValue = string | string[] | undefined;

export interface SetupLandingState {
  ready: boolean;
  heading: string;
  detail: string;
}

const setupTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export function getSetupLandingState(token: SetupQueryValue): SetupLandingState {
  if (typeof token === "string" && setupTokenPattern.test(token)) {
    return {
      ready: true,
      heading: "Infrastructure is ready",
      detail: "Your secure production services are running. Owner account creation is the next setup step.",
    };
  }
  return {
    ready: false,
    heading: "This setup link is invalid",
    detail: "Return to the server and use the one-time setup URL printed by the installer.",
  };
}

export default async function SetupLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: SetupQueryValue }>;
}) {
  const { token } = await searchParams;
  const state = getSetupLandingState(token);

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Production setup</span>
        <h1>{state.heading}</h1>
        <p>{state.detail}</p>
      </header>
      <section className="panel" aria-labelledby="setup-next-step">
        <span className="status-pill">{state.ready ? "Secure owner setup" : "Setup link required"}</span>
        <h2 id="setup-next-step">{state.ready ? "Create the first owner" : "Open the protected link again"}</h2>
        {state.ready && typeof token === "string"
          ? <SetupOwnerForm setupToken={token} />
          : <p>The setup capability is accepted only from the generated link. The token is not displayed or copied into this page.</p>}
      </section>
    </div>
  );
}
