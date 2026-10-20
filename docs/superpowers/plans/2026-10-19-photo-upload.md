# Club History Photo Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A secret-link page where anyone can send the club photos of its history, which land privately in the club's own R2 bucket for later curation.

**Architecture:** The Vercel site signs short-lived presigned `PUT` URLs for Cloudflare R2 and the browser uploads the photos straight to R2, so the 4.5 MB Vercel function body limit never applies. Because a presigned `PUT` cannot cap an upload's size, a completion route head-checks every object afterwards and deletes anything over the line. The `/subir` page is server-rendered, because whether the window is open and whether the token is valid are server secrets.

**Tech Stack:** Astro 7 (`output: 'static'` with `prerender = false` route opt-outs), Tailwind 4, Vercel, Cloudflare R2 over its S3 API, `aws4fetch` for SigV4, Vitest for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-10-19-photo-upload-design.md` — read it alongside this plan; it explains why each constraint below exists.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Limits:** 25 MB per photo (`26214400` bytes). Signature lifetime 600 s. Receipt lifetime 1800 s. Total ceiling `8 * 1024 ** 3` bytes, secondary ceiling 5000 objects.
- **Accepted types:** `image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp`, `image/heic` → `heic`. Nothing else.
- **Env names:** `UPLOAD_TOKEN`, `UPLOAD_UNTIL` (ISO 8601 UTC), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`deportivo-norte-photos`), `R2_PREFIX` (default `photos/`).
- **Fail closed:** if `UPLOAD_TOKEN` or `UPLOAD_UNTIL` is missing, or `UPLOAD_UNTIL` cannot be parsed, the state is `invalid` or `closed` — never `open`. If the R2 env is incomplete, signing routes answer 503.
- **Signature host:** virtual-hosted style, `https://<bucket>.<account>.r2.cloudflarestorage.com`, object path `/<key>`. The `Content-Type` is pinned into the signature.
- **Server env access:** `process.env` at runtime (the site is SSR on Vercel's Node runtime). Never `import.meta.env` for secrets — that would be baked in at build time.
- **No new UI framework.** Vanilla `<script>` inside `.astro`, as the rest of this repo does. One new runtime dependency (`aws4fetch`); `vitest` as a devDependency.
- **Language and voice:** Argentine Spanish, "vos" (_mandá_, _podés_), no corporate register. Do not hard-code the club's age — `src/components/ClubAge.astro` computes it.
- **Accessibility:** WCAG 2.1 AA. Progress and results live in an `aria-live="polite"` region. Every state is reachable by keyboard.
- **Page exposure:** `/subir` is `noindex, nofollow`, absent from the navbar, and excluded from the sitemap.
- **Tests:** `bun run test:unit` (Vitest, new) and `bun run test:e2e` (Playwright, existing). Unit tests import `{ describe, it, expect, vi }` from `vitest` explicitly — the eslint config has no test globals.
- **Commits:** conventional commits (`feat:`, `test:`, `docs:`), one per task.

## Operator Prerequisites (human work, blocks Tasks 2–4's integration test and the final manual run)

1. Create the private bucket `deportivo-norte-photos` in Cloudflare R2. No public domain, no `r2.dev` URL.
2. Create an R2 API token scoped to **that bucket only**, Object Read & Write. Record the access key ID, secret, and account ID.
3. Set the six env vars in Vercel for **both preview and production** (runtime, not build-only — the CSP host is the one build-time value).
4. Set a CORS policy on the bucket: allow `PUT` with the `content-type` header from `https://www.deportivonorte.com.ar` and `https://deportivonorte.com.ar`.
5. Add `UPLOAD_TOKEN` and `UPLOAD_UNTIL` as GitHub repository secrets with **the same values** as Vercel's preview env — Task 5's e2e tests read them.

## Review Focus

Five input classes and failure modes the spec implies but no task's tests would otherwise cover. Each is pinned to a test in the task that owns the code.

1. **A photo whose browser-reported type is empty or wrong** (Android and desktop browsers do this, especially for HEIC) — it must be accepted when the type is valid AND the object key must never depend on the client's filename.
2. **An object whose real size exceeds 25 MB even though the client declared less** — the completion route must delete it and report failure, never leave it in the bucket.
3. **A connection that drops mid-upload** — that file must show as failed, must never show as arrived, and the retry must work.
4. **A filename with emoji, accents or 300 characters** — the UI must render it and the key must be unaffected.
5. **The same photo selected twice** (same name, same instant) — two distinct objects, both reported as arrived.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/upload-config.ts` (create) | Client-safe constants and pure decisions: limits, accepted types, key building, window state, reason codes, UI copy. No secrets, no I/O. |
| `src/lib/upload-server.ts` (create) | Server-only: env reading, ceilings, token compare, receipt signing/verification. |
| `src/lib/r2.ts` (create) | Server-only: signed R2 requests (presign PUT, HEAD, DELETE, prefix listing). |
| `src/pages/api/upload-url.ts` (create) | Signing route. Decisions, then a presigned URL + receipt. |
| `src/pages/api/upload-complete.ts` (create) | Post-upload enforcement: head-check, delete oversized, report. |
| `src/pages/subir.astro` (create) | The SSR page: state, form, and the upload client script. |
| `src/layouts/Layout.astro` (modify) | Add a `robots` prop so `/subir` can opt out of indexing. |
| `astro.config.mjs` (modify) | CSP (`connect-src` + `img-src blob:`), sitemap exclusion. |
| `vitest.config.ts`, `package.json` (create/modify) | Test runner and scripts. |
| `.env.example` (create) | Documents the six vars for local runs. |
| `.github/workflows/playwright.yml` (modify) | Unit-test step; e2e env for the token. |
| `e2e/upload.spec.ts` (create) | Page states and the full upload flow, with the network intercepted. |
| `README.md` (modify) | Operator runbook and campaign checklist. |

---

### Task 1: Shared decisions and the test runner

**Files:**
- Create: `src/lib/upload-config.ts`, `src/lib/upload-config.test.ts`, `vitest.config.ts`, `.env.example`
- Modify: `package.json`, `.github/workflows/playwright.yml`

**Interfaces:**
- Produces: `MAX_FILE_BYTES`, `ACCEPTED_TYPES`, `extensionFor(type)`, `isAcceptedType(type)`, `buildObjectKey({ type, prefix?, now?, id? })`, `getUploadState({ provided, token, until, now? })`, `UploadState`, `FailureReason`, `REASON_MESSAGE`, `STATUS_TEXT`.

- [ ] **Step 1: Install the runner and wire the scripts**

Add `vitest` to devDependencies and the scripts `"test:unit": "vitest run"`, `"test:unit:watch": "vitest"`. Create `vitest.config.ts` using Astro's own helper so path aliases and TS settings match the site:

```ts
import { getViteConfig } from 'astro/config';
export default getViteConfig({ test: { include: ['src/**/*.test.ts', 'astro.config.test.ts'] } });
```

Add a `Unit tests` step running `bun run test:unit` to `.github/workflows/playwright.yml`, before the deploy-wait step so it fails fast.

- [ ] **Step 2: Write the failing tests**

`src/lib/upload-config.test.ts`. The pinned values live in these assertions:

```ts
import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_BYTES, ACCEPTED_TYPES, isAcceptedType, extensionFor,
  buildObjectKey, getUploadState, REASON_MESSAGE,
} from './upload-config';

// window state — the boundary that decides whether a shared link still works
expect(getUploadState({ provided: 'x', token: 'x', until: '2026-11-01T00:00:00Z', now: new Date('2026-10-31T23:59:59Z') })).toBe('open');
expect(getUploadState({ provided: 'x', token: 'x', until: '2026-11-01T00:00:00Z', now: new Date('2026-11-01T00:00:01Z') })).toBe('closed');
expect(getUploadState({ provided: null, token: 'x', until: '2026-11-01T00:00:00Z' })).toBe('invalid');
expect(getUploadState({ provided: 'wrong', token: 'x', until: '2026-11-01T00:00:00Z' })).toBe('invalid');
// fail closed: a broken or absent deadline never opens the window
expect(getUploadState({ provided: 'x', token: 'x', until: 'no-es-fecha' })).toBe('invalid');
expect(getUploadState({ provided: 'x', token: undefined, until: undefined })).toBe('invalid');

// Review Focus 1: a valid HEIC is accepted, an unknown type is not, and the key ignores the filename
expect(isAcceptedType('image/heic')).toBe(true);
expect(extensionFor('image/heic')).toBe('heic');
expect(extensionFor('image/avif')).toBeNull();
expect(extensionFor('')).toBeNull();

// Review Focus 4 & 5: names never reach the key; same-instant calls stay unique
const key = buildObjectKey({ type: 'image/jpeg', prefix: 'photos/', now: new Date('2026-10-19T12:00:00Z'), id: 'abc' });
expect(key).toBe('photos/2026-10-19T12-00-00Z-abc.jpg');
expect(buildObjectKey({ type: 'image/png', now: new Date('2026-10-19T12:00:00Z'), id: 'abc' }))
  .not.toBe(buildObjectKey({ type: 'image/png', now: new Date('2026-10-19T12:00:00Z'), id: 'def' }));

