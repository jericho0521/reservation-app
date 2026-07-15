# Put one appointment business into service

This tutorial is for the person responsible for a new production installation. It starts with a clean Ubuntu server and ends with one verified public booking, an off-host recovery key, and a verified backup. The supported product model is one business per installation.

## What you need

- An x86-64 Ubuntu 22.04 or 24.04 server with at least 2 CPU cores, 2 GiB RAM, and 10 GiB free disk.
- Docker Engine and Docker Compose v2 available to `root`.
- A DNS A record pointing a dedicated domain to the server, with ports 80 and 443 open.
- The extracted, signed release bundle and access to its digest-pinned images.
- The business name, public slug, timezone, address, services, practitioners, and normal opening hours.

Do not create or edit a production `.env` file. The installer owns infrastructure configuration; the owner console owns business and provider configuration.

## 1. Install the release

From the extracted release directory, substitute the real values:

```bash
sudo ./scripts/production/install.sh \
  --domain appointments.example.com \
  --release 0.2.0 \
  --host-ip 203.0.113.10
```

The installer verifies the bundle and image identities, creates protected secrets, applies migrations, starts the services, checks HTTPS, and prints a one-time setup URL. If a recoverable attempt stops, correct the reported problem and repeat the same values with `--resume`. See [the detailed installation reference](../operations/production-install.md).

## 2. Create the first owner

Open the printed `/admin/setup?token=...` URL in a private browser window. Do not copy it into a ticket, screenshot, chat, or shell history. Create the owner account, then sign in at `/admin/login`. The setup capability must not appear in the rendered page after it has been accepted.

## 3. Complete the seven setup steps

Follow the console in order:

1. Name the business and choose its public slug.
2. Confirm the first location, address, and IANA timezone.
3. Add the appointment services and durations customers can book.
4. Add practitioners and associate them with the services they perform.
5. Set weekly hours and closures.
6. Choose channel defaults. AI and WhatsApp may remain disabled at launch.
7. Review validation, preview the customer experience, and publish deliberately.

For field-level guidance, use [Owner onboarding](../how-to/owner-onboarding.md).

## 4. Configure delivery channels when required

Email, AI, and WhatsApp are optional integrations. Configure them in the owner console, never in a browser-visible environment file. Test each provider before enabling it:

- [Connect the AI booking assistant](../how-to/connect-ai.md)
- [Connect WhatsApp](../how-to/connect-whatsapp.md)

The public web booking flow remains the required baseline channel.

## 5. Make a real booking

Open the public booking URL in a private window. Choose a service, practitioner where applicable, date, and live slot. Enter test contact details controlled by the business and press **Confirm reservation** once. In the console, open **Reservations** and verify that the appointment appears at the correct local time with the web channel recorded.

Use the customer management link to verify that the installation can load the reservation without exposing an owner credential. Do not include that opaque link in release evidence.

## 6. Establish recovery before launch

Copy the backup recovery key to an offline password manager or encrypted removable medium, separate from both the server and its backups. Then create a verified encrypted backup and copy the archive plus its checksum off the server. Follow [Encrypted backup and verified restore](../operations/backup-restore.md); a backup that exists only on the application server is not disaster recovery.

## 7. Record the launch check

Open **System status** and confirm the release, migration, database, worker, disk, and backup status. Run the public readiness probe and inspect the Compose service list as described in [Interpret System Status](../operations/system-status.md). Finally, generate a sanitized support bundle and store it with the operator record—not with customer data.

The installation is ready for normal operation when public booking works, the appointment is visible to staff, readiness is healthy, and a verified off-host backup can be identified.
