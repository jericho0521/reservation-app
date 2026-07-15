# Connect WhatsApp

The WhatsApp worker runs inside the same one-business production installation. Linked-device credentials are stored durably and encrypted with the installation key; the pairing QR is a short-lived secret displayed only to an authorized owner.

## Pair the business device

1. Sign in as an owner and open **WhatsApp setup** or **Channels & AI**.
2. Confirm WhatsApp reports **Setup required** rather than an infrastructure error.
3. Press **Start QR pairing**.
4. On the business phone, open WhatsApp **Linked devices**, choose **Link a device**, and scan the displayed code.
5. Keep the page open until the session reports connected, then send a controlled inbound message and verify it appears in **Conversations**.

Do not photograph, copy, log, or attach the QR payload. The UI may render it as an image, but application and support logs must not contain it.

## Recover a disconnected session

Open the channel page and press **Reconnect session** when offered. If the credentials were revoked on the phone or are no longer valid, disconnect the session deliberately and start a new QR pairing. Disconnecting affects WhatsApp delivery but does not delete reservation or conversation history.

Before moving or restoring the installation, create a verified encrypted backup. The persistent WhatsApp session directory and its encryption key are recovery material and must move together through the supported backup/restore workflow.
