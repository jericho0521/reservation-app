import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import BookingTicket from "./BookingTicket";

const ticketProps = {
  service: "Racing Simulator",
  date: "2026-08-10",
  time: "14:00",
  seats: 2,
  name: "Alex",
  email: "alex@example.com",
  phone: "+60 12-345 6789",
  bookingId: "d75c16b3-76eb-4d32-852d-d952758aa31f",
};

test("BookingTicket shows the real reference without a placeholder QR", () => {
  const html = renderToStaticMarkup(
    <BookingTicket {...ticketProps} emailSent />,
  );

  assert.match(html, /Reference: d75c16b3-76eb-4d32-852d-d952758aa31f/);
  assert.doesNotMatch(html, /grid-cols-7/);
  assert.doesNotMatch(html, /QR Code/);
  assert.match(html, /Confirmation sent to/);
});

test("BookingTicket warns when the email could not be sent", () => {
  const html = renderToStaticMarkup(
    <BookingTicket {...ticketProps} emailSent={false} />,
  );

  assert.match(html, /Email confirmation could not be sent/);
  assert.match(html, /Your booking is still confirmed/);
  assert.doesNotMatch(html, /Confirmation sent to/);
});

test("BookingTicket does not invent a reference when none is returned", () => {
  const html = renderToStaticMarkup(
    <BookingTicket {...ticketProps} bookingId={undefined} emailSent />,
  );

  assert.doesNotMatch(html, /Reference:/);
});
