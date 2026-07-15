# Connect the AI booking assistant

AI is optional. Web booking remains available when AI is disabled.

## Save and test a provider

1. Sign in as an owner and open **AI provider**.
2. Enter the exact model identifier supplied by the supported provider.
3. Enter a base URL only when the provider requires a non-default compatible endpoint.
4. Paste the API key into the password field and press **Save AI settings**. The key is write-only; the console never reads it back.
5. Press **Test connection**. The test sends one bounded, non-customer request.
6. Enable AI automation and save only after the connection test succeeds.
7. Exercise one proposal-and-confirmation conversation before relying on the channel.

The model may explain and propose a booking, but only validated platform actions can create, reschedule, or cancel a reservation.

## Rotate or revoke the key

To rotate, enter the replacement key and save; leaving the field blank preserves the existing credential. Test again before closing the change record. To remove access immediately, press **Revoke API key**; automation cannot use the old key after revocation.

Never place a provider key in public frontend configuration, screenshots, support bundles, acceptance evidence, or conversation messages. If a test fails, use the safe console action and error code rather than copying a raw provider response.
