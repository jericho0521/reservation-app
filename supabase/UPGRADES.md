# Database upgrades for issue remediation

Apply SQL in a development or staging database before deploying the corresponding application changes. Repository merges do not apply SQL to a hosted database.

1. Run `supabase/knowledge.sql` to install atomic knowledge replacement before reseeding.
2. After the existing sales-report schema, run `supabase/report-transactions.sql` before deploying report processing or editing changes.

Report writes fail safely when the transaction function is missing. Financial extraction now requires administrator review before publication. Existing published reports are preserved.

3. Run `supabase/seat-maintenance-rpc-fix.sql` and `supabase/booking-integrity.sql` to serialize maintenance and enforce booking capacity, schedules, and seat labels on inserts and updates. Direct anonymous/authenticated inserts are revoked; creation uses server endpoints.

4. Run `supabase/request-controls.sql` before deploying public chat or booking changes. It adds durable quotas, idempotent booking identities, and delivery status. Missing controls fail closed with HTTP 503.

Chat sessions and confirmation proofs use `BOOKING_SIGNING_SECRET`, falling back to the existing server-only `SUPABASE_SERVICE_ROLE_KEY`. Rotating that key expires existing confirmations. The deployment trusts Vercel's overwritten source-IP header; other hosts use a shared conservative bucket until their trusted proxy integration is configured. No raw IP addresses or email addresses are stored in quota keys.

Default limits: chat 30 requests per source/session per 15 minutes, 500 globally per 15 minutes and 1,000 per day; bookings 10 per source, 20 per actor, 100 per service/date and 200 globally per hour; emails 3 per recipient and 300 globally per day. Successful retries reuse the existing booking and do not send another email.