// the copy the e2e tests assert
expect(REASON_MESSAGE['size']).toBe('Pesa más de 25 MB.');
expect(MAX_FILE_BYTES).toBe(26214400);
expect(Object.keys(ACCEPTED_TYPES)).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test:unit`
Expected: FAIL — cannot resolve `./upload-config`.

- [ ] **Step 4: Implement `src/lib/upload-config.ts`**

Exact copy pinned here (the e2e tests assert these strings, so do not paraphrase):

```ts
export const REASON_MESSAGE: Record<FailureReason, string> = {
  invalid: 'Ese link no es válido.',
  closed: 'La convocatoria ya cerró.',
  type: 'No es una foto que podamos recibir (JPEG, PNG, WebP o HEIC).',
  size: 'Pesa más de 25 MB.',
  'too-large': 'Pesa más de 25 MB.',
  ceiling: 'Por ahora no podemos recibir más fotos.',
  missing: 'La foto no llegó completa.',
  network: 'No pudimos subir esta foto. Probá de nuevo.',
};
```

`STATUS_TEXT` carries the page copy the e2e tests assert: the drop-zone label `Arrastrá tus fotos acá o tocá para elegirlas. Podés mandar varias a la vez.`, the hint `Aceptamos JPEG, PNG, WebP y HEIC de hasta 25 MB cada una.`, the all-arrived summary `¡Gracias! Llegaron las {n} fotos.` (singular `¡Gracias! Llegó la foto.`), the partial summary `Llegaron {ok} de {total}. Estas no pudieron subirse:`, and the retry button `Subir más fotos`.

Implement the rest to satisfy the tests. Two decisions the tests do not determine: the key's timestamp is formatted from `now.toISOString()` with the colons replaced by dashes so the key is URL-safe; `id` defaults to `crypto.randomUUID()`.

- [ ] **Step 5: Run the tests and the linter**

Run: `bun run test:unit && bun run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/upload-config.ts src/lib/upload-config.test.ts vitest.config.ts package.json bun.lock .env.example .github/workflows/playwright.yml
git commit -m "feat: upload limits, window state and shared copy"
```

---

### Task 2: Signed R2 requests

**Files:**
- Create: `src/lib/r2.ts`, `src/lib/r2.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `R2Env`, `r2Endpoint(env)`, `presignPutObject({ env, key, contentType, now? })`, `r2Fetch({ env, method, path, query?, now? })`, `objectSize(env, key)`, `deleteObject(env, key)`, `prefixUsage(env)`.

- [ ] **Step 1: Add `aws4fetch`**

`bun add aws4fetch` (about 4 KB; chosen over the AWS SDK, which would add dozens of packages for one signature).

- [ ] **Step 2: Write the failing tests**

`src/lib/r2.test.ts`:

```ts
const env: R2Env = {
  R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'deportivo-norte-photos', R2_PREFIX: 'photos/',
};

// the URL the browser will actually PUT to, and the CSP entry must match this shape
const url = await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: new Date('2026-10-19T12:00:00Z') });
expect(new URL(url).origin).toBe('https://deportivo-norte-photos.acct123.r2.cloudflarestorage.com');
expect(new URL(url).pathname).toBe('/photos/x.jpg');
expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('600');
// the content type is pinned into the signature — this is the only type defence R2 enforces for us
expect(decodeURIComponent(new URL(url).searchParams.get('X-Amz-SignedHeaders')!)).toContain('content-type');
// same clock and credentials must sign identically, else the ceiling and retry logic cannot be reasoned about
expect(await presignPutObject({ env, key: 'photos/x.jpg', contentType: 'image/jpeg', now: new Date('2026-10-19T12:00:00Z') })).toBe(url);
```

