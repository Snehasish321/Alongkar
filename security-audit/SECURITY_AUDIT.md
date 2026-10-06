# Comprehensive Security Audit Report

**Target Codebase:** Alongkar E-Commerce Platform  
**Date:** October 5, 2026  
**Audited Scope:** API Endpoints (`/api/`), Frontend Source (`/src/`), Infrastructure & Configuration (`.env`, `vercel.json`, `package.json`, `prisma/`, etc.)  
**Audit Type:** Static Source Code & Configuration Security Review  

---

## Executive Summary

The Alongkar codebase is a modern React 19 / TypeScript e-commerce application backed by Vercel serverless API functions, Prisma ORM, Neon PostgreSQL, Upstash Redis, Clerk Authentication, and Cloudinary media storage.

Overall, the application incorporates several robust security practices:
- **Zero SQL Injection Risk:** All database queries are handled via Prisma ORM with parameterized inputs.
- **Robust Authentication & Authorization:** Clerk is utilized for session management, and server-side route handlers enforce explicit admin role validation (`requireAdmin`) and user ownership checks.
- **Secure File Upload Pipeline:** Multipart uploads undergo strict size limits, MIME type checking, and **magic-byte header validation** before storage.
- **Modern React Protection:** React 19 JSX escaping prevents stored and reflected XSS.

However, the audit identified **1 Critical finding**, **6 High severity findings**, and **7 Medium severity findings** that require remediation before production deployment.

---

## Summary of Findings

| Severity | Category | Description | Affected Files |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | Secrets Management | Live database credentials and Clerk keys committed to version control in `.env`. | `.env` |
| **HIGH** | Dependencies | Vulnerable dependencies (`prisma` / `@prisma/client` recursive merge vulnerability, transitive Next.js issue). | `package.json`, `package-lock.json` |
| **HIGH** | Infrastructure | Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) in deployment config. | `vercel.json` |
| **HIGH** | Rate Limiting | Missing rate limiting on cart and wishlist mutations. | `api/cart.ts`, `api/wishlist.ts` |
| **HIGH** | Rate Limiting | Missing rate limiting on sensitive administrative write/upload operations. | `api/admin/jewellery-requests.ts`, `api/uploads/product-image.ts` |
| **HIGH** | Data Privacy / Storage | Sensitive user state and cart/wishlist items persisted to unencrypted `localStorage`. | `src/context/CartContext.tsx`, `src/context/WishlistContext.tsx` |
| **HIGH** | Access Control | Lack of robust route-level wrapper guards in React Router for admin pages. | `src/App.tsx`, `src/pages/admin/` |
| **MEDIUM** | Configuration | Inconsistent environment variable prefixing (`NEXT_PUBLIC_` vs `VITE_`) and incomplete `.env.example`. | `.env.example`, `.env.local` |
| **MEDIUM** | Information Disclosure | User-supplied identifiers reflected in 404 error responses. | `api/products.ts`, `api/admin/jewellery-requests.ts` |
| **MEDIUM** | Cryptography | Predictable request number generation using `Math.random()`. | `api/jewellery-requests.ts` |
| **MEDIUM** | Information Disclosure | Detailed internal status exposed in unauthenticated health endpoint. | `api/health.ts` |
| **MEDIUM** | Information Disclosure | Cloudinary configuration error messages expose internal env variable names. | `api/uploads/jewellery-inspiration.ts`, `api/uploads/product-image.ts` |
| **MEDIUM** | Input Sanitization | Search and filter parameters from URL reflected without sanitization. | `src/pages/ShopPage.tsx`, `src/pages/CollectionsPage.tsx` |

---

## Detailed Findings & Remediation

### 1. Critical Findings

