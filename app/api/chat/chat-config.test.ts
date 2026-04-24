import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemPrompt, getMalaysiaDateString, getOpenRouterChatModel } from './chat-config';

test('getMalaysiaDateString returns the Malaysia local date', () => {
  const date = new Date('2026-04-22T16:30:00.000Z');

  assert.equal(getMalaysiaDateString(date), '2026-04-23');
});

test('buildSystemPrompt requires confirmation-only booking creation', () => {
  const prompt = buildSystemPrompt('2026-04-23');

  assert.match(prompt, /Ask for only one missing booking detail at a time/);
  assert.match(prompt, /Use check_availability before offering or confirming any time slot/);
  assert.match(prompt, /NEVER call prepare_booking until you have collected ALL required details/);
  assert.match(prompt, /final booking is created only after the user presses the confirmation button/);
});

test('getOpenRouterChatModel defaults to Gemini Flash and supports override', () => {
  const originalModel = process.env.OPENROUTER_CHAT_MODEL;
  delete process.env.OPENROUTER_CHAT_MODEL;

  assert.equal(getOpenRouterChatModel(), 'google/gemini-2.5-flash');

  process.env.OPENROUTER_CHAT_MODEL = ' google/gemini-2.5-pro ';
  assert.equal(getOpenRouterChatModel(), 'google/gemini-2.5-pro');

  if (originalModel === undefined) {
    delete process.env.OPENROUTER_CHAT_MODEL;
  } else {
    process.env.OPENROUTER_CHAT_MODEL = originalModel;
  }
});
