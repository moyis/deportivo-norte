# Photo upload for the club history project — design

Date: 2026-10-19
Status: awaiting approval
Repo: `deportivo-norte` (Astro 7 + Tailwind 4 + Vercel)

## Intent and why

Club Deportivo Norte (1937, La Perla, Mar del Plata) is assembling a history
gallery of what happened over the years. The photos are not in the club's
hands — they are in the albums of members, families, old players and
neighbours. The plan is to open a window for roughly two weeks, share a link
with the people who have them, and collect what arrives. Everything received is
curated by hand afterwards; nothing is published automatically.

This piece is only the "send us your photos" half: make it as easy as possible
for someone holding an old photo to get it to the club at full quality, and
leave the collected material sitting privately in storage, ready to curate.

## Goals

- A person with the link can send one photo or forty, from a phone or a
  computer, with no account, no login and no questions asked of them.
- Photos arrive at full quality in the club's own Cloudflare R2 storage,
  private, waiting for curation.
- The link stops working after 14 days with nobody having to remember to switch
  it off, and can be killed early if it circulates further than intended.
- Nothing this feature does can touch any other project's data.

## Non-goals (this round)

- No public gallery, no listing page, no image delivery to site visitors.
- No per-photo metadata: no captions, years, names or stories.
- No moderation UI, approval workflow, or email notifications.
- No resizing, EXIF stripping, duplicate detection or format conversion.

## Anti-goals (would make this a failure even if it technically works)

- **Rejecting a photo from a well-meaning older member** because it is 18 MB,
  or asking them to shrink it first. Losing detail is worse than a slow upload;
  curation happens at full quality or not at all.
- **The link dying mid-window because storage filled up.** This is the reason
  R2 was chosen over Vercel Blob, whose Hobby tier includes only 1 GB and — on
  overrun — blocks access for 30 days rather than billing.
- **Anyone being able to list or browse what other people sent.** Uploads are
  write-only from the outside; nothing exposes the bucket.
- **A half-uploaded file reading as a success.** The person must be told
  clearly which photos arrived and which did not.
- **An unlimited hole in the storage bill**, since the link will circulate.
- **Reaching into another project's bucket.** The wedding site's photos live in
  a bucket this feature must never be able to read, write or delete.

## Constraints found while looking

- The site is deployed on **Vercel**. `deportivonorte.com.ar` is on Cloudflare
  DNS, but **not proxied** — `www` resolves straight to Vercel's anycast IP and
  responses carry no `cf-ray`. Cloudflare cannot intercept a path on the site's
  own domain (no Worker route there) without first proxying the whole site, and
  no Cloudflare WAF rate-limiting rules can apply to it either.
- **Vercel Functions cap request bodies at 4.5 MB** (`413
  FUNCTION_PAYLOAD_TOO_LARGE`). The wedding site's shape — browser → API route on
  the site → storage — cannot carry a 25 MB photo on Vercel. The photo bytes
  must go **directly from the browser to R2**, which is what presigned URLs are
  for.
- **R2 does not support S3's form-based `POST` upload**, so the
  `content-length-range` policy — the standard way to cap an upload's size at
  signing time — is unavailable. A presigned `PUT` can pin the `Content-Type`
  but **not the byte size**.
- The site is `output: 'static'`, but individual routes can opt out with
  `prerender = false` (the existing YouTube JSON route already does). This
  matters to the page, see below.

## The shape

```
browser                     www.deportivonorte.com.ar (Vercel)           R2
  |                                   |                                |
  |-- POST /api/upload-url ---------->|  token + deadline + type       |
  |      { name, size, type }         |  + ceiling check               |
  |<-- { key, url, contentType,       |  signs a PUT (10 min)          |
  |      receipt }                    |                                |
  |                                                                   |
  |-- PUT url  (the photo itself) ----------------------------------->|
  |<-- 200 ------------------------------------------------------------|
  |                                                                   |
  |-- POST /api/upload-complete ----->|  HEAD the object               |
  |      { key, receipt }             |  size over 25 MB? -> DELETE    |
  |<-- { ok } or { ok:false, reason }--|                               |
```

Only the small JSON hops touch Vercel. The photo never passes through it, so
the 4.5 MB limit never applies.

### 1. The page

`https://www.deportivonorte.com.ar/subir` — `noindex`, unlinked from the site
(not in the navbar), reachable only from the shared link. The link carries the
secret: `/subir?k=<token>`.

