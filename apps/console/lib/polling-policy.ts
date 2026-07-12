export interface PollingPolicyInput {
  failures: number;
  hidden: boolean;
  online: boolean;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
}

export function nextPollingDelay(input: PollingPolicyInput): number | null {
  if (input.hidden) return null;
  const base = input.baseIntervalMs ?? 10_000;
  const max = input.maxIntervalMs ?? 60_000;
  const failures = Math.max(0, Math.min(10, Math.trunc(input.failures)));
  return Math.min(max, base * 2 ** (input.online ? failures : Math.max(1, failures)));
}