`prefixUsage` parses a canned `ListObjectsV2` XML response (fixture string in the test file, mirroring how `src/lib/youtube.ts` parses XML with a regex): sums `<Size>` and counts `<Contents>`, follows `<IsTruncated>`/`<NextContinuationToken>` when present, and stops at the object ceiling. `objectSize` returns `null` on 404 and the `content-length` number otherwise. Fake the network with `vi.stubGlobal('fetch', ...)`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test:unit -- r2`
Expected: FAIL — cannot resolve `./r2`.

- [ ] **Step 4: Implement `src/lib/r2.ts`**

`presignPutObject` uses one `AwsClient` per call: `sign(url, { method: 'PUT', headers: { 'Content-Type': contentType }, aws: { signQuery: true, expires: 600 } })` and returns `request.url`. `r2Fetch` signs a header-based request with the same client for `HEAD`, `DELETE` and the `?list-type=2&prefix=` listing. Never log or return the credentials.

- [ ] **Step 5: Run the tests and linter**

Run: `bun run test:unit && bun run lint`
Expected: PASS.

- [ ] **Step 6: Add the opt-in integration test (skips without credentials)**

A second test in the same file, guarded by `it.skipIf(!process.env.R2_ACCESS_KEY_ID)`: presign a `PUT` for `${R2_PREFIX}_integration-test.bin`, `fetch` it with a 20-byte body, assert 200, `objectSize` reports 20, then `deleteObject`. This is the only automated proof that the signature is genuinely valid — the mocked tests would pass with a wrong one. Run it locally with real credentials before the manual run:

Run: `bun run test:unit -- r2`
Expected: PASS, with the integration case running rather than skipped.

- [ ] **Step 7: Commit**

```bash
git add src/lib/r2.ts src/lib/r2.test.ts package.json bun.lock
git commit -m "feat: signed R2 requests (presign, head, delete, list)"
```

---

### Task 3: Receipts and the signing route

**Files:**
- Create: `src/lib/upload-server.ts`, `src/lib/upload-server.test.ts`, `src/pages/api/upload-url.ts`, `src/pages/api/upload-url.test.ts`

**Interfaces:**
- Consumes: `upload-config` (Task 1), `r2` (Task 2).
- Produces: `R2Env` reading via `readR2Env(env)`, `receiptSecret(env)`, `signReceipt({ key, secret, now? })`, `verifyReceipt({ receipt, key, secret, now? })`, `constantTimeEqual(a, b)`, `CEILING_BYTES`, `CEILING_OBJECTS`. Route response shapes: `200 { url, key, contentType, receipt }`, `403 { error, reason: 'invalid' | 'closed' }`, `415 { error, reason: 'type' }`, `413 { error, reason: 'size' }`, `503 { error, reason: 'ceiling' }`.

- [ ] **Step 1: Write the failing tests for the receipt**

`src/lib/upload-server.test.ts`:

```ts
// the receipt is the only thing guarding the delete path, so tampering must fail
const receipt = await signReceipt({ key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:00:00Z') });
expect(receipt.startsWith('1792324800.')).toBe(true);
expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T12:05:00Z') })).toBe(true);
expect(await verifyReceipt({ receipt, key: 'photos/b.jpg', secret: 's' })).toBe(false);
expect(await verifyReceipt({ receipt: receipt.replace(/.$/, '0'), key: 'photos/a.jpg', secret: 's' })).toBe(false);
expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 'other' })).toBe(false);
// stale receipts cannot be replayed
expect(await verifyReceipt({ receipt, key: 'photos/a.jpg', secret: 's', now: new Date('2026-10-19T13:00:00Z') })).toBe(false);
expect(await verifyReceipt({ receipt: 'garbage', key: 'photos/a.jpg', secret: 's' })).toBe(false);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:unit -- upload-server`
Expected: FAIL — cannot resolve `./upload-server`.

- [ ] **Step 3: Implement `src/lib/upload-server.ts`**

Receipt format, pinned: `"<issuedAtEpochSeconds>.<hexHmacSha256>"`, where the HMAC key is derived from the secret with the label `upload-receipt`, and the message is `` `${label}:${key}:${issuedAt}` ``. Use `crypto.subtle` (WebCrypto is global in Node 20+ on Vercel, and this mirrors `boda-caro-eze/src/lib/auth.ts`). `receiptSecret(env)` returns `env.UPLOAD_TOKEN` or `null` — deriving it means no additional secret for the operator. `readR2Env` returns `null` unless all five R2 vars are present, applying the `photos/` default for `R2_PREFIX`. `CEILING_BYTES = 8 * 1024 ** 3`, `CEILING_OBJECTS = 5000`.

- [ ] **Step 4: Write the failing tests for the route**

`src/pages/api/upload-url.test.ts` imports `{ POST }` and calls it with a `Request`, using `vi.stubEnv` and a `vi.mock('../lib/r2')` for `presignPutObject` and `prefixUsage`:

```ts
const body = (over: Record<string, unknown> = {}) => new Request('https://x/api/upload-url', {
  method: 'POST',
  body: JSON.stringify({ k: 'tok', name: 'foto.jpg', type: 'image/jpeg', size: 1000, ...over }),
});

