# Production Security & Architecture Audit Plan
**Project:** Alongkar E-Commerce Platform
**Date:** October 2026

This document aggregates findings from recent security audits and provides a concrete action plan for making the application production-ready, incorporating Cloudflare security best practices.

## 1. Secrets Management (CRITICAL)

The most pressing issue is the exposure of secrets in the environment and source control.

**Issues:**
- Live database credentials and Clerk keys were committed to version control in `.env`.
- Cloudinary configuration error messages expose internal env variable names in API responses.

**Action Plan:**
- [ ] **Rotate Keys immediately:** Revoke and rotate Neon PostgreSQL credentials, Clerk keys, Upstash Redis tokens, and Cloudinary secrets.
- [ ] **Git History:** Purge the `.env` file from git history to prevent retro-active credential scraping.
- [ ] **Environment Standardization:** Consolidate `.env.local` to strictly use `VITE_` prefix for client-exposed variables and no prefix for server-side secrets. Update `.env.example` to be comprehensive but devoid of real secrets.

## 2. Infrastructure & Edge Security (Cloudflare Specific)

The application currently lacks proper edge security headers and rate-limiting infrastructure for production.

**Issues:**
- Missing security headers (CSP, HSTS, X-Frame-Options, etc.).
- Missing explicit rate limiting on sensitive administrative write/upload operations.
- Missing explicit API-Level CORS & CSRF Protections.

**Action Plan (Cloudflare Integration):**
- [ ] **Migrate Edge Security to Cloudflare:** Route the application domain through Cloudflare to leverage their Web Application Firewall (WAF).
- [ ] **Cloudflare WAF Rules:**
  - Create rules to block known malicious IP ranges and bot traffic.
  - Enforce strict HTTPS using Cloudflare's "Always Use HTTPS" and HSTS settings.
- [ ] **Cloudflare Rate Limiting:** 
  - Instead of solely relying on Upstash Redis for application-level rate limiting, apply Cloudflare Rate Limiting rules to protect `/api/*` endpoints from brute-force and DoS attacks (e.g., limit `/api/cart` and `/api/admin/*` mutations).
- [ ] **Implement Security Headers:** 
  - If deploying via Vercel behind Cloudflare, add a `headers` block in `vercel.json` (or via Cloudflare Transform Rules) to enforce:
    - X-Frame-Options: DENY
    - X-Content-Type-Options: nosniff
    - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
    - Referrer-Policy: strict-origin-when-cross-origin
- [ ] **Block Exposure in 404s:** Ensure 404/error pages don't echo user input.

## 3. Data Privacy & Storage Issues 

**Issues:**
- Sensitive user state (cart/wishlist/customer metadata) is stored unencrypted in browser `localStorage`.

**Action Plan:**
- [ ] **Data Minimization:** Only store non-sensitive identifiers (like cart session IDs) in `localStorage`. Ensure the backend API serves the sensitive data.
- [ ] **Secure Cookies:** Move auth tokens or sensitive session identifiers to `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

## 4. Application Logic & Caching Defects

**Issues:**
- Admin status list missing critical states (`ADVANCE_PENDING`, `BALANCE_PENDING`, `SOURCING`, `COMPLETED`).
- Guest carts are replaced rather than merged upon login.
- Cart additions face race conditions (read-then-write instead of atomic operations).
- Cache invalidation and multi-tier caching (Vercel Edge, Upstash Redis, L1) cause stale data (Products API).

**Action Plan:**
- [ ] **Cart Operations:** Refactor `/api/cart.ts` to use atomic `upsert` or database transactions to prevent quantity loss under load.
- [ ] **Cache Coherency:** Implement robust cache-busting strategies. Remove blanket `s-maxage` where data mutates frequently. Issue targeted Cloudflare Cache Purge requests via API when product states change.
- [ ] **Data Validation:** Implement robust Zod validation for inputs (e.g., ensuring budget range `lower <= upper`).
- [ ] **Admin Robustness:** Synchronize the Prisma Enums with the Admin UI statuses perfectly.

## 5. Dependency Management

**Issues:**
- Vulnerable dependent packages (specifically Prisma 6.19.3 relying on vulnerable deepmerge-ts).

**Action Plan:**
- [ ] **Dependency Audit:** Run `npm audit --omit=dev` and aggressively update or patch any packages with High or Critical CVEs.
- [ ] **Lockfile Validation:** Ensure automated CI/CD pipelines fail the build if high-severity vulnerabilities are introduced.

## Summary Checklist for Production Release

1. **Rotate Credentials & Scrub Git History:** Ensure zero credentials exist in plain text.
2. **Cloudflare proxying and WAF setup:** Put Cloudflare in front of the application.
3. **Application Level Security Fixes:** Address atomic operations, cache races, and local storage data exposure.
4. **Dependency Hardening:** Update vulnerable packages immediately.