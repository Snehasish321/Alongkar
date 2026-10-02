# Alongkar Security & Correctness Review Report

**Branch:** `bombasticchanges`  
**Review Period:** 2026-10-03  
**Reviewer:** Claude Code (Ultracode mode)  
**Scope:** All changes in `git diff @{upstream}...HEAD` plus working-tree changes (`git diff HEAD`). No PR named `test` existed; review used local diff.

---

## Executive Summary

Parallel agent analysis identified **multiple confirmed correctness and caching issues**, along with a **high-severity dependency vulnerability** introduced by the Prisma upgrade. No high‑confidence authentication, authorization, or injection flaws were found. All protected endpoints enforce proper scoping; frontend uses React’s automatic escaping; file‑upload paths are safe.

---

## Confirmed Findings (Actionable Defects)

| File | Line | Issue | Risk / Failure Scenario |
|------|------|-------|-------------------------|
| `api/admin/jewellery-requests.ts` | 9 | Admin status list includes `SOURCING_IN_PROGRESS` (not in Prisma enum) and omits `ADVANCE_PENDING`, `BALANCE_PENDING`, `SOURCING`, `COMPLETED`, `CLOSED` | API rejects valid DB states; status filters break. |
| `src/context/CartContext.tsx` | 115 | Server‑cart load replaces guest cart instead of merging on sign‑in | Guest cart items lost after login. |
| `api/cart.ts` | 72 | Cart `add` uses read‑then‑write (no atomic upsert) | Concurrent adds lose quantity increments. |
| `api/jewellery-requests.ts` | 166 | Budget range parser accepts reversed bounds (e.g. `2500-1500`) and stores lower bound | Range data corrupted; admin/customer views cannot recover true bounds. |
| `api/products.ts` | 559 | List‑cache key lowercases `category`/`collectionId` while DB filter is case‑separate | `?category=Gold` and `?category=gold` share cache key → wrong product list served for up to 5 min. |
| `api/products.ts` | 498 | Public `Cache-Control: s-maxage=` headers on product GET responses | CDN/edge caches serve stale/deleted product data until TTL expires (invalidations only clear L1/Redis). |
| `api/products.ts` | 527 | Concurrent GET can repopulate stale data after mutation invalidation | Race: old read → update → cached stale result → served for TTL period. |
| `src/services/productApi.ts` | 111 | `forceRefresh` skips client TTL but not in‑flight dedup → can return stale in‑flight result | Stale data if prior request predates mutation. |
| `src/services/productApi.ts` | 85 | `clearProductApiCache()` does not cancel pending requests → old responses can repopulate cache after clear | Stale data overwrite after admin‑triggered clear. |
| `src/services/productApi.ts` | 157 | Unconditional `finally { inFlightRequests.delete(...) }` can delete newer in‑flight entry | Extra duplicate fetches; cache “last writer wins” timing hazards. |
| `package.json` | 8 | Build script generates Prisma Client but does **not** apply pending migrations | Deploy against fresh/unmigrated DB → runtime query failures (missing tables/columns). |
| `package.json` | 45 | Added `prisma@6.19.3` depends on `deepmerge-ts@7.1.5` (<8.0.0) – flagged **high** severity by `npm audit` (recursive‑object stack exhaustion) | Potential DoS via crafted payload (if exposed) – assess exposure/use. |
| `src/components/admin/JewelleryRequestDetailModal.tsx` | 415 | Incorrect UI wording: “QuoteDown Sent” / “Progress to QuoteDown” (should be “Quote Sent”) | Misleading admin UX. |
| `api/products.ts` | 527 | GET single product can repopulate cache with stale data after concurrent update invalidation | 1. GET misses cache and reads stale product from DB. 2. UPDATE commits and invalidates cache. 3. GET's cacheSet writes stale data to cache. 4. Subsequent requests get stale data until next invalidation or TTL. |
| `api/_utils/cache.ts` | 203 | `invalidateProducts` only clears local instance's L1 cache, leaving other instances' L1 populated | Instance 1 updates and calls `invalidateProducts` (clears its L1 and Redis). Instance 2 still has product in L1 (not cleared) → serves stale product from L1 for up to 30 seconds (L1_MICRO TTL) even though Redis is cleared. |
| `api/_utils/cache.ts` | 221 | `invalidateProducts` may fail to delete Redis keys (`productRaw`, `productList`) silently, leaving stale data | During update, `invalidateProducts()` fails to delete Redis keys (e.g., network error) and only logs warning. Update proceeds to invalidate only `id` and `slug` keys. `productRaw` and `productList` remain in Redis with stale data → subsequent requests (until TTL expires) may get stale data. |

