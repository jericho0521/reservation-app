# Accessibility and responsive quality checklist

Use this checklist before a demonstration and after any owner-console or public-booking UI change. The July 2026 release-candidate audit covered the three flagship public experiences and every owner-console route.

## Automated evidence

- [x] Owner console exposes a keyboard-visible skip link to the main landmark.
- [x] Links, buttons, fields, selects, text areas, and disclosure controls have a consistent visible focus indicator.
- [x] Owner console and all three flagship public experiences respect `prefers-reduced-motion`.
- [x] Forms use visible labels; asynchronous Studio save and publish messages use polite live regions.
- [x] Charts retain an adjacent data table, and color is not the only status signal.
- [x] Owner console tests pass and the console, racing, room, and appointment production builds compile.

## Responsive walkthrough

At each width, complete Studio publish, public booking, staff takeover/reply, reservation lookup, maintenance review, and analytics filtering.

| Width | Expected behavior | Release-candidate audit |
| --- | --- | --- |
| 375px | Single-column forms and cards; horizontally scrollable primary navigation; readable tables; no clipped actions | Responsive rules and production builds verified |
| 768px | Single-column command-center content with usable filters and Studio navigation | Responsive rules and production builds verified |
| Desktop | Persistent owner navigation, two-column detail views, visible operational context | Responsive rules and production builds verified |

## Keyboard and screen-reader walkthrough

- [x] Skip link becomes visible on focus and moves focus to the main content.
- [x] Tab order follows the visual order; no interaction requires pointer hover.
- [x] Main navigation has an accessible name and pages retain a single primary heading.
- [x] Error, empty, loading, partial-outage, and success states have readable text labels.
- [x] Disabled and destructive actions remain distinguishable without relying only on color.
- [ ] Before the live presentation, repeat the walkthrough against the deployed URLs with the target browser and OS zoom set to 200%.

## Contrast and content review

- [x] Interactive focus uses the high-contrast accent with an offset outline.
- [x] Status pills pair color with text such as `healthy`, `attention`, `manual`, and `confirmed`.
- [x] Customer and owner terminology is consistent with the selected industry preset.
- [x] QR data, channel credentials, and private customer identifiers are absent from visible diagnostics.

The unchecked deployed-URL walkthrough is an operational rehearsal step, not a source-code release blocker; record it in the final demo checklist once hosting URLs are known.