#### [CRIT-01] Committed Environment File with Live Database Credentials
* **File:** `.env`
* **Description:** The `.env` file containing live Neon PostgreSQL connection strings (`DATABASE_URL`, `DIRECT_URL`) and Clerk secret keys is currently tracked in the Git repository.
* **Risk:** Anyone with repository access can gain full administrative read/write access to the production database and authentication services.
* **Remediation:**
  1. Immediately revoke and rotate the exposed database credentials and Clerk keys.
  2. Ensure `.env` and `.env.local` are added to `.gitignore`.
  3. Purge the file from git history using `git filter-branch` or `git-filter-repo`.

---

### 2. High Severity Findings

#### [HIGH-01] Vulnerable Dependency Stack (Prisma & Transitive Packages)
* **Files:** `package.json`, `package-lock.json`
* **Description:** `@prisma/client` and `prisma` (v6.19.3) contain known recursive merge object graph vulnerabilities (GHSA-ggr8-5vv4-36mx). Additionally, transitive dependency entries reference vulnerable Next.js packages if imported in build chains.
* **Risk:** Potential stack exhaustion or dependency-level exploits.
* **Remediation:** Update Prisma and related packages to patched versions (`>=6.12.0` or latest stable). Audit dependency tree to remove unused transitive packages.

