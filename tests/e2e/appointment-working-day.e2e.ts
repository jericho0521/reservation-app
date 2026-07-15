import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canTransition } from "../../apps/console/lib/appointment-view.ts";

type AppointmentState = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
type JobState = "queued" | "leased" | "sent";

interface WorkingDaySnapshot {
  appointment: {
    id: string;
    managementTokenHash: string;
    status: AppointmentState;
    date: string;
    startTime: string;
    endTime: string;
  };
  audit: Array<{ event: string; detail: string }>;
  jobs: Array<{ id: string; kind: "confirmation" | "reminder"; state: JobState }>;
}

class WorkingDayStore {
  constructor(readonly snapshot: WorkingDaySnapshot) {}

  static publicBooking(managementToken: string) {
    return new WorkingDayStore({
      appointment: {
        id: "appointment-001",
        managementTokenHash: digest(managementToken),
        status: "pending",
        date: "2026-07-20",
        startTime: "09:00",
        endTime: "09:30",
      },
      audit: [{ event: "appointment.created", detail: "web_booking" }],
      jobs: [{ id: "job-confirmation-001", kind: "confirmation", state: "queued" }],
    });
  }

  static restart(serialized: string) {
    return new WorkingDayStore(JSON.parse(serialized) as WorkingDaySnapshot);
  }

  serialize() { return JSON.stringify(this.snapshot); }

  verifiesManagementToken(token: string) {
    return this.snapshot.appointment.managementTokenHash === digest(token);
  }

  claimJob(kind: "confirmation" | "reminder") {
    const job = this.snapshot.jobs.find((candidate) => candidate.kind === kind && candidate.state === "queued");
    assert.ok(job, `${kind} job should be queued`);
    job.state = "leased";
    return job.id;
  }

  completeJob(jobId: string) {
    const job = this.snapshot.jobs.find((candidate) => candidate.id === jobId);
    assert.ok(job, "leased job should still exist");
    assert.equal(job.state, "leased");
    job.state = "sent";
    if (job.kind === "confirmation") this.transition("confirmed", "confirmation worker");
  }

  staffReschedule(date: string, startTime: string, endTime: string, reason: string) {
    assert.equal(this.snapshot.appointment.status, "confirmed");
    assert.ok(reason.trim());
    Object.assign(this.snapshot.appointment, { date, startTime, endTime });
    this.snapshot.audit.push({ event: "appointment.rescheduled", detail: reason });
    this.snapshot.jobs.push({ id: "job-reminder-001", kind: "reminder", state: "queued" });
  }

  transition(next: AppointmentState, detail: string) {
    const current = this.snapshot.appointment.status;
    assert.equal(canTransition(current, next), true, `${current} must explicitly allow ${next}`);
    this.snapshot.appointment.status = next;
    this.snapshot.audit.push({ event: `appointment.${next}`, detail });
  }
}

test("appointment working day survives API and worker restarts", () => {
  const managementToken = "customer-management-token-001";
  const initial = WorkingDayStore.publicBooking(managementToken);
  const confirmationJob = initial.claimJob("confirmation");
  initial.completeJob(confirmationJob);
  initial.staffReschedule("2026-07-20", "10:00", "10:30", "Customer requested a later slot");

  const afterApiRestart = WorkingDayStore.restart(initial.serialize());
  assert.equal(afterApiRestart.verifiesManagementToken(managementToken), true);
  assert.deepEqual(afterApiRestart.snapshot.appointment, {
    id: "appointment-001",
    managementTokenHash: digest(managementToken),
    status: "confirmed",
    date: "2026-07-20",
    startTime: "10:00",
    endTime: "10:30",
  });

  const afterWorkerRestart = WorkingDayStore.restart(afterApiRestart.serialize());
  const reminderJob = afterWorkerRestart.claimJob("reminder");
  afterWorkerRestart.completeJob(reminderJob);
  afterWorkerRestart.transition("completed", "staff command center");

  assert.equal(afterWorkerRestart.snapshot.appointment.status, "completed");
  assert.deepEqual(afterWorkerRestart.snapshot.audit.map((entry) => entry.event), [
    "appointment.created",
    "appointment.confirmed",
    "appointment.rescheduled",
    "appointment.completed",
  ]);
  assert.deepEqual(afterWorkerRestart.snapshot.jobs, [
    { id: "job-confirmation-001", kind: "confirmation", state: "sent" },
    { id: "job-reminder-001", kind: "reminder", state: "sent" },
  ]);
});

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
