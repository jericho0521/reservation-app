# Manage AI Knowledge

Business owners can add approved reference material for web chat and WhatsApp from **Experience Studio → Knowledge & channels**. Knowledge indexing runs inside the installation and does not use the configured AI provider or require a separate embedding key.

## Add an FAQ

1. Open **FAQs**.
2. Enter a customer question and the approved answer.
3. Save the entry.
4. Check the indexing summary. The entry becomes available to retrieval when its source is `ready`.

The deterministic assistant can still match FAQs when no AI provider is configured.

## Add pasted text

1. Open **Documents**.
2. Enter an internal title and a short customer-visible source label.
3. Paste up to 100,000 characters of approved text.
4. Select **Add knowledge source**.
5. Wait for the source status to become `ready`.

Use a label customers will understand, such as “Cancellation policy” or “Visitor guide.” This label is shown in answer citations; the internal title is not.

## Add a PDF

1. Open **Documents**.
2. Enter the title and customer-visible source label.
3. Select a text-based PDF of no more than 5 MiB and 100 pages.
4. Select **Add knowledge source**.
5. Wait for the source status to become `ready`.

The platform extracts and retains normalized text, then discards the uploaded bytes. Encrypted, malformed, image-only, and text-empty PDFs are rejected. OCR is not supported.

## Test retrieval

1. Open **Test retrieval**.
2. Enter a sample customer question.
3. Select **Test retrieval**.
4. Review the matching source, excerpt, semantic score, lexical rank, and final rank.

This test performs only tenant- and venue-scoped local retrieval. It does not call the BYOK AI provider or consume provider credits.

## Replace or archive a source

- Use **Replace content** to update pasted text or upload a replacement PDF under the same source identity. The worker indexes a new version, and stale jobs cannot overwrite it.
- Use **Reindex** after a transient indexing failure.
- Use **Archive** to remove a source from retrieval immediately. Historical conversation citations keep only the customer-safe source label and ID.

## Understand fallback behavior

- With AI and retrieval available, answers use only retrieved reference chunks and show citations.
- With AI available but retrieval degraded, the assistant can still perform structured booking tasks but does not make document-based claims.
- Without AI, deterministic FAQ matching and booking syntax remain available.
- Retrieval failure does not stop reservations, staff operations, email, or WhatsApp processing.

Do not upload credentials, private staff notes, health records, payment data, or material that customers should not receive. Knowledge content and customer queries are excluded from ordinary application logs, but approved source text is stored in the installation database and included in encrypted backups.
