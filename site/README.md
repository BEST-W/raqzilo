# Raqzilo — independent Vercel application

Arabic/English PDF editing, page organization, OCR, Markdown conversion and optional sharing. PDF processing runs in the browser; only explicit sharing uploads a selected copy. The stable public domain is https://raqzilo.vercel.app/.

## Runtime and development

Node.js 24.x, Next.js 16, npm with the committed `package-lock.json`. No ChatGPT sign-in or Cloudflare runtime bindings are used by this application.

```sh
npm ci
cp .env.example .env.local
# For local development, set TURSO_DATABASE_URL=file:local.db in .env.local.
node scripts/prepare-pdf-assets.mjs
npm run dev
```

Production requires the Turso integration to inject `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, and a private Vercel Blob store connected with OIDC to inject `BLOB_STORE_ID`. Use free plans only unless the owner explicitly chooses a paid upgrade. Keep production and preview databases/stores separate so preview tests cannot modify live data. Vercel builds fail if the required production bindings are missing.

Database tables initialize with idempotent SQL on first access. Site settings use optimistic revision checks; sharing reservations use atomic SQLite transactions. Neither browser-side code nor source archives receive service credentials.

Vercel project settings: Root Directory `site`, Framework `Next.js`, install `npm ci`, build `npm run build`, Node.js `24.x`. Connect `BEST-W/raqzilo` and select the intended production branch only after staging and validation. Repository edits then deploy through Vercel's Git integration.

## Owner administration

Open `/admin` to sign in with the owner's password. Visitors do not see an administration link. The server verifies a hashed, expiring session; identity headers from the old ChatGPT gateway confer no permission.

First activation requires a private one-use link. In Vercel, set `OWNER_SETUP_TOKEN` to a securely generated 32-byte hexadecimal token (64 characters), and `OWNER_SETUP_EXPIRES` to a future Unix timestamp in milliseconds. Deploy, then privately open `/admin/setup#token=YOUR_TOKEN` and choose a password of 14–128 characters directly on the site. The fragment is removed from browser history and is not sent in a page request. Activation refuses missing, incorrect or expired tokens and refuses replacement of an existing owner. Remove activation variables and redeploy after activation.

Session cookies are HttpOnly, SameSite=Strict and Secure on Vercel. Sign out invalidates the server-side session. Login is rate limited in the database. Settings changes and sharing writes reject cross-origin requests. No public registration or first-visitor owner claim is provided.

If the password is lost, the Vercel/Turso account owner can reset access through the database: delete `owner_sessions`, delete the single `owner_login` row, and issue a fresh expiring activation link. Do not post passwords, activation keys or database credentials in GitHub issues or commit them.

## Sharing

A grant reserves quota before upload. The server authorizes a presigned direct upload to one exact private Blob pathname, limited to PDF, the reserved size and expiry. Direct upload avoids sending a 10 MiB file through a Vercel function request. Completion reads the object, validates size and PDF markers, and marks it ready. Only ready files are served from `/api/shares/[id]/file`; private Blob credentials are never included in public file links.

Limits: 10 MiB per PDF, 5 grants per browser per UTC day, 100 per site per day, 3 unfinished uploads, 100 stored files and 256 MiB reserved storage. Quotas count reserved files as well as ready files. Creator capability cookies authorize own-file listing/deletion; the authenticated owner can list/delete all shares. Anyone holding a share URL can read its PDF. PDF signature checks are not a malware scanner.

Responses preserve UTF-8 filenames, HEAD and single byte ranges. PDF and private routes use no-store/noindex. Deletion hides the file before deleting private storage. Expired unfinished grants are cleaned in bounded batches. No usage analytics are included.

## Migration from the existing Site

Keep the old backend and stable domain active until migration checks pass. Preserve the supplied Google ownership tags, public canonical URL and existing share IDs.

1. Connect free Turso and private Blob resources to the existing Vercel project. Stage a production deployment with `--prod --skip-domain`; do not promote it yet.
2. Export only `site_settings` and ready `pdf_shares` rows from the trusted existing Site into a private manifest outside Git. For settings, decode `config` into an object and preserve `revision` and `updated_at`. For shares include only `id`, `filename`, `size`, `creator_hash` and `created_at`; do not migrate the old authentication identity or unfinished upload tokens.
3. Set private, expiring `MIGRATION_TOKEN` and `MIGRATION_EXPIRES` on the candidate. POST the manifest to `/api/migration` using `Authorization: Bearer TOKEN`. The server accepts only that capability, fetches PDFs from the fixed stable domain, validates them and copies them to private storage while preserving public paths and creator hashes. Conflicting rows fail rather than overwrite changes. An interrupted run can resume; a completed import cannot be repeated.
4. Verify every imported PDF's bytes, filename, HEAD and range responses. Test activation/login/logout, unauthorized requests, settings persistence, actual browser PDF/MD/OCR tools and a new share's complete upload/read/delete cycle on the deployed candidate.
5. Promote the exact tested candidate to the stable alias, then connect the intended Git production branch. Remove migration/activation variables after use. Retain the earlier gateway deployment for rollback until the independent flow is verified.

Manifest shape (use real private data only outside this repository):

```json
{"shares":[],"settings":{"config":{},"revision":1,"updated_at":"2026-10-11T00:00:00.000Z"}}
```

Omit `settings` when the source table is empty. `config` must satisfy the full settings schema; the empty object above is a shape illustration, not an executable import.

## Verification

```sh
npm test
npm run build
npm run test:http
node scripts/test-bilingual.mjs
node scripts/test-local-pdf.mjs
```

The suite covers local SQLite transactions, owner/creator permissions, expiring activation, password hashing, quotas, scoped direct uploads, validation/cleanup, settings persistence/conflicts, language preference, PDF editing/redaction/page order, Arabic text, Markdown detection and OCR fallback. The HTTP suite exercises the built Next app with a temporary local database and fixture credentials. These checks do not substitute for real deployed Turso/Blob and browser verification.

## License and corresponding source

GNU AGPL-3.0; see `LICENSE`. `/source.zip` is generated during build and contains the corresponding application source, configuration templates, fonts and locked installation instructions, excluding credentials and generated vendor files. Preserve all third-party license notices.

MuPDF JavaScript is self-hosted from the locked npm package, with source at https://github.com/ArtifexSoftware/mupdf.js and https://github.com/ArtifexSoftware/mupdf. MuPDF and the application are AGPL-3.0. The unmodified package and notices are obtained through `npm ci`.

pdf-lib, @pdf-lib/fontkit, docx and fflate are MIT-licensed. Font notices are in `public/licenses/DejaVu.txt`. Tesseract.js, its core and Arabic/English data are Apache-2.0; the notice is in `public/licenses/Tesseract-Apache-2.0.txt`. `prepare-pdf-assets.mjs` self-hosts their locked runtime/language assets without a paid OCR or AI service.
