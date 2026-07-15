# Onboard an appointment business

Use this guide after the first owner account exists. It configures the business-facing data that all booking channels share.

## Complete the setup workspace

1. Sign in at `/admin/login` and open **Business Setup**.
2. In **Business**, enter the customer-facing name and a stable lowercase public slug. Treat the slug as a public URL contract.
3. In **Location**, enter the address and an IANA timezone such as `Asia/Kuala_Lumpur`. Appointment boundaries, reminders, and the working-day calendar use this timezone.
4. In **Services**, create only bookable offerings. Give each a clear name, duration, preparation/buffer rules, and active status.
5. In **Staff**, create each practitioner and select the services that person can perform. Do not use a practitioner record as a login account unless the staff access workflow also creates one.
6. In **Hours**, set normal weekly intervals and date-specific closures. Check split-day schedules carefully.
7. In **Channels**, leave optional integrations disabled until their connection tests pass.
8. In **Review**, inspect the customer preview, follow every validation link, and publish only when the validation summary is clear.

## Finish operational setup

- Configure **Email delivery** if customers need confirmations or reminders.
- Create staff access with the smallest role and location scope needed.
- Open the public booking URL in a private window and make one controlled test appointment.
- Verify the appointment in **Reservations**, then cancel the test appointment if it should not consume capacity.
- Open **System status** and confirm there is a recent verified backup.

Changing a draft does not change the public experience until it is published. Review the preview and validation summary after every material change.