// the decision matrix, most severe first
expect((await POST({ request: body() } as any)).status).toBe(200);
expect((await POST({ request: body({ k: 'nope' }) } as any)).status).toBe(403);
expect((await POST({ request: body({ type: 'video/mp4' }) } as any)).status).toBe(415);
expect((await POST({ request: body({ size: MAX_FILE_BYTES + 1 }) } as any)).status).toBe(413);
// past the deadline, even with the right token
expect((await POST({ request: body() } as any)).status).toBe(403); // with stubbed UPLOAD_UNTIL in the past
// the 200 body is exactly what the client and the completion route rely on
expect(Object.keys(okBody).sort()).toEqual(['contentType', 'key', 'receipt', 'url']);
// Review Focus 4: a 300-character emoji filename changes nothing about the response's key shape
```

- [ ] **Step 5: Run them to verify they fail**

Run: `bun run test:unit -- upload-url`
Expected: FAIL.

- [ ] **Step 6: Implement `src/pages/api/upload-url.ts`**

`export const prerender = false;`. Order: token (constant-time) → deadline → type → size → ceiling (`prefixUsage` bytes ≥ `CEILING_BYTES` or count ≥ `CEILING_OBJECTS`). Missing R2 env, or a signing error, answers 503 with `reason: 'ceiling'` and a server-side `console.error` — fail closed, and the page shows "Por ahora no podemos recibir más fotos." JSON responses carry `Content-Type: application/json`, matching `src/pages/api/youtube-videos.json.ts`.

- [ ] **Step 7: Run the tests, the linter and a real signing request**

Run: `bun run test:unit && bun run lint`
Then, with `.env` filled: `curl -s -X POST localhost:4321/api/upload-url -H 'content-type: application/json' -d '{"k":"<UPLOAD_TOKEN>","name":"a.jpg","type":"image/jpeg","size":10}'` and confirm a `url` pointing at `https://deportivo-norte-photos.<account>.r2.cloudflarestorage.com/photos/…`.
Expected: 200 with the four keys; no secret in the response.

- [ ] **Step 8: Commit**

```bash
git add src/lib/upload-server.ts src/lib/upload-server.test.ts src/pages/api/upload-url.ts src/pages/api/upload-url.test.ts
git commit -m "feat: upload signing route with receipts and ceilings"
```

---

### Task 4: The completion route

**Files:**
- Create: `src/pages/api/upload-complete.ts`, `src/pages/api/upload-complete.test.ts`

**Interfaces:**
- Consumes: `verifyReceipt`, `readR2Env` (Task 3); `objectSize`, `deleteObject` (Task 2); `REASON_MESSAGE`, `MAX_FILE_BYTES` (Task 1).
- Produces: `200 { ok: true, size }`, `200 { ok: false, reason: 'too-large' | 'missing' }`, `403 { error, reason: 'invalid' }` for a bad receipt or a key outside the prefix.

