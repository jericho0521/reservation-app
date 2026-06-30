# @reservation-platform/whatsapp

Backend-only WhatsApp channel package for the reservation platform.

This package exposes provider-neutral channel contracts plus a self-hosted
`session_qr` lifecycle for business owners who connect WhatsApp by scanning a
linked-device QR code. The QR mode is intended for one business deployment per
backend instance and is less stable than the official Meta Cloud API path.

The package does not import frontend frameworks or Next.js. The default
`session_qr` adapter uses `@whiskeysockets/baileys` behind the
`WhatsAppSessionAdapter` port so the rest of the platform does not depend on
WhatsApp Web internals.

## Provider modes

- `meta_cloud`: official WhatsApp Business Platform shape, reserved for a Meta
  Cloud API adapter.
- `session_qr`: self-hosted QR session shape for one business deployment.

## Runtime env

```env
RESERVATION_WHATSAPP_ENABLED=true
RESERVATION_WHATSAPP_PROVIDER=session_qr
RESERVATION_WHATSAPP_SESSION_AUTH_DIR=.reservation-whatsapp-sessions
RESERVATION_WHATSAPP_SESSION_ENCRYPTION_KEY=replace-with-a-long-secret
```

`session_qr` is an unofficial linked-device mode and should be used for
self-hosted, one-business deployments. If the session expires, the owner must
scan a fresh QR code.

## API host routes

The standalone API host mounts owner/session lifecycle endpoints plus business
configuration, text knowledge, and conversation audit endpoints:

- `POST /v1/channels/whatsapp/session/start`
- `GET /v1/channels/whatsapp/session/status`
- `GET /v1/channels/whatsapp/session/qr`
- `POST /v1/channels/whatsapp/session/logout`
- `GET/PATCH /v1/channels/whatsapp/config`
- `GET/POST /v1/channels/whatsapp/knowledge`
- `PATCH/DELETE /v1/channels/whatsapp/knowledge/{knowledge_id}`
- `GET /v1/channels/whatsapp/conversations`
- `GET /v1/channels/whatsapp/conversations/{conversation_id}/messages`

When backend auth is configured, these routes use the same platform bearer auth
as the reservation and chat endpoints.

## Current agent behavior

The module includes the channel runtime, message normalization, text/FAQ
knowledge retrieval, outbound reply sending, and conversation/message audit.
The default responder is intentionally simple. A production host should inject
an `@reservation-platform/ai-chat` responder that can use the business config,
knowledge entries, and reservation tools with a confirm-before-booking policy.
