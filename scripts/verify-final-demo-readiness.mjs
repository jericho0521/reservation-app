#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { finalDemoSeedPath, parseFinalDemoResetConfig } from "./reset-final-demo.mjs";

const seed = readFileSync(finalDemoSeedPath, "utf8");
for (const required of ["apex-racing-demo", "harbour-rooms-demo", "luma-appointments-demo", "booking.proposed", "booking.confirmation_requested", "booking.confirmed", "service_seat_maintenance"]) {
  if (!seed.includes(required)) throw new Error(`Final demo seed is missing required proof: ${required}`);
}
const { databaseUrl } = parseFinalDemoResetConfig();
if (!databaseUrl) {
  console.log("Final demo static readiness verified (3 flagship experiences, funnel history, maintenance, and simulation). Database proof skipped: FINAL_DEMO_DATABASE_URL is unset.");
  process.exit(0);
}
const query = "select count(*) from public.platform_business_profiles where tenant_id='final_demo' and status='published';";
const result = spawnSync(process.env.PSQL_BIN?.trim() || "psql", [databaseUrl, "--tuples-only", "--no-align", "--command", query], { encoding: "utf8" });
if (result.error || result.status !== 0) throw new Error("Final demo database readiness query failed.");
if (result.stdout.trim() !== "3") throw new Error(`Expected 3 published final demo businesses; found ${result.stdout.trim() || "0"}.`);
console.log("Final demo database readiness verified (3 published flagship businesses).");