---

## Plausible Findings (Likely Real; Verification Inconclusive)

| File | Line / Note | Issue | Scenario |
|------|-------------|-------|----------|
| `api/products.ts` | 538 | Shared‑cache (`s-maxage`) responses remain stale after product mutations | CDN cache not purged by origin invalidations (same root as line 498 but for list endpoints). |
| `src/services/productApi.ts` | – | GET can read stale DB then write to cache after mutation invalidates cache (no synchronization/generation check) | Stale‑data refill race – depends on request interleaving. |

---

## No High‑Confidence Issues Found

- **Authentication/Authorization:** All endpoints correctly enforce `requireAdmin` (admin routes) or user‑ID scoping (customer routes). No IDOR or auth‑bypass detected.  
- **Input Sanitization:** Frontend uses React’s automatic escaping; no `dangerouslySetInnerHTML` or similar sinks with user‑controlled data.  
- **File Uploads:** Multipart & Cloudinary integration validated – no path traversal, type‑confusion, or unsigned‑upload risks.  
- **Dependency Audit:**  
  - **Next.js** critical RCE (CVE‑2024‑xxxxx) existed **already in base** (`geist` transitive) – not introduced by this PR.  
  - **Prisma/deepmerge‑ts** high‑severity findings **are introduced** by this PR (new direct dependencies).  

---

## Agent / Worktree Cleanup

No Git branches were created. The “many branches” seen in task notifications are **temporary agent sub‑processes** (launched via the `Agent` tool) running in isolated worktrees or the main checkout to parallelize the review. Each agent exits automatically on completion/failure, cleaning up its workspace. Nothing remains to delete manually. If any stray directories persist under `.claude/worktrees/`, they are safe to remove.

---

## Recommended Next Steps (Remediation)

1. **Fix confirmed defects** – prioritize:
   - Align admin status arrays with Prisma enum (`SOURCING`, `ADVANCE_PENDING`, `BALANCE_PENDING`, etc.).  
   - Merge guest cart into server cart on sign‑in (instead of replacement).  
   - Switch cart `add` to an atomic upsert (or use a transaction/optimistic lock).  
   - Normalize budget‑range input (ensure lower ≤ upper) and store both bounds.  
   - Make cache keys case‑sensitive (or normalize both cache and DB to the same case).  
   - Remove public `s-maxage` from product GET responses (or keep only for truly immutable data; add `private, no-store` for any user‑specific endpoints).  
   - Add cache‑invalidation logic that also purges edge/CDN caches (if using Vercel, consider `revalidateTag` or purge API).  
   - Guard against concurrent GET refilling stale cache (e.g., use a generation token or skip cache write if a newer invalidation timestamp exists).  
   - Update `productApi.ts` to cancel pending requests on clear, or use request IDs/generation checks to avoid stale writes.  
   - Fix the `finally` cleanup to only delete the request that created the entry (compare stored key or use a Map of promises).  
   - Add `prisma migrate deploy` (or equivalent) to the build script after `prisma generate`.  
   - Address the `deepmerge-ts` vulnerability: either upgrade to a non‑vulnerable Prisma version (if possible) or document/justify why the exposure is acceptable (CLI/build‑time only).  
   - Correct UI wording in `JewelleryRequestDetailModal.tsx` (“QuoteDown” → “Quote”).  

2. **Verify plausibles** (e.g., add cache‑generation tokens or use `If-None-Match`/`ETag` to prevent stale‑refill races; confirm Vercel’s behavior for `s-maxage` + `stale-while-revalidate`).  

3. **Run checks**:  
   ```bash
   npm run build   # already succeeded
   npm run lint    # warnings only (non‑blocking)
   # No test script – manual verification of the fixes above advised
   ```

---

**End of Report**  