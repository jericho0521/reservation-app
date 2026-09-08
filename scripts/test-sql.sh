#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 -f tests/sql/bootstrap.sql
psql -v ON_ERROR_STOP=1 -f supabase/knowledge.sql
psql -v ON_ERROR_STOP=1 -f tests/sql/knowledge-replacement.sql
psql -v ON_ERROR_STOP=1 -f tests/sql/report-bootstrap.sql
psql -v ON_ERROR_STOP=1 -f supabase/sales-reports.sql
psql -v ON_ERROR_STOP=1 -f supabase/report-transactions.sql
psql -v ON_ERROR_STOP=1 -f tests/sql/report-transactions.sql
psql -v ON_ERROR_STOP=1 -f tests/sql/booking-bootstrap.sql
psql -v ON_ERROR_STOP=1 -f supabase/base-schema.sql
psql -v ON_ERROR_STOP=1 -f supabase/walk-in-bookings.sql
psql -v ON_ERROR_STOP=1 -f supabase/booking-integrity.sql
psql -v ON_ERROR_STOP=1 -f tests/sql/booking-integrity.sql
python3 tests/sql/booking-concurrency.py
