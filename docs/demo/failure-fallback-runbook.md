# Demonstration failure fallback runbook

## Principle

Keep the story moving. State which external dependency failed, switch to the deterministic proof of the same platform boundary, and show the automated evidence. Do not debug credentials or display raw logs during the presentation.

## Fallback matrix

| Failure | Immediate fallback | Evidence to show |
| --- | --- | --- |
| WhatsApp cannot connect or QR expires | Use the credential-free simulation panel | Omnichannel e2e and takeover tests; channel readiness state |
| AI provider is unavailable | Use deterministic structured proposal responses | Shared orchestrator sequence and AI package tests |
| Hosted API is unavailable | Switch to the prepared local API or recorded read-only walkthrough | Health/smoke output and deployment verification |
| Database reset fails | Do not retry against an unknown host; use the last verified disposable demo database | Guarded reset output and seed readiness test |
| Public app cannot load | Show Studio preview, then the prepared local flagship app | Production build output and public booking e2e |
| Owner console cannot load | Use prepared screenshots only after confirming they contain no sensitive data | Console tests, architecture, and traceability matrix |
| Network is completely unavailable | Use local services and deterministic simulation | Full local release-candidate verification output |

## Recovery order

1. Preserve screen privacy: close terminals containing environment values and never expose QR/session material.
2. Check only the visible readiness status or health endpoint.
3. Switch to the matching deterministic path within 20 seconds.
4. Explain that the fallback traverses the same domain and persistence boundary unless explicitly noted.
5. Continue to the next story beat; defer diagnosis until after questions.

## Before presenting

- Keep local and hosted URLs in separate clearly named tabs.
- Seed and verify the disposable database immediately before rehearsal, not during the talk.
- Keep WhatsApp simulation enabled even when demonstrating a live linked device.
- Prepare a short screen recording of the complete journey only after the release-candidate revision is accepted.
- Test the recording offline and ensure it contains no credentials, QR data, email addresses, or phone numbers.
