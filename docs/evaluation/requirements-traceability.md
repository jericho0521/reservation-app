# Project requirements traceability

This reference maps final-year-project claims to implementation and repeatable evidence. “Automated” means it can be proven without live third-party credentials; environment-dependent proof is identified explicitly.

| Objective | Implemented evidence | Verification |
| --- | --- | --- |
| Reusable multi-domain reservation core | Capacity, assigned-resource and hybrid strategies in `reservations-core`; eight presets; three flagship apps | Package tests, flagship e2e, production builds |
| No-code-style experience configuration | Guided Studio for profile, branding, services, resources, availability, knowledge, channels, preview, validation, publish/version lifecycle | Console tests; Studio publish e2e |
| Safe public booking | Published browser-safe projection, current availability, atomic/idempotent create, hashed management token | API/database tests; security boundary proof |
| Omnichannel booking | Web booking, web chat, WhatsApp adapter, and credential-free simulation share the structured orchestrator | Omnichannel e2e; AI and WhatsApp package tests |
| Human oversight of automation | Unified conversation timeline, manual takeover, staff reply, automation suppression, audit events | Staff-takeover e2e; API/WhatsApp tests |
| Owner operations | Command center, filters, reservation detail/cancellation, resource maintenance and conflict warnings | Console and API tests; operations e2e |
| Decision support | Reservation volume, status mix, channel funnel/conversion, service popularity, time-slot demand, simulation filter | Analytics repository/API/console tests; operations analytics e2e |
| Multi-tenant security | Tenant/venue authorization context, scoped repositories/RPCs, owner/public separation, secret and QR scanners | Cross-scope negative tests; `pnpm deploy:verify` |
| Deployable modular architecture | Standalone Node API, package boundaries, generated contracts/SDK, indexed migration bundle, Docker configuration | Build, package boundary, migration bundle, deployment verification |
| Repeatable assessment | Guarded deterministic seed/reset/readiness, smoke tests, four presentation-critical e2e journeys, runbooks | `pnpm demo:reset`, `pnpm demo:verify`, `pnpm test:e2e` |
| Accessible presentation layer | Semantic owner shell, skip link, visible focus, labels/live messages, reduced motion, responsive layouts, chart tables | Console accessibility test, UI production builds, quality checklist |

## Environment-dependent evidence

- Live Supabase RLS, migration application, and database mutation proofs require a disposable configured database.
- Live Baileys linked-device behavior requires a WhatsApp account and persistent encrypted session storage.
- Live AI behavior requires a configured OpenAI-compatible provider.
- Hosted browser and accessibility walkthroughs require the final deployment URLs.

Deterministic simulation is not presented as proof that third-party services are available. It proves the platform-owned orchestration, authorization, state, persistence, and staff-control behavior independently of those services.

## Deliberate scope boundary

The assessed outcome is a reusable reservation experience and operations platform. Payments, marketplace discovery, native mobile apps, enterprise identity administration, advanced forecasting, and official WhatsApp Cloud API onboarding are future work rather than partially implemented claims.
