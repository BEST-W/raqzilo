# Wajha Store — Codex handoff

Continue the existing Telegram store. Start from the `wajha-store` branch of `BEST-W/raqzilo`. The repository's default branch belongs to another project; keep store work on its dedicated branch.

## Owner's goal

Build an independently hosted Telegram store owned and managed by the user, with an Arabic Mini App and a private admin dashboard. Continue the current implementation.

The owner currently offers:
- Custom Telegram bot creation, priced after reviewing the buyer's requirements.
- Wajha Folio, a portfolio HTML template with an editor, Arabic/English support and up to 12 projects. Its full paid archive is not wired into this store.

## Current implementation

- `bot.py`: Telegram transport, menus, `/createbot`, free demo TXT delivery, temporary user order history and signed Telegram initData validation.
- `server.py`: Python standard-library HTTP server, static Mini App, `/health`, `/api/catalog`, authenticated demo/history endpoints and a secret-protected Telegram webhook.
- `public/index.html`: dark Arabic Mini App with a two-column catalog, search/category filters and five navigation pages: store, categories, orders, wallet status and profile.
- The bot-creation service prepares and stores a draft brief on the buyer's device. The brief can be copied or edited. It is NOT submitted to the merchant yet.
- Two catalog cards are explicitly design samples rather than purchasable products.
- Payment is disabled. No invoices are issued; pre-checkout requests are rejected.
- Free demo fulfillment sends only a clearly labeled TXT file, not the full paid template.
- Demo order history is held in memory and resets on process restart.
- `render.yaml` prepares a free Python web service. The current native Site preview is private and static; it does not run the Python backend.
- The @WajhaStoreBot menu currently points to that private preview. Opening it may require the owner's ChatGPT account.

## Verification completed

20 Python backend/HTTP tests passed, plus smoke checks for the bot-creation command and catalog. Inline JavaScript parsed successfully, and static HTML/SVG references were checked.

Browser layout, iPhone Telegram interaction, clipboard behavior and a complete live customer transaction have not been verified. Do not describe them as tested.

## Local commands

```sh
python3 -m unittest discover -s tests -v
python3 server.py
```

The server uses `0.0.0.0` and the `PORT` environment variable (default 10000). Python standard-library code requires no third-party dependencies.

Runtime configuration keys: `BOT_TOKEN`, `PUBLIC_URL`, `AUTO_CONFIGURE_WEBHOOK`, `CHANNEL_USERNAME`, `SUPPORT_USERNAME`.

`AUTO_CONFIGURE_WEBHOOK=true` configures the webhook and Telegram menu when a valid public HTTPS origin and token exist. Only switch the bot to a verified live deployment.

The bot token is absent from Git. Configure it through the owner's authorized runtime secret settings. The owner has already created the bot through BotFather.

## Next work

1. Inspect this branch and reproduce the checks. Preserve the existing storefront design and real offerings.
2. Complete the custom-service request flow: validate signed Telegram identity, validate the brief, record real requests durably, provide a receipt and let the verified owner review them. Verify the actual recipient before sending merchant notifications.
3. Add a private admin dashboard for products, descriptions, images, prices, options, visibility, theme/contact settings and orders. Save changes in durable storage and enforce owner authorization on the server.
4. Prepare independent hosting using the owner's chosen account. An earlier Render creation was rejected by automatic approval review because the target workspace and transfer of the bot token had not been explicitly confirmed. No Wajha Render service was created by that session. This handoff does not supply the missing approval.
5. After authorized deployment, verify health and protected API behavior, configure the Telegram webhook/menu for the live origin and test actual demo delivery.
6. Activate paid fulfillment only after the owner defines pricing, supplies the actual product archive and approves the sale setup. Set delivery and support terms before enabling purchases.

Use free resources for the trial unless the owner authorizes a paid plan. Free Render services may sleep and demo in-memory history is not durable; choose appropriate storage before accepting real orders.

Keep bot keys and paid product archives out of source, browser bundles and public static routes.
