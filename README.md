# Wajha | Template Store

A Telegram store prototype with an Arabic Mini App, product menus, and real FREE demo-document delivery.

- `bot.py`: product catalog, commands, Telegram API adapter, demo delivery and initData validation.
- `server.py`: public Mini App, health check, authenticated demo endpoints and secret-protected webhook.
- `run_demo_bot.py`: temporary long polling; reads token through hidden stdin only.
- `public/index.html`: static preview and Telegram Mini App.
- The Mini App uses the supplied dark store reference: a two-column catalog and five working pages (store, categories, orders, wallet status, profile). Search and category filters run locally; order delivery and history require the hosted backend.
- The owner offers custom Telegram bot creation. Price and delivery time are determined after reviewing requirements. The Mini App prepares a local draft brief; nothing is submitted or charged until contact is connected. The backend exposes the service in /api/catalog and supports /createbot after hosting.
- Two additional cards are explicitly marked design samples; only the existing Wajha Folio product has a free demo-delivery flow. No ratings, sales, discounts, balances, or prices are fabricated.
- `render.yaml`: free web-service configuration for deployment once the owner selects the account and repository.

Payment is intentionally not enabled. No Star invoices are issued or approved. The prototype delivers only a small clearly labeled demo file, never the paid customer archive. Payment implementation and durable order storage must be completed before live sales.

Demo order history is in memory and resets on restart. A free Render service can spin down, so this is a trial setup, not a verified always-on sales service.

Create a Telegram channel in the user's app and add @WajhaStoreBot as administrator to connect a channel. A Bot API token cannot create a new user-owned channel.

## Local checks

`python -m unittest discover -s tests -v`

## Run the web service

Set BOT_TOKEN and PUBLIC_URL in hosting secrets, then run `python server.py`.
Set AUTO_CONFIGURE_WEBHOOK=true only for the deployed public HTTPS origin.
Never place BOT_TOKEN in HTML, Git, command-line flags, or this README.

The native Site publication is an owner-private UI preview. Its static publication does not run this Python server; external hosting is required for continuous Telegram execution.

## Current implementation update

See [DEPLOYMENT.md](DEPLOYMENT.md) for the current setup, hosting gates and verification limits. Service requests now have Telegram-authenticated, idempotent intake with SQLite persistence and customer receipts. `/admin` authorizes only OWNER_TELEGRAM_ID and edits catalog metadata, HTTPS image URLs, draft prices, options, colors, contacts and request statuses. Payments remain disabled. The free Render blueprint is an ephemeral preview, not durable live-order hosting. Earlier prototype notes above describe the prior implementation.

The catalog also offers **AI Agent Development** (`ai-agent-building`): customer support, answers from approved files, and task/tool automation scoped to the customer's brief. Pricing and timing are quoted after review; third-party AI/hosting costs are agreed separately. `/agents` shows the service in the bot. The Mini App keeps each service's draft separate and includes the selected `product_id` in intake. While service requests are closed, customers can prepare and copy a draft but cannot submit it. Adding the offering preserves existing owner catalog edits, and admin controls remain hidden until owner authorization succeeds.
