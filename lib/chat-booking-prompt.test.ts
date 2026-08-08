import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBookingSystemPrompt } from './chat-booking-prompt';

test('booking prompt preserves multi-hour duration as one reservation', () => {
    const prompt = renderBookingSystemPrompt('2026-04-23');

    assert.match(prompt, /Use check_availability before offering or confirming any time slot/);
    assert.match(prompt, /Preserve the duration the user requested/);
    assert.match(prompt, /Never split it into separate one-hour bookings/);
    assert.match(prompt, /final booking is created only after the user presses the confirmation button/);
    assert.match(prompt, /plain text only/i);
    assert.match(prompt, /Do not use Markdown/i);
});

test('booking prompt includes retrieved business context', () => {
    const prompt = renderBookingSystemPrompt('2026-04-23', 'Custom venue policy');

    assert.match(prompt, /Relevant Business Information/);
    assert.match(prompt, /Custom venue policy/);
});
