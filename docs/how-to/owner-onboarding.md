# Onboard a seat-capacity business

Use this guide after the first owner account exists. It configures the business-facing data that all booking channels share.

## Complete the setup workspace

1. Sign in at `/admin/login` and open **Business Setup**.
2. In **Business**, enter the customer-facing name and a stable lowercase public slug. Treat the slug as a public URL contract.
3. In **Services**, create only bookable offerings. Give each a clear name, duration, and the shared number of seats customers can reserve in each time slot.
4. In **Hours**, set normal weekly intervals and date-specific closures. Check split-day schedules carefully.
5. In **Review**, inspect the customer preview, follow every validation link, and publish only when the validation summary is clear.

The default setup does not create individual seat or practitioner records.
Pooled capacity belongs to the service and is reduced atomically as reservations
are confirmed. Existing businesses using the appointment preset retain the
location, practitioner, and channel setup steps.

## Finish operational setup

- Configure **Email delivery** if customers need confirmations or reminders.
- Create staff access with the smallest role and location scope needed.
- Open the public booking URL in a private window and make one controlled test reservation.
- Verify the seat count in **Reservations**, then cancel the test reservation if it should not consume capacity.
- Open **System status** and confirm there is a recent verified backup.

Changing a draft does not change the public experience until it is published. Review the preview and validation summary after every material change.
