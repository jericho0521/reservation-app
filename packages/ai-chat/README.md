# @reservation-platform/ai-chat

Provider-neutral optional AI chat workflow contracts for the reservation
platform backend.

This package intentionally contains no provider SDKs, framework runtime imports,
storage adapters, tenant secrets, or environment reads. Hosts inject model,
retrieval, checkpoint, audit, clock, and tenant configuration ports.

The package is private while the backend extraction is in progress. It is built,
packed into local release-candidate tarballs, and checked by package boundary
verification, but it is not published to a registry until real provider adapters
and deployment wiring are scoped.