**This page is server-rendered** (`prerender = false`), not static. The window's
open/closed state and the validity of the token are secrets that only the
server knows, and the page must be able to say "este link no es válido" or "la
convocatoria ya cerró" *before* anyone picks a photo. Rendering that server-side
avoids a third status endpoint and avoids a flash of a form that cannot work.

- The interactive part is an Astro component with a vanilla `<script>`,
  matching how every other interaction in this repo works (no UI framework is
  installed, and one drop zone does not justify adding one).
- Drop zone plus file picker, `multiple`, mobile-first (`accept="image/*"` so it
  opens the phone's camera roll).
- Thumbnail previews of selected files via local `blob:` URLs (nothing is
  uploaded to render them).
- Per-file progress, one file at a time, via `XMLHttpRequest` to the presigned
  URL (the only browser API that reports upload progress). Each file shows
  pendiente / subiendo / llegó / no se pudo.
- A clear result: "12 de 12 fotos llegaron" / "2 no se pudieron subir" with a
  reason per failure, and a "subir más fotos" action that needs no reload.
- No compression. The best copy is what gets curated.

### 2. Signing route — `POST /api/upload-url`

`src/pages/api/upload-url.ts`, `prerender = false`. Checks, in order:

1. token matches `UPLOAD_TOKEN` (constant-time compare);
2. now is before `UPLOAD_UNTIL`;
3. declared `type` is JPEG / PNG / WebP / HEIC, and declared size ≤ 25 MB
   (**advisory only** — the client can lie, see the completion route);
4. the bucket is not already over its ceiling (see "Bounded damage").

Then it generates a key `photos/<timestamp>-<uuid>.<ext>`, signs a `PutObject`
for that key with the `Content-Type` **pinned into the signature** (so an upload
declaring `image/jpeg` and sending something else fails with `403
SignatureDoesNotMatch`), expiring in ~10 minutes, and returns the URL, the
content type it pinned, and a short-lived **receipt** proving the server issued
that key.

Signing is pure crypto with no round trip to R2, so the route stays fast and
cheap. **The signed host is virtual-hosted style** —
`https://<bucket>.<account>.r2.cloudflarestorage.com/<key>` — which is what the
CSP must name exactly.

Credentials live in Vercel's environment: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. `R2_ACCOUNT_ID` and `R2_BUCKET` are not
secrets (they appear in URLs anyway); the CSP needs the host at **build** time,
so those two are also available as plain build-time values rather than being
read only at runtime.

### 3. Completion route — `POST /api/upload-complete`

Where the after-the-fact enforcement lives, since a presigned PUT cannot refuse
an oversized body up front. Given the receipt from above, the route:

- `HEAD`s the object to learn its **real** byte size;
- if it exceeds 25 MB, **deletes it** and answers `{ ok: false, reason:
  'too-large' }` so the person is told rather than left thinking it worked;
- if the key is missing entirely, reports it as a failed upload too.

The receipt is what keeps this route from being a weapon: it is an HMAC
(minted from `UPLOAD_TOKEN`, labelled for this purpose, so **no additional
secret is needed**) over the key and an issued-at time, and without a valid
receipt the route refuses to look at or touch anything. A client therefore
cannot ask the club's own endpoint to delete arbitrary keys. The route also
refuses any key that is not under its own prefix.

### 4. Bounded damage

The link will leak. Five things bound what that costs:

- the **14-day window** — an expired token cannot get a signature at all;
- the **pinned Content-Type**, enforced cryptographically by R2;
- the **25 MB per-object check** at completion;
- the **global ceiling**, measured in **bytes** — this is the load-bearing one.
  A count-only ceiling would still permit N objects of unbounded size, which is
  exactly the hole the anti-goals forbid. A count limit rides along as a
  secondary guard;
- the **blast radius**: a dedicated bucket and a token scoped to it, so no
  failure here can reach another project's data.

The ceiling is read from what is actually in the bucket via a prefix listing at
signing time, so there is no separate counter to drift out of sync. Uploads past
the ceiling are refused before a URL is ever signed, and a single batch may
overshoot it by at most one file (25 MB).

**Changed from the earlier draft, deliberately:** per-IP rate limiting is
*dropped*. It needs ephemeral state (a KV/Redis store) and a new resource to
maintain, and it buys little here — the ceiling is what actually bounds the
blast radius, and the person to worry about is not a botnet but a link being
forwarded too widely. If the builder finds a cheap way to add it later, fine;
it is not load-bearing.

### 5. The CSP

Two lines in `astro.config.mjs`, both narrower than they sound:

- `connect-src` gains `https://<bucket>.<account>.r2.cloudflarestorage.com`, so
  the browser may `PUT` to R2. `'self'` already covers the two API routes.
- `img-src` gains `blob:`, so the selected-photo previews can render. Without
  this the previews fail silently, because the current policy is `'self' data:
  https://i.ytimg.com`.

Nothing else about the CSP loosens. The uploaded photos are never rendered back
to the visitor, so the R2 host does not belong in `img-src`.

### 6. Repo layout

```
src/pages/subir.astro              # the page + drop zone (SSR)
src/pages/api/upload-url.ts        # signing route
src/pages/api/upload-complete.ts   # size check + delete
src/lib/upload.ts                  # shared: token compare, limits, signature, receipt
```

No Worker, no new subdomain, no new deploy target — everything ships with the
site on Vercel.

## Decided (the club's calls)

- Anyone with the link can upload; the link is the only credential.
- The window is 14 days.
- Photos only — no video.
- Pure drop and go: no fields, nothing asked of the sender.
- Storage is Cloudflare R2, reached by **presigned URLs** rather than a Worker.
- **A new bucket belonging to the club**, in the same Cloudflare account, with
  its own API token — *not* the bucket the wedding photos live in.

## My calls (flagged so they can be vetoed)

- Bucket name `deportivo-norte-photos`, prefix `photos/` inside it.
- 25 MB per photo, JPEG / PNG / WebP / HEIC, everything else refused politely.
- Token in the query string `k`, compared in constant time; the deadline is
  `UPLOAD_UNTIL`, a secret rather than a build-time constant, so it can be
  extended without a deploy.
- **After the deadline the page still opens** and explains the window has
  closed, rather than dead-ending. More dignity for someone who opens the link
  on day 16.
- The token is per-campaign, so a later round gets its own link and the old one
  stays dead.
- A 10-minute signature expiry — long enough for a slow phone upload to start,
  short enough not to be a reusable hole.
- Two API routes rather than one, because the completion check is what turns an
  unenforceable size cap into an enforced one.
- The page is served, not static, so the closed/invalid states are real
  server-side states rather than client-side guesses.

## Left to the builder

- The visible design of the page and the exact copy in Argentine Spanish, per
  `PRODUCT.md`: passionate, proud, neighbourhood; heart over polish; own the
  yellow. No corporate or SaaS tone. This page is often someone's first
  encounter with the club.
- The signing implementation: a tiny hand-rolled SigV4 (`aws4fetch`) versus the
  AWS SDK. Prefer the small one for a site that currently ships almost no
  dependencies, but it is a real choice.
- The exact ceiling numbers (bytes, and the secondary count limit).
- Test strategy. CI runs Playwright against a Vercel preview, so tests must
  intercept both the signing request and the direct R2 `PUT` and assert the
  states — which also means the tests would pass even if the real signing or CSP
  were wrong. One real manual run from a phone through the live link, with real
  credentials, is therefore mandatory before the link is shared.
- Where the token and `UPLOAD_UNTIL` are recorded so the next campaign is not
  archaeology.

## Prerequisites (need the human)

1. **Create the bucket** `deportivo-norte-photos` in Cloudflare R2 (same account
   as the wedding's, separate bucket). It stays private — no public domain, no
   `r2.dev` URL.
2. **Create an R2 API token** in the dashboard (R2 → API → Manage API tokens),
   scoped to **that bucket only**, with Object Read & Write. The CLI cannot mint
   these. It yields the access key ID and secret; the account ID is on the same
   page.
3. **Set the secrets in Vercel's environment** (`R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `UPLOAD_TOKEN`,
   `UPLOAD_UNTIL`) for both preview and production, or the preview tests fail
   for the wrong reason.
4. **Set a CORS policy on the new bucket** allowing `PUT` with the
   `content-type` header from `https://www.deportivonorte.com.ar` and the apex.
   The browser preflights `image/jpeg`, so this is not optional. Settable in the
   dashboard or with `wrangler r2 bucket cors` (which needs a `wrangler login`).

## Out of scope, deliberately

- **Showing the curated photos on the site.** That is the next piece and needs
  its own decision: a public R2 custom domain versus serving through the site.
  R2's zero egress cost is why keeping the archive there is attractive.
- Retention and pruning of what was submitted.
- Cleaning up the practice uploads that will accumulate while testing.
