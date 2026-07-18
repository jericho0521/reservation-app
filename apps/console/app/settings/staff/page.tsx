import { redirect } from "next/navigation";
import { StaffInvitationForm } from "../../../components/auth/staff-invitation-form";
import { SetupError, safeSetupErrorMessage } from "../../../components/setup-error";
import { createConsolePlatformClient } from "../../../lib/platform-client";
import { staffStatusLabel, venueAssignmentOptions } from "../../../lib/staff-access";
import { updateStaffAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffSettingsPage() {
  const client = createConsolePlatformClient(process.env, fetch, { includeActiveVenue: false });
  let session;
  try {
    session = await client.getSession();
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
  if (session.role !== "owner") redirect("/");
  try {
    const [{ staff }, { locations }] = await Promise.all([
      client.listStaff(),
      client.listInstallationLocations(),
    ]);

    return <div className="page-stack">
      <header className="page-header"><span className="eyebrow">Settings · Access</span><h1>Staff access</h1><p>Invite operators, assign only the locations they need, and disable access without deleting history.</p></header>
      <section className="panel setup-summary"><h2>Invite staff</h2><p>Configured email delivery sends the invitation automatically. Otherwise, a manual invitation link appears exactly once.</p><StaffInvitationForm locations={locations} /></section>
      <section className="staff-access-list" aria-label="Staff accounts">
        {staff.length === 0 ? <article className="panel setup-summary"><h2>No staff accounts yet</h2><p>Create the first invitation above.</p></article> : staff.map((member) => {
          const options = venueAssignmentOptions(locations, member.venue_ids);
          return <article className="panel staff-access-card" key={member.user_id}>
            <header><div><span className="eyebrow">{staffStatusLabel(member.status)}</span><h2>{member.display_name}</h2><p>{member.email}</p></div><span className={`status-pill ${member.status}`}>{member.status}</span></header>
            <form action={updateStaffAccessAction} className="studio-form">
              <input type="hidden" name="user_id" value={member.user_id} />
              {member.status === "invited"
                ? <div><input type="hidden" name="status" value="" /><strong>Invitation pending</strong><p className="muted">The account becomes active only when the recipient accepts the one-time link.</p></div>
                : <label>Account status<select name="status" defaultValue={member.status}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>}
              <fieldset className="assignment-options"><legend>Assigned locations</legend>{options.map((option) => <label key={option.venueId}><input type="checkbox" name="venue_ids" value={option.venueId} defaultChecked={option.selected} />{option.label}</label>)}</fieldset>
              <button className="secondary-action" type="submit">Save access</button>
            </form>
          </article>;
        })}
      </section>
    </div>;
  } catch (error) {
    return <SetupError message={safeSetupErrorMessage(error)} />;
  }
}
