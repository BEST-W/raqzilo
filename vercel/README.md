# Raqzilo on Vercel

Live website: **https://raqzilo.vercel.app/**

This directory contains the gateway and deployment configuration used by the live website. The gateway serves the PDF application from its existing published Site; Cloudflare Workers, D1, R2, owner sign-in and stored shares remain there. The original Site must remain active.

## Existing project configuration

- Root Directory when connecting this repository: `vercel`.
- Framework Preset: `Other`.
- Node.js: `24.x`.
- Build Command: `npm run build`.
- Output Directory: `public`.
- Environment variable: `PUBLIC_ORIGIN=https://raqzilo.vercel.app`.

The included routing configuration targets the current production domain. For a different domain, first run `npm run configure -- https://YOUR-DOMAIN.vercel.app` and set `PUBLIC_ORIGIN` to the same origin.

The gateway preserves binary PDF/WASM responses and React Flight framing. It serves local robots and sitemap responses with the production domain and includes the website's supplied Google ownership tags. Owner sign-in routes redirect to the original authenticated Site. Preview deployments retain their deployment protection and noindex behavior.

Large PDF sharing uploads use a CDN rewrite scoped to the production host, origin, exact upload route and public device cookie. Other writes retain same-origin and backend authorization checks. Personal documents, owner credentials and runtime data are not part of this directory.

## Development checks

Run `npm run build` and `npm test` using Node.js 24. The checks cover proxy headers and authorization, production/preview hosts, HTML and Flight metadata, PDF binary streaming, ranges, interruption and cancellation.

Connecting GitHub to the Vercel project can deploy gateway changes. Application changes in `../site/` still need the native application deployment workflow.

License: AGPL-3.0-only. See LICENSE.