- [ ] **Step 1: Write the failing tests**

`src/pages/api/upload-complete.test.ts`, with `vi.mock('../lib/r2')` controlling `objectSize`/`deleteObject` and a real receipt from `signReceipt`:

```ts
// the happy path
// objectSize -> 1000  =>  { ok: true, size: 1000 }
// Review Focus 2: a declared-small file that is really 40 MB is deleted, not kept
// objectSize -> MAX_FILE_BYTES + 1  =>  { ok: false, reason: 'too-large' } and deleteObject was called once
// an interrupted upload that never landed
// objectSize -> null  =>  { ok: false, reason: 'missing' } and deleteObject was NOT called
// forged or stale receipts cannot make the server touch an object
// verifyReceipt fails  =>  403, objectSize never called
// a valid receipt for a key outside R2_PREFIX is refused
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:unit -- upload-complete`
Expected: FAIL.

- [ ] **Step 3: Implement `src/pages/api/upload-complete.ts`**

`export const prerender = false;`. Body `{ key, receipt }`. Verify the receipt **before** any R2 call; then require `key.startsWith(prefix)`; then `objectSize`; then delete when over `MAX_FILE_BYTES`. Never return the key back to the client on a refusal — the person only needs the reason.

- [ ] **Step 4: Run the tests and the linter**

Run: `bun run test:unit && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/upload-complete.ts src/pages/api/upload-complete.test.ts
git commit -m "feat: enforce the size cap after upload"
```

---

### Task 5: The page, its states and the site config

**Files:**
- Create: `src/pages/subir.astro`, `e2e/upload.spec.ts`, `astro.config.test.ts`
- Modify: `src/layouts/Layout.astro`, `astro.config.mjs`, `.github/workflows/playwright.yml`

**Interfaces:**
- Consumes: `getUploadState`, `STATUS_TEXT`, `REASON_MESSAGE`, `ACCEPTED_TYPES`, `MAX_FILE_BYTES` (Task 1).
- Produces: the page contract the client script (Task 6) builds on: a form with `data-endpoint="/api/upload-url"`, a file input with `name="fotos"`, `accept` derived from `ACCEPTED_TYPES`, and an `aria-live="polite"` results region. Rendered states: `invalid`, `closed`, `open`.

- [ ] **Step 1: Modify the layout and the config**

`Layout.astro` gains an optional prop `robots = 'index, follow'`, used verbatim in the existing `<meta name="robots">`. `astro.config.mjs` gains two CSP entries and a sitemap filter:

```js
// not secrets — the account id and bucket name appear in every presigned URL
const R2_HOST = 'https://deportivo-norte-photos.REPLACE_WITH_ACCOUNT_ID.r2.cloudflarestorage.com';
```

Add `connect-src 'self' ${R2_HOST}` (keeping the existing `'self'`) and `img-src 'self' data: https://i.ytimg.com blob:`. Add `filter: (page) => !page.includes('/subir')` to the sitemap integration. The operator step of Task 8 replaces the account ID; until then the placeholder is inert.

- [ ] **Step 2: Write the failing config test**

`astro.config.test.ts` imports the config and asserts the directives that a wrong edit would silently break the upload with:

```ts
const directives = config.security.csp.directives;
expect(directives.find((d) => d.startsWith('connect-src'))).toContain(config.R2_HOST);
expect(directives.find((d) => d.startsWith('img-src'))).toContain('blob:');
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test:unit`
Expected: FAIL.

- [ ] **Step 4: Write the page**

`src/pages/subir.astro` with `export const prerender = false;`, rendering from `getUploadState({ provided: Astro.url.searchParams.get('k'), token: process.env.UPLOAD_TOKEN, until: process.env.UPLOAD_UNTIL })`. Uses `Layout` with `robots="noindex, nofollow"` and a Spanish title. No client script yet — Task 6 adds it. Keep the page's own yellow-on-black register: the club's `#FFCC00`, `font-heading`, mobile-first widths, and `btn-primary` where a button is needed.

- [ ] **Step 5: Write the failing e2e tests**

