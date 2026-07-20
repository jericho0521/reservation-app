#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const setupUrlPattern = /^http:\/\/127\.0\.0\.1:4300\/admin\/setup\?token=[A-Za-z0-9_-]{43}$/u;

export async function verifyLocalProductOnboarding(options = {}) {
  const project = options.project ?? process.env.RESERVATION_STACK_PROJECT?.trim();
  const evidenceDirectory = path.resolve(options.evidenceDirectory ?? "tmp/product-onboarding-proof");
  await rm(evidenceDirectory, { recursive: true, force: true });
  await mkdir(path.join(evidenceDirectory, "video"), { recursive: true });

  const cleanCounts = readProductCounts(project);
  assertCleanProductCounts(cleanCounts);
  const setupUrl = readSetupUrl(project);
  const setupToken = new URL(setupUrl).searchParams.get("token");
  if (!setupToken) throw new Error("The protected setup URL did not contain a capability.");
  const slug = `proof-appointments-${Date.now()}`;
  const customerName = "Proof Customer";
  const bookingDate = futureIsoDate(7);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: path.join(evidenceDirectory, "video"), size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const video = page.video();
  let selectedTime;

  try {
    await page.goto(setupUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.location.search === "");
    await page.getByRole("heading", { name: "Create the first owner" }).waitFor();
    await screenshot(page, evidenceDirectory, "01-first-owner-setup.png");

    await page.getByLabel("Your name").fill("Product Proof Owner");
    await page.getByLabel("Email address").fill("product-proof-owner@example.test");
    await page.getByLabel("Password").fill("product-proof-password-2026");
    await page.getByRole("button", { name: "Create owner account" }).click();
    await page.waitForURL(/\/admin\/setup\/business$/u);
    const reuseResponse = await context.request.post("http://127.0.0.1:4100/v1/setup/owner", {
      headers: { Origin: "http://127.0.0.1:4300" },
      data: {
        setup_token: setupToken,
        email: "second-owner@example.test",
        display_name: "Second Owner",
        password: "second-owner-password-2026",
      },
    });
    if (reuseResponse.status() !== 401 && reuseResponse.status() !== 409) {
      throw new Error("The consumed first-owner setup capability was accepted again.");
    }
    await screenshot(page, evidenceDirectory, "02-empty-business-onboarding.png");

    await page.locator('input[name="name"]').fill("Product Proof Appointments");
    await page.locator('input[name="public_slug"]').fill(slug);
    await page.locator('input[name="location_name"]').fill("Main Studio");
    await page.locator('input[name="timezone"]').fill("Asia/Kuala_Lumpur");
    await page.locator('textarea[name="address"]').fill("Synthetic acceptance location");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await page.waitForURL(/\/admin\/setup\/location$/u);
    await page.getByRole("link", { name: "Use this location" }).click();

    await page.waitForURL(/\/admin\/setup\/services$/u);
    await page.locator('input[name="name"]').fill("Proof Consultation");
    await page.locator('textarea[name="description"]').fill("A synthetic appointment used for Docker product verification.");
    await page.locator('input[name="duration_minutes"]').fill("30");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await page.waitForURL(/\/admin\/setup\/staff$/u);
    await page.locator('input[name="label"]').fill("Proof Practitioner");
    await page.getByRole("button", { name: "Save practitioner and continue" }).click();

    await page.waitForURL(/\/admin\/setup\/hours$/u);
    await page.locator('input[name="booking_horizon_days"]').fill("60");
    await page.locator('input[name="slot_interval_minutes"]').fill("30");
    await page.locator('input[name="minimum_notice_minutes"]').fill("0");
    for (let day = 0; day < 7; day += 1) {
      await page.locator(`input[name="day_${day}_start_0"]`).fill("09:00");
      await page.locator(`input[name="day_${day}_end_0"]`).fill("17:00");
    }
    await page.getByRole("button", { name: "Save and continue" }).click();

    await page.waitForURL(/\/admin\/setup\/channels$/u);
    await page.getByRole("button", { name: "Save and continue" }).click();

    await page.waitForURL(/\/admin\/setup\/review$/u);
    await screenshot(page, evidenceDirectory, "03-review-before-publish.png");
    await page.locator('input[name="confirm_publish"]').check();
    await page.getByRole("button", { name: "Publish and open dashboard" }).click();
    await page.waitForURL(/\/admin\/?$/u);
    await page.getByRole("heading", { name: "Product Proof Appointments" }).waitFor();
    await screenshot(page, evidenceDirectory, "04-published-owner-dashboard.png");

    await page.goto(`http://127.0.0.1:4400/${slug}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Product Proof Appointments" }).waitFor();
    await screenshot(page, evidenceDirectory, "05-published-public-experience.png");

    await page.goto(`http://127.0.0.1:4400/${slug}/book`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Proof Consultation/u }).click();
    await page.locator("button.rp-practitioner-card", { hasText: "Proof Practitioner" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('input[type="date"]').fill(bookingDate);
    await page.getByRole("button", { name: "Continue" }).click();
    const firstSlot = page.locator("button.rp-slot:not([disabled])").first();
    await firstSlot.waitFor();
    selectedTime = (await firstSlot.locator(".rp-slot-time").textContent())?.trim();
    if (!selectedTime) throw new Error("No selectable time was returned for the configured appointment.");
    await firstSlot.click();
    await page.getByRole("button", { name: "Continue" }).click();
    const customerInputs = page.locator(".rp-customer-grid input");
    await customerInputs.nth(0).fill(customerName);
    await customerInputs.nth(1).fill("proof-customer@example.test");
    await customerInputs.nth(2).fill("Docker product acceptance");
    await page.getByRole("button", { name: "Continue" }).click();
    await screenshot(page, evidenceDirectory, "06-booking-review.png");
    await page.getByRole("button", { name: "Confirm reservation" }).click();
    await page.getByRole("heading", { name: "You are booked" }).waitFor();
    await screenshot(page, evidenceDirectory, "07-booking-confirmed.png");

    await page.goto(`http://127.0.0.1:4300/admin/reservations?date=${bookingDate}`, { waitUntil: "networkidle" });
    await page.getByText(customerName).waitFor();
    await screenshot(page, evidenceDirectory, "08-owner-sees-booking.png");

    await page.goto(`http://127.0.0.1:4400/${slug}/book`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Proof Consultation/u }).click();
    await page.locator("button.rp-practitioner-card", { hasText: "Proof Practitioner" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('input[type="date"]').fill(bookingDate);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator(".rp-slot-grid").waitFor();
    const conflictingSlot = page.locator("button.rp-slot").filter({ hasText: selectedTime });
    if (await conflictingSlot.count() > 0 && await conflictingSlot.first().isEnabled()) {
      throw new Error("The already-booked practitioner slot remained selectable.");
    }
    await screenshot(page, evidenceDirectory, "09-conflict-capacity-reflected.png");

    const bookingProof = readBookingProof(project);
    if (bookingProof.service_duration_minutes !== 30 || bookingProof.booking_duration_minutes !== 30) {
      throw new Error("The configured 30-minute service did not produce a 30-minute reservation.");
    }
    if (bookingProof.reservations !== 1) {
      throw new Error("The product proof expected exactly one confirmed reservation.");
    }

    compose(project, ["down"]);
    compose(project, ["up", "-d"]);
    await waitForHealthyProduct();
    await page.goto(`http://127.0.0.1:4300/admin/reservations?date=${bookingDate}`, { waitUntil: "networkidle" });
    await page.getByText(customerName).waitFor();
    await screenshot(page, evidenceDirectory, "10-booking-persists-after-restart.png");

    const composeLogs = compose(project, ["logs", "--no-color", "--since", "15m"], { encoding: "utf8" });
    await writeFile(
      path.join(evidenceDirectory, "compose.log"),
      sanitizeEvidenceLogs(`${composeLogs.stdout}\n${composeLogs.stderr}`),
    );
    await writeFile(path.join(evidenceDirectory, "result.json"), `${JSON.stringify({
      status: "passed",
      clean_install: cleanCounts,
      business_count: 1,
      setup_token_reuse_rejected: true,
      booking_visible_to_owner: true,
      conflicting_slot_selectable: false,
      service_duration_minutes: bookingProof.service_duration_minutes,
      booking_duration_minutes: bookingProof.booking_duration_minutes,
      restart_persistence: true,
      compose_logs_sanitized: true,
      booking_date: bookingDate,
      selected_time: selectedTime,
    }, null, 2)}\n`);
  } finally {
    await context.close();
    await browser.close();
    const sourceVideo = await video?.path().catch(() => undefined);
    if (sourceVideo) await rename(sourceVideo, path.join(evidenceDirectory, "product-onboarding-journey.webm"));
  }

  return { evidenceDirectory, bookingDate, selectedTime };
}

function readSetupUrl(project) {
  const result = compose(project, [
    "--profile", "operations", "run", "--rm", "--no-deps", "reservation-setup-url",
  ], { encoding: "utf8" });
  const setupUrl = result.stdout.trim();
  if (!setupUrlPattern.test(setupUrl)) {
    throw new Error("The product stack did not return a valid protected setup URL.");
  }
  return setupUrl;
}

function readProductCounts(project) {
  const result = compose(project, [
    "exec", "-T", "reservation-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "reservation", "--tuples-only", "--no-align",
    "--command", "select json_build_object('installations',(select count(*) from public.platform_installation),'tenants',(select count(*) from public.tenants),'owners',(select count(*) from public.platform_users),'venues',(select count(*) from public.venues),'services',(select count(*) from public.services),'resources',(select count(*) from public.reservable_resources),'reservations',(select count(*) from public.bookings),'demo_tenants',(select count(*) from public.tenants where id='final_demo'));",
  ], { encoding: "utf8" });
  return JSON.parse(result.stdout.trim());
}

function readBookingProof(project) {
  const result = compose(project, [
    "exec", "-T", "reservation-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "reservation", "--tuples-only", "--no-align",
    "--command", "select json_build_object('service_duration_minutes',(select duration_minutes from public.services limit 1),'booking_duration_minutes',(select extract(epoch from (end_time-start_time))/60 from public.bookings limit 1),'reservations',(select count(*) from public.bookings));",
  ], { encoding: "utf8" });
  const value = JSON.parse(result.stdout.trim());
  return {
    service_duration_minutes: Number(value.service_duration_minutes),
    booking_duration_minutes: Number(value.booking_duration_minutes),
    reservations: Number(value.reservations),
  };
}

function assertCleanProductCounts(counts) {
  const expected = {
    installations: 1,
    tenants: 1,
    owners: 0,
    venues: 0,
    services: 0,
    resources: 0,
    reservations: 0,
    demo_tenants: 0,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (counts[key] !== value) throw new Error(`Clean product stack expected ${key}=${value}.`);
  }
}

function compose(project, args, options = {}) {
  const result = spawnSync(
    "docker",
    ["compose", ...(project ? ["-p", project] : []), ...args],
    { encoding: options.encoding ?? "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error || result.status !== 0) {
    throw new Error("A required product-stack Docker command failed.");
  }
  return result;
}

function futureIsoDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sanitizeEvidenceLogs(value) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .replace(/token=[A-Za-z0-9_-]{20,}/gu, "token=[redacted]")
    .replace(
      /\b(authorization|cookie|set-cookie|api[_-]?key|password)(["':= ]+)[^\s,}]+/giu,
      "$1$2[redacted]",
    );
}

async function waitForHealthyProduct() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const [api, consoleResponse, booking] = await Promise.all([
        fetch("http://127.0.0.1:4100/v1/health"),
        fetch("http://127.0.0.1:4300/admin/login"),
        fetch("http://127.0.0.1:4400/"),
      ]);
      if (api.ok && consoleResponse.ok && booking.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("The product stack did not recover after a full Compose restart.");
}

function screenshot(page, directory, name) {
  return page.screenshot({ path: path.join(directory, name), fullPage: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyLocalProductOnboarding().then(
    ({ evidenceDirectory }) => process.stdout.write(`Verified clean browser onboarding, booking visibility, and conflict handling. Evidence: ${evidenceDirectory}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Local product onboarding verification failed."}\n`);
      process.exitCode = 1;
    },
  );
}
