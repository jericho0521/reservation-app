import assert from "node:assert/strict";
import test from "node:test";

import { deriveOnboardingState, onboardingSteps, requiredPriorStep } from "./onboarding-state.js";

test("onboarding blocks publish until required appointment sections are complete", () => {
  const result = deriveOnboardingState({
    ownerCreated: true,
    businessConfigured: true,
    locations: 1,
    activeServices: 1,
    activePractitioners: 0,
    operatingIntervals: 5,
    webBookingReady: true,
    emailReady: false,
    published: false,
  });

  assert.equal(result.nextStep, "staff");
  assert.equal(result.canPublish, false);
});

test("onboarding follows the fixed production sequence and completes only after publish", () => {
  assert.deepEqual(onboardingSteps, [
    "business",
    "location",
    "services",
    "staff",
    "hours",
    "channels",
    "review",
  ]);
  const ready = deriveOnboardingState({
    ownerCreated: true,
    businessConfigured: true,
    locations: 2,
    activeServices: 1,
    activePractitioners: 2,
    operatingIntervals: 5,
    webBookingReady: true,
    emailReady: true,
    published: false,
  });
  assert.equal(ready.nextStep, "review");
  assert.equal(ready.canPublish, true);
  assert.equal(ready.complete, false);

  const published = deriveOnboardingState({ ...readyInput(), published: true });
  assert.equal(published.nextStep, undefined);
  assert.equal(published.canPublish, false);
  assert.equal(published.complete, true);
});

test("web booking can reach review while Phase 3 email delivery remains pending", () => {
  const result = deriveOnboardingState({
    ...readyInput(),
    emailReady: false,
    published: false,
  });

  assert.equal(result.nextStep, "review");
  assert.equal(result.canPublish, true);
  assert.equal(result.emailDelivery, "phase_3_pending");
});

test("future setup URLs return to the first incomplete persisted step", () => {
  const state = deriveOnboardingState({
    ...readyInput(),
    activePractitioners: 0,
    operatingIntervals: 0,
    webBookingReady: false,
    published: false,
  });

  assert.equal(requiredPriorStep(state, "services"), undefined);
  assert.equal(requiredPriorStep(state, "staff"), undefined);
  assert.equal(requiredPriorStep(state, "hours"), "staff");
  assert.equal(requiredPriorStep(state, "review"), "staff");
});

function readyInput() {
  return {
    ownerCreated: true,
    businessConfigured: true,
    locations: 1,
    activeServices: 1,
    activePractitioners: 1,
    operatingIntervals: 5,
    webBookingReady: true,
    emailReady: true,
  };
}