`e2e/upload.spec.ts`, following the locator idiom of `e2e/404.spec.ts` (`getByRole`, `getByText`, no test ids):

```ts
test('a link sin token no muestra el formulario', async ({ page }) => {
  await page.goto('/subir');
  await expect(page.getByText('Ese link no es válido.')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test('la página pide no ser indexada', ...)     // meta[name="robots"] is "noindex, nofollow"
test('el home no linkea a /subir', ...)          // no a[href*="/subir"] on /
test('con el token la ventana está abierta', ...) // skips when UPLOAD_TOKEN is unset
```

The open-state test builds `/subir?k=${process.env.UPLOAD_TOKEN}` and asserts the drop-zone label is visible. It calls `test.skip(!process.env.UPLOAD_TOKEN, 'UPLOAD_TOKEN not set')`.

- [ ] **Step 6: Run them to verify they fail**

Run: `bun run test:e2e -- e2e/upload.spec.ts`
Expected: FAIL — 404 for `/subir`.

- [ ] **Step 7: Pass the token to the CI test run**

In `.github/workflows/playwright.yml`, add to the Playwright step's `env:`: `UPLOAD_TOKEN: ${{ secrets.UPLOAD_TOKEN }}` and `UPLOAD_UNTIL: ${{ secrets.UPLOAD_UNTIL }}` — the same values as Vercel's preview env (operator step 5).

- [ ] **Step 8: Run the tests, the linter and a build**

Run: `bun run test:unit && bun run lint && bun run build`
Then: `bun run test:e2e -- e2e/upload.spec.ts` with `.env` present.
Expected: unit PASS; the page's e2e PASS including the open state; build succeeds and `dist/sitemap-0.xml` contains no `/subir`.

- [ ] **Step 9: Commit**

```bash
git add src/pages/subir.astro src/layouts/Layout.astro astro.config.mjs astro.config.test.ts e2e/upload.spec.ts .github/workflows/playwright.yml
git commit -m "feat: the photo upload page and its states"
```

---

### Task 6: The upload client

**Files:**
- Modify: `src/pages/subir.astro` (the `<script>` block)
- Modify: `e2e/upload.spec.ts`

**Interfaces:**
- Consumes: the page contract from Task 5; `/api/upload-url` and `/api/upload-complete` from Tasks 3 and 4.
- Produces: nothing importable. The behaviour: for each selected file — sign, `PUT` the file to the returned URL with the returned `contentType`, then post `{ key, receipt }` to `/api/upload-complete`; render one row per file and a summary in the live region.

- [ ] **Step 1: Write the failing e2e tests**

Add to `e2e/upload.spec.ts`, intercepting both the signing route and R2 so the tests never touch the real bucket:

```ts
const FOTO = { name: 'foto vieja.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

async function abrir(page) {
  await page.route('**/api/upload-url', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ url: 'https://deportivo-norte-photos.acct123.r2.cloudflarestorage.com/photos/x.jpg?X-Amz-Signature=abc',
      key: 'photos/x.jpg', contentType: 'image/jpeg', receipt: '123.abc' }),
  }));
  await page.route('**/api/upload-complete', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, size: 4 }) }));
  await page.route('**/*.r2.cloudflarestorage.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(`/subir?k=${TOKEN}`);
}

test('una foto que llega se informa como llegada', ...)      // selecciona FOTO, sube, espera '¡Gracias! Llegó la foto.'
test('Review Focus 4: un nombre con emoji y 300 caracteres no rompe la lista', ...)
test('una foto rechazada se informa con su motivo', ...)      // signing route 413 { reason: 'size' } => 'Pesa más de 25 MB.'
test('Review Focus 3: si se corta la subida, la foto no figura como llegada', ...)
      // route the R2 PUT to route.abort('failed') => the row shows REASON_MESSAGE.network and no success summary
test('el reintento vuelve a intentar la subida', ...)         // after abort, click 'Subir más fotos', assert a second PUT
test('Review Focus 5: elegir dos veces la misma foto sube dos objetos', ...)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:e2e -- e2e/upload.spec.ts`
Expected: FAIL — no upload behaviour yet.

- [ ] **Step 3: Implement the client in `subir.astro`**

