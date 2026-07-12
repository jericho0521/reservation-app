import type { ReactNode } from "react";

export function MetricCard({ label, value, detail, accent, children }: { label: string; value: string | number; detail?: string; accent?: boolean; children?: ReactNode }) {
  return <article className={`metric-card${accent ? " accent-card" : ""}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}{children}</article>;
}
