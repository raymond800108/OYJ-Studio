# Convra — Full App Audit Report
### 5-Agent Review: Frontend · Backend · Testing · UX · Growth
Last updated: 2026-05-03

---

## Executive Summary

The product is genuinely well-built for an early-stage tool. The core AI content generation works, the credit system exists, billing infrastructure is partially there, and the UI is polished enough that real users could use it. However there are **7 critical security vulnerabilities**, **no payment rails**, **no self-serve signup**, and **a pricing logic bug** that would cause immediate refund demands the moment real billing goes live. None of these are hard to fix — most are 1–3 day tasks. The product is 3–4 focused weeks away from a real public launch.

---

## 🔴 BLOCKERS — Must Fix Before Charging Real Customers

### Security (fix these first — some are actively exploitable)

| # | Issue | File | Severity |
|---|-------|------|----------|
| S1 | **SSRF in `/api/proxy-model`** — unauthenticated route accepts any `?url=`, fetches server-side. Exposes cloud metadata, Redis, internal services. | `proxy-model/route.ts` | Critical |
| S2 | **Unauthenticated polling on `/api/kie` GET and `/api/meshy` GET** — any caller who knows a taskId can retrieve another user's generated images/videos (IDOR). | `kie/route.ts`, `meshy/route.ts` | High |
| S3 | **OAuth CSRF protection silently disabled when Redis is down** — both Google and LINE callbacks skip state verification if Redis is unavailable, making the OAuth handshake spoofable during outages. | `auth/google/callback`, `auth/line/callback` | High |
| S4 | **LINE JWT decoded without signature verification** — `id_token` is base64-decoded and trusted without verifying against LINE's JWKS. Email field could be forged for allowlist bypass. | `auth/line/callback/route.ts:61` | High |
| S5 | **Client-side usage logging allows invoice manipulation** — any authenticated user can POST arbitrary `costUsd` values to `/api/usage`. Since invoices are computed from these entries, users can self-report $0 cost on every generation. | `usage/route.ts` | High |
| S6 | **No rate limiting on any generation endpoint** — no backpressure beyond the credit balance, which itself has a race condition (S7). | All `/api/kie`, `/api/generate`, `/api/inpaint` | Medium |
| S7 | **Credit deduction is not atomic** — read-modify-write with no Redis locking. Two concurrent requests both pass the balance check and both succeed. A `video-generate` (10 credits) can be double-fired for free. | `auth.ts:258–268` | High |

### Billing & Data Integrity

| # | Issue | File |
|---|-------|------|
| B1 | **Invoice sequence number increments before email is confirmed sent** — if Resend returns an error, the counter is already at N+1. Retry gets a skipped number. | `invoice-number.ts`, `invoices/send/route.ts` |
| B2 | **Invoice send + usage purge are not transactional** — if purge partially fails after email is sent, next invoice double-bills the same period. No recovery path. | `invoices.ts:111–146` |
| B3 | **Credits deducted before generation succeeds** — if the AI call fails (upstream error, content policy), the user loses credits with no refund. | `withAuth.ts:65–76` |

### Business (ship-stopping for revenue)

| # | Issue |
|---|-------|
| M1 | **No self-serve signup** — allowlist has 5 hardcoded emails. Landing page promises "100 free credits" but every outside visitor hits Access Denied. Zero leads captured. |
| M2 | **No payment infrastructure** — `plan` field exists in schema, Stripe is not integrated. Cannot collect money from anyone not in a personal arrangement. |
| M3 | **Credit exhaustion has no upsell** — user hits "Insufficient credits," `refreshAuth()` fires, nothing else happens. Highest-intent purchase moment is completely wasted. |
| M4 | **Starter plan (80 credits) < Free plan (100 credits)** — `credits.ts:23`. A paying customer gets fewer credits than a new free user. Immediate refund demand. |

### UX (users leave before converting)

| # | Issue | File |
|---|-------|------|
| U1 | **Landing page has no product name or H1** — visitor sees "Olivia Yao Jewellery" logo, no headline, no "what is this." Useless for any traffic that isn't direct. | `page.tsx:558–599` |
| U2 | **Login modal is hardcoded English** — zero i18n. Chinese users who switched to ZH hit a fully English modal at the exact conversion moment. | `LoginModal.tsx` |
| U3 | **No credit balance visible after sign-in** — users hit "Insufficient credits" cold, with no upgrade path shown. | `page.tsx` header |
| U4 | **Mobile navigation overflows** — 6-tab pill bar with no responsive treatment. Breaks entirely on 375px viewport. | `page.tsx:705–729` |
| U5 | **Generate button is greyed with no explanation** — new users see a disabled button with no tooltip or instruction. | `MarketingPanel.tsx` |
| U6 | **Access Denied modal has no next step** — no email, no form, no link. Permanent dead end. | `page.tsx:646–675` |
| U7 | **Modals have no focus trap or Escape key dismissal** — keyboard-only users are stuck inside the login and access-denied modals. | `LoginModal.tsx`, `page.tsx` |
| U8 | **`<html lang>` is hardcoded `"en"`** — never updates when user switches to Chinese. Screen readers and browser translation get wrong locale. | `layout.tsx:31` |