A `<script>` reading its config from the form's data attributes (endpoint, `accept`, max bytes) so no value is written twice. Per file, in sequence: `POST /api/upload-url`; on a non-200, show `REASON_MESSAGE[reason]` on that row and skip it; otherwise `XMLHttpRequest` `PUT` to the signed URL with `xhr.setRequestHeader('Content-Type', contentType)` — it is the only API that reports upload progress — then `POST /api/upload-complete` and show the row as arrived only on `{ ok: true }`, and on `{ ok: false }` show its reason. Every result goes into the `aria-live` region. Nothing is retried automatically: a failed row keeps a manual "Subir más fotos" path, and the file list survives a partial failure.

- [ ] **Step 4: Run the tests, the linter and the build**

Run: `bun run test:e2e -- e2e/upload.spec.ts && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/subir.astro e2e/upload.spec.ts
git commit -m "feat: upload the photos straight to R2 from the browser"
```

---

### Task 7: The operator runbook

**Files:**
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Consumes: everything above.
- Produces: the written procedure, not code.

- [ ] **Step 1: Write the runbook**

`README.md` gains a "Fotos de la historia" section covering: the six env vars and where they live; filling the real account ID into `R2_HOST` in `astro.config.mjs`; the bucket CORS policy; generating a campaign link (`/subir?k=<UPLOAD_TOKEN>`); rotating the token to kill a link; extending `UPLOAD_UNTIL` without a deploy; where submissions land (`R2_PREFIX`, browsable in the Cloudflare dashboard for curation); and using `R2_PREFIX=dev/` locally so practice uploads never mix with real ones.

- [ ] **Step 2: Write the manual verification checklist**

The last section, to be run by a person before the link is shared — it is the only thing that proves the real signature, the real CORS and the real CSP work, since the automated tests intercept all three:

```markdown
- [ ] Fill R2_HOST with the real account ID, deploy to production.
- [ ] Open the real link on a phone, pick a photo from the camera roll, confirm it arrives.
- [ ] Confirm the object exists in the bucket under R2_PREFIX.
- [ ] Open the browser console: no CSP violations.
- [ ] Send a photo twice; confirm two objects.
- [ ] Put a file over 25 MB through the picker; confirm it is refused and NOT in the bucket.
- [ ] Set UPLOAD_UNTIL to yesterday in a preview deploy; confirm the link explains the window closed.
- [ ] Open the link with no `k`; confirm the invalid-link message.
```

- [ ] **Step 3: Verify and commit**

Run: `bun run lint && bun run build`
Expected: PASS.

```bash
git add README.md .env.example
git commit -m "docs: operator runbook for the history photo upload"
```

---

## Self-Review

**Spec coverage:** the page and its three states → Task 5; token and deadline checks → Tasks 1 (decision) and 3 (enforcement); pinned content type and signed `PUT` → Task 2; the completion check and deletion → Task 4; the byte ceiling with a count guard → Tasks 2 and 3; CORS → operator prerequisites and Task 7; the CSP entries → Task 5; previews via `blob:` → Task 5; `noindex` and sitemap exclusion → Task 5; the manual run before sharing → Task 7; the operator's four prerequisites → the Operator Prerequisites section, plus the GitHub secrets addition noted below. No spec requirement is left without a task.

**Deviation from the spec worth flagging:** the spec's prerequisites list four operator steps; this plan adds a fifth (GitHub secrets `UPLOAD_TOKEN` / `UPLOAD_UNTIL`), which the CI-run e2e tests need to build a valid link. The spec's claim that the page "is served, not static" is implemented in Task 5.

**Type consistency:** `R2Env`, `presignPutObject`, `objectSize`, `deleteObject`, `prefixUsage`, `readR2Env`, `signReceipt`, `verifyReceipt`, `getUploadState`, `buildObjectKey`, `REASON_MESSAGE`, `FailureReason` and the reason vocabulary (`invalid`, `closed`, `type`, `size`, `ceiling`, `too-large`, `missing`, `network`) are each defined once and used with the same names and shapes in Tasks 3–6.

**Review Focus:** each of the five has its test — 1 in Task 1; 2 in Task 4; 3 and 5 in Task 6; 4 in Tasks 1, 3 and 6.
