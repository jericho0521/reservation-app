import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_WHATSAPP_URL, shouldShowBookingMaintenanceFallback } from './booking-maintenance';

test('shouldShowBookingMaintenanceFallback returns true when services are empty', () => {
    assert.equal(shouldShowBookingMaintenanceFallback([], undefined, false), true);
});

test('shouldShowBookingMaintenanceFallback returns true when services fail to load', () => {
    assert.equal(shouldShowBookingMaintenanceFallback([], new Error('fetch failed'), false), true);
});

test('shouldShowBookingMaintenanceFallback waits while loading', () => {
    assert.equal(shouldShowBookingMaintenanceFallback([], undefined, true), false);
});

test('BOOKING_WHATSAPP_URL links to the Project Play WhatsApp number', () => {
    assert.match(BOOKING_WHATSAPP_URL, /^https:\/\/wa\.me\/601116281524\?/);
    assert.match(BOOKING_WHATSAPP_URL, /booking/i);
});