#### [HIGH-02] Missing Security Headers in Deployment Configuration
* **File:** `vercel.json`
* **Description:** The Vercel configuration lacks standard hardening headers (Content Security Policy, HTTP Strict Transport Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
* **Risk:** Increased vulnerability to clickjacking, MIME-sniffing, and cross-site scripting attacks.
* **Remediation:** Add a comprehensive `headers` security block in `vercel.json`:
  ```json
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
  ```

#### [HIGH-03] Missing Rate Limiting on Cart and Wishlist Mutations
* **Files:** `api/cart.ts`, `api/wishlist.ts`
* **Description:** POST, PATCH, and DELETE endpoints for cart and wishlist operations do not enforce rate limiting.
* **Risk:** Exposes endpoints to automated denial-of-service (DoS), rapid-fire database transaction spamming, and inventory locking attacks.
* **Remediation:** Implement Upstash Redis rate limiting before executing state-changing transactions:
  ```ts
  await checkRateLimit(user.id, { keyPrefix: 'cart_mutation', limit: 30, windowSeconds: 60 });
  ```

#### [HIGH-04] Missing Rate Limiting on Administrative Endpoints
* **Files:** `api/admin/jewellery-requests.ts`, `api/uploads/product-image.ts`
* **Description:** Admin endpoints lack dedicated rate limiting.
* **Risk:** If an administrator's session is compromised, high-velocity abuse or bulk data scraping/deletion can occur unchecked.
* **Remediation:** Apply strict admin-scoped rate limits on all `/api/admin/*` routes.

#### [HIGH-05] Unencrypted State Persistence in LocalStorage
* **Files:** `src/context/CartContext.tsx`, `src/context/WishlistContext.tsx`
* **Description:** User cart items, wishlist data, and customer metadata are stored in browser `localStorage` in plaintext.
* **Risk:** Vulnerable to exfiltration if an XSS vulnerability is introduced in any third-party script or dependency.
* **Remediation:** Avoid storing sensitive user metadata in local storage; ensure data stored locally is non-sensitive or encrypted.

#### [HIGH-06] Client-Side Only Route Protection for Admin Pages
* **Files:** `src/App.tsx`, `src/pages/admin/*`
* **Description:** Admin routes rely on client-side React rendering guards rather than robust server-side rendering/routing wrappers.
* **Risk:** While API endpoints enforce backend checks, client-side route guards can occasionally be bypassed if component hierarchies change.
* **Remediation:** Implement server-side verification or middleware redirection on all protected route entry points.

---

### 3. Medium Severity Findings

#### [MED-01] Inconsistent Environment Variable Naming & Incomplete Example
* **Files:** `.env.example`, `.env.local`
* **Description:** `.env.example` omits several required backend variables (`UPSTASH_REDIS_*`, `CLERK_SECRET_KEY`). Additionally, `.env.local` mixes Next.js (`NEXT_PUBLIC_`) and Vite (`VITE_`) prefixes.
* **Risk:** Developer confusion leading to misconfigured deployments or unintended secret exposure.
* **Remediation:** Standardize on Vite environment naming conventions (`VITE_` for client, unprefixed for server) and fully populate `.env.example`.

#### [MED-02] User-Supplied Input Reflection in 404 Responses
* **Files:** `api/products.ts`, `api/admin/jewellery-requests.ts`
* **Description:** 404 error responses echo back raw user-supplied identifiers (`id`, `slug`, `requestId`).
* **Risk:** Aids attackers in targeted enumeration and reconnaissance.
* **Remediation:** Return generic "Resource not found" messages without reflecting raw input strings.

#### [MED-03] Predictable Request Number Generation
* **File:** `api/jewellery-requests.ts`
* **Description:** Uses `Math.random().toString(36)` to generate request number suffixes.
* **Risk:** Low-entropy string generation makes request identifiers guessable.
* **Remediation:** Use cryptographically secure random bytes:
  ```ts
  import crypto from 'crypto';
  const suffix = crypto.randomBytes(4).toString('hex');
  ```

#### [MED-04] Detailed Health Endpoint Exposure
* **File:** `api/health.ts`
* **Description:** The unauthenticated `/api/health` endpoint exposes detailed backend status, database latency, and cache provider type.
* **Risk:** Information disclosure regarding internal infrastructure stack.
* **Remediation:** Restrict detailed status payloads to authenticated administrators or internal monitoring services.

#### [MED-05] Cloudinary Configuration Error Leakage
* **Files:** `api/uploads/jewellery-inspiration.ts`, `api/uploads/product-image.ts`
* **Description:** Upload misconfiguration error handlers explicitly name missing environment variable keys (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
* **Risk:** Leaks backend configuration requirements to unauthenticated clients.
* **Remediation:** Return a generic "Upload service unavailable" message and log configuration faults internally.

#### [MED-06] Missing Explicit API-Level CORS & CSRF Protections
* **Files:** All API handlers under `/api/`
* **Description:** CORS headers are omitted from API responses, relying solely on deployment platform defaults.
* **Risk:** Cross-origin resource sharing misconfigurations could allow unauthorized client domains to query API endpoints if credentials are sent.
* **Remediation:** Explicitly set strict CORS allowlists and validate incoming Origin/Referer headers on state-changing API routes.

#### [MED-07] Unsanitized URL Parameters in Frontend UI
* **Files:** `src/pages/ShopPage.tsx`, `src/pages/CollectionsPage.tsx`
* **Description:** Search terms and query parameters from URLs are rendered directly into UI headings.
* **Risk:** Potential for DOM-based UI confusion or layout manipulation.
* **Remediation:** Validate and sanitize search parameters before rendering them in DOM text nodes.

---

## Architectural Strengths Verified

1. **Prisma ORM Protection:** Absolute absence of raw SQL query construction or string interpolation ensures complete immunity to SQL Injection vulnerabilities across all API endpoints.
2. **Robust File Upload Validation:** File upload handlers implement strict size checks (5MB–10MB), MIME type restrictions, and **magic-byte header inspection** to prevent malicious file uploads.
3. **Clerk Authentication Integration:** Proper usage of `@clerk/backend` and `@clerk/react` for secure session validation and role-based authorization.
4. **React Security Best Practices:** Zero instances of `dangerouslySetInnerHTML` were identified in the frontend codebase, and JSX templating correctly escapes output against XSS.

---

## Conclusion & Next Steps

1. **Immediate Priority:** Remove `.env` from git tracking, rotate exposed database and Clerk credentials immediately.
2. **Short-Term Fixes:** Add security headers to `vercel.json` and implement Upstash Redis rate limiting on all cart, wishlist, and admin mutation endpoints.
3. **Long-Term Hardening:** Update dependencies to patch known CVEs and standardize environment variable configurations.
