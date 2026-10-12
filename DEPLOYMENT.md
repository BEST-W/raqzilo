# Wajha deployment and live verification

Work on `wajha-store` only. Python 3.12+ and its standard library suffice. No paid service has been created, no secret transferred and no Telegram menu changed by this implementation.

## Local development

Run `python3 -m unittest discover -s tests -v`, then `python3 server.py` from this checkout. The storefront is `/`, the owner dashboard `/admin`, and readiness is `/health`. Without BOT_TOKEN, authenticated endpoints deliberately fail closed. Without OWNER_TELEGRAM_ID, service intake and owner access are disabled. The owner opens `/admin` as a Telegram Web App using `/admin` in the bot when PUBLIC_URL is configured. Do not use an unsigned browser user ID for authentication.

Order intake returns a durable receipt and stores it directly in the owner's dashboard. It does not claim a merchant Telegram notification was delivered. Customers can retry a submission with the same request key without creating a second order; order history displays the latest five entries, and the owner sees all. SQLite data must remain on disk across deployments. It includes Telegram user IDs and customer briefs: keep access restricted, back it up and define retention before launch. Product images are HTTPS URLs; image file uploading is not implemented. Product options are editable display metadata, not paid configuration or Folio editor implementation. The actual Folio archive/editor remains external and unverified.

## Hosting gate

Obtain the owner's explicit confirmation of the target account/workspace and permission to deploy publicly and transfer BOT_TOKEN using secure settings. Use free resources only. The supplied Render free blueprint is a PREVIEW: `/tmp/wajha-data` is ephemeral, and a free Render instance may sleep. It must not be used to accept real orders without a separately approved durable storage plan. Do not silently upgrade to a paid disk. SQLite persistence was validated locally, not on a hosting provider.

Set BOT_TOKEN securely; set the verified numeric OWNER_TELEGRAM_ID, a private persistent DATA_DIR, and PUBLIC_URL to the public HTTPS origin. Keep AUTO_CONFIGURE_WEBHOOK=false initially. An empty database starts with the Folio product, Telegram bot creation and AI agent development; design samples are omitted from the live catalog. AI agent development is seeded once into existing catalogs without replacing owner edits or later restoring a hidden/deleted offering. SQLite uses WAL and serializes writes in one process. Run a single application instance with a local persistent volume; shared-network SQLite or multiple replicas are unsupported.

Service intake accepts `product_id` (`telegram-bot-creation` or `ai-agent-building`), defaulting to the original bot service for older clients. Receipts retain the service title and identity, including across retry/restart. A request key cannot be reused for another service. Both offerings obey the same intake safety switch. The public catalog includes only storefront settings and the intake-enabled flag; no owner ID, token or private orders. Customer navigation has no admin entry, and `/admin` reveals controls only after Telegram owner authorization succeeds.

Before switching the bot: verify deployed `/health`, `/api/catalog`, storefront and TLS; verify unsigned customer/admin calls are rejected, and a signed non-owner cannot view orders. Open the Mini App through Telegram, submit a real brief, verify its receipt and owner dashboard, restart the deployed service and confirm the request remains. Verify the intended owner account before any notification integration. Then, with the owner's authorization, set AUTO_CONFIGURE_WEBHOOK=true and restart: this changes the webhook and bot menu. Confirm Telegram getWebhookInfo and getChatMenuButton refer to the exact host. Exercise the live TXT demo and inspect the received document. Record iPhone/Telegram behavior separately from local Chromium checks.

## Paid fulfillment gate

No checkout/invoices or paid download routes are enabled. Admin draft prices cannot enable payment. Require owner-provided prices, the actual licensed Folio ZIP, delivery/support/refund terms and payment decision before adding paid fulfillment. For digital goods inside Telegram, evaluate Telegram Stars requirements before implementing any payment provider. Keep paid archives outside `public/` and Git; validate file integrity and order/payment ownership server-side before delivery. Test successful payment, duplicate events, failed delivery/retry and unauthorized downloads with the selected payment workflow before sales.

## Intake safety switch

`ACCEPT_SERVICE_REQUESTS` defaults to `false`. The free Render blueprint explicitly leaves it false, so adding the real owner ID and bot token cannot accidentally activate real service intake on ephemeral storage. Set it to `true` only after testing a persistent private DATA_DIR across hosting restart and redeploy. Local request tests enable this flag on isolated temporary databases. `/health` exposes `service_requests_enabled`.
