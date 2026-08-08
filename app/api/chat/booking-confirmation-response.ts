interface ConfirmedBookingDetails {
  service: string;
  date: string;
  time: string;
  endTime: string;
  seats: number;
  email: string;
}

interface BookingCreationResult {
  success: boolean;
  email_sent?: boolean;
  error?: string;
}

export function getBookingConfirmationContent(
  booking: ConfirmedBookingDetails,
  result: BookingCreationResult,
) {
  if (!result.success) {
    return `Sorry, there was an issue: ${result.error}`;
  }

  const bookingSummary = `Great! Your booking is confirmed! 🎉 You've booked ${booking.seats} seat(s) for ${booking.service} on ${booking.date} from ${booking.time} to ${booking.endTime}.`;

  return result.email_sent
    ? `${bookingSummary} A confirmation email has been sent to ${booking.email}.`
    : `${bookingSummary} We couldn't send the confirmation email, so please save your booking details or contact Project Play for help.`;
}
