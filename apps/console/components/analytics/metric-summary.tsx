import type { AnalyticsResponse } from "@reservation-platform/sdk";
import { percent } from "../../lib/analytics-view";
import { MetricCard } from "../overview/metric-card";

export function MetricSummary({ analytics }: { analytics: AnalyticsResponse }) {
  return <section className="metric-grid analytics-metrics" aria-label="Analytics summary"><MetricCard label="Reservations" value={analytics.totals.reservations} detail={`${analytics.totals.cancelled} cancelled`} accent /><MetricCard label="Cancellation rate" value={percent(analytics.totals.cancellation_rate)} detail="Cancelled ÷ all reservations" /><MetricCard label="Conversation conversion" value={percent(rate(analytics.funnel.reservations_created, analytics.funnel.conversations_started))} detail="Conversation started → reservation" /><MetricCard label="AI containment" value={percent(analytics.automation.containment_rate)} detail="Conversations without staff takeover" /><MetricCard label="Takeover rate" value={percent(analytics.automation.takeover_rate)} detail={`${analytics.automation.staff_takeovers} staff-controlled`} /></section>;
}
function rate(value: number, denominator: number) { return denominator === 0 ? 0 : value / denominator; }
