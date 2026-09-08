# Database upgrades for issue remediation

Apply SQL in a development or staging database before deploying the corresponding application changes. Repository merges do not apply SQL to a hosted database.

1. Run `supabase/knowledge.sql` to install atomic knowledge replacement before reseeding.
2. After the existing sales-report schema, run `supabase/report-transactions.sql` before deploying report processing or editing changes.

Report writes fail safely when the transaction function is missing. Financial extraction now requires administrator review before publication. Existing published reports are preserved.