### Frontend

| # | Issue | File |
|---|-------|------|
| F1 | **Blob URLs never revoked** — `URL.createObjectURL()` called on every image add, revoked almost nowhere. Memory leak accumulates across a session. | `MarketingPanel.tsx`, `ImageUploader.tsx` |
| F2 | **Download fails silently on expired CDN URLs** — `handleDownload` has no try/catch. AI CDN URLs expire in hours; users get a silent failure. | `ResultPanel.tsx:18–27` |
| F3 | **No `vercel.json`** — Kie polling, fal.subscribe, Meshy, invoice PDF all need >10s. Default Hobby plan kills functions at 10s. | (missing file) |

---

## 🟡 GOOD TO HAVE — Ship These in the First Month

### Monetization & Growth

- **Self-serve waitlist registration** — anyone can register; new users land in a `waitlist` plan with 10 credits (enough to see one result), then see a "Request full access" form. Converts dead-end rejection into a lead-gen funnel.
- **Stripe billing on existing plan tiers** — the schema (`plan` field, `credits.ts` tiers) is already correct. Wire Stripe Checkout + webhook to update plan + call `addCredits()`. Weekend project.
- **Credit exhaustion upsell modal** — fire on "Insufficient credits" error in `page.tsx:518`. Show remaining balance, pricing table, Stripe deep-link. Most high-intent moment in the product.
- **Fix plan pricing hierarchy** — `starter` should be 300–500 credits (above free's 100). Full suggested ladder: free=100, starter=400, pro=1200, business=4000.
- **"Share this result" + free-tier watermark** — generated image URLs are CDN-ready. One share button + "Made with Convra" watermark on free tier = viral loop on jewelry merchant Instagram accounts.
- **80% credit nudge email** — when credits drop below 20, send a transactional email via Resend (already integrated). One cron job + one template.

### Core Product

- **Persistent history panel** — `history` state resets on every page load. Persist to `localStorage` so users' generated images survive a tab close. Critical for retention.
- **Onboarding tooltip flow** — 3-step first-run sequence: (1) upload a photo, (2) pick a template, (3) generate. The "aha moment" (seeing your jewelry in Glass Display or Moss & Rock for the first time) needs to happen in the first 90 seconds.
- **Server-side usage logging** — move `logUsage` from client fire-and-forget into each generation API route. Prevents under-billing when tabs close during generation. Fixes the invoice manipulation attack vector simultaneously.
- **Atomic credit deduction** — replace read-modify-write in `auth.ts` with Redis `DECRBY` + Lua check-and-decrement. One Redis script, fixes the double-spend entirely.
- **Credits deducted after success** — flip `withAuth.ts` to deduct credits only after the AI response confirms success. Refund automatically on error.
- **`vercel.json` with `maxDuration`** — add explicit 60s timeouts on all generation and invoice routes.

### Technical Health

- **Health check endpoint** — `/api/health` that validates Redis connectivity and required env vars. Fails loudly instead of silently degrading.
- **Admin config centralized** — three separate admin email lists in `withAuth.ts`, `requireAdmin.ts`, and `usage/route.ts` are out of sync. One `ADMIN_CONFIG` module.
- **Add auth to `/api/kie` GET and `/api/meshy` GET** — session check, 1-line fix.
- **SSRF fix for `/api/proxy-model`** — add `requireAuth` + hostname allowlist (Meshy CDN only). 30-minute fix.
- **`next/image` for template previews and history thumbnails** — currently all raw `<img>` tags. LCP and lazy loading improvements.
- **Split `MarketingPanel.tsx`** — 2,439 lines, manages 12+ concerns. Extract: `TemplateSelector`, `CharacterSection`, `ResultGrid`, `VideoSection`, `BranchPicker`. Every polling tick re-renders the entire tree.
- **No test suite at all** — zero test files. At minimum: credit deduction atomicity, invoice sequence, OAuth state check. These are the three financial/security-critical paths.

---

## 🟢 AMAZING TO HAVE — The Marketing Agency Vision + Stretch Features

### Near-term (1–3 months): Content-to-Channel

These extend the core product without requiring external platform approvals:

**Batch generation + multi-format export**
Generate one jewelry product image in all 7 aspect ratios simultaneously (the array is already defined in `IMAGE_RATIOS`). Download as a zip or push each to the right platform. Genuine time-saver that justifies a `business` tier at $99+/month.

**AI caption + hashtag generation**
One optional credit after image generation: AI writes the Instagram caption, hashtags, and alt text for the generated image. OpenAI is already integrated. Adds LTV per session with no new infrastructure.

**Direct-to-Instagram publishing**
After generation, one button posts directly to their connected Instagram account via the Content Publishing API. This is the seed of the "agency inside the product" idea — content-to-channel in one click, achievable in 2–3 weeks, and the feature that makes Convra sticky instead of a tool people screenshot and leave.

**Team / agency accounts**
The `companyId` field on `UserProfile` already exists. Build shared credit pools properly: one billing account, multiple seats, usage tracked per member. Path to $500–2000/month agency contracts managing multiple jewelry brands.

### Mid-term (3–6 months): Distribution Intelligence

**Social media scheduling**
After generating content, schedule it to post at optimal times across Instagram, Facebook, and Pinterest. No AI needed yet — just a scheduler on top of the publishing APIs.

**Consistent Wearing → full lookbook generation**
The current consistent-wearing feature is the highest-value feature in the product. Extend it: upload 1 jewelry piece + 5 model reference shots → auto-generate a full 20-image lookbook in multiple settings and outfits in one credit bundle. This is a $300-500 photography shoot replacement.

**A/B creative testing**
Generate 4 variants of the same jewelry product shot (different templates/styles), post all four as a test, measure engagement, auto-identify the winner. Foundation for the performance marketing angle.

### Long-term (6–18 months): The Full Marketing Agency Vision

This is the right destination — evaluated honestly:

The insight is correct. Jewelry merchants need a content-to-distribution-to-performance loop, not just a content tool. The right sequence is: generate → publish → measure → optimize → repeat.

**Meta Ads integration (scoped as "boost this post")**
Do NOT build a full campaign manager. Build "boost this post" — take a generated image, create a boosted post with AI-suggested targeting for jewelry buyers (age, interests, lookalike audiences). This wedge into ad spend is manageable to build and extremely high value. Requires Meta Business Partner status (multi-month process — start the application now).

**Performance analytics dashboard**
Pull metrics from connected ad accounts and Instagram: CTR, CPC, ROAS, reach, saves, profile visits. AI layer identifies which content styles (e.g. Moss & Rock vs Glass Display) drive the best conversion for each brand. This is the "marketing agency" insight — Convra learns what works for jewelry.

**Market research + competitor analysis**
For a given jewelry brand niche (e.g. minimalist gold rings, luxury pearl earrings), auto-research: top competitors, trending styles, pricing, social content performance. Agent-driven research using web search + trend APIs. Generates a brief the brand can use for content strategy.

**SEO + CRO optimization layer**
Analyze the customer's product pages, suggest image improvements, alt text, schema markup. Connect to their Shopify/WooCommerce via API. Generate SEO-optimized product descriptions alongside the images.

**AI campaign planner**
Given a product launch, season, or promotion: auto-generate a 4-week content calendar with images, captions, hashtags, posting schedule, and ad budget recommendation. Full campaign in one click.

**The correct build order for the marketing agency vision:**
1. Instagram publishing (month 1–2)
2. Basic analytics pull (month 2–3)
3. A/B creative testing (month 3–4)
4. Meta Ads "boost this post" (month 5–8, pending Meta approval)
5. Campaign planner + market research agents (month 8–12)
6. Full performance marketing loop (month 12–18)

---

## Priority Action List (Next 30 Days)

### Week 1 — Security & Infrastructure
- [ ] Fix SSRF in `/api/proxy-model` (auth + hostname allowlist)
- [ ] Add auth to `/api/kie` GET and `/api/meshy` GET
- [ ] Fix OAuth state bypass: reject if Redis unavailable
- [ ] Add `vercel.json` with `maxDuration: 60` on generation + invoice routes
- [ ] Move usage logging server-side (fixes invoice manipulation simultaneously)

### Week 2 — Money
- [ ] Fix starter plan credit count (starter: 400, pro: 1200, business: 4000)
- [ ] Open self-serve registration with waitlist/10-credit gate
- [ ] Integrate Stripe Checkout on the 3 paid tiers
- [ ] Add credit exhaustion upsell modal

### Week 3 — Atomic operations + billing integrity
- [ ] Atomic credit deduction (Redis DECRBY + Lua)
- [ ] Deduct credits after success, not before
- [ ] Fix invoice sequence: increment after confirmed delivery
- [ ] Add transaction-safe usage purge

### Week 4 — UX activation
- [ ] Add product headline + clear H1 to landing page
- [ ] i18n LoginModal
- [ ] Show credit balance in header
- [ ] Fix mobile navigation (icon-only collapse below 768px)
- [ ] Add 3-step onboarding tooltip for new users
- [ ] Persist history panel to localStorage
