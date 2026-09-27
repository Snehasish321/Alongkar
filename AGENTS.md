# Alongkar AI Development Rules

## 1. Understand before changing

* Read the existing code before creating new code.
* Trace the actual data flow before fixing a bug.
* Reuse existing components, hooks, contexts and utilities whenever possible.
* Do not duplicate functionality that already exists.

## 2. Keep the codebase simple

* Follow YAGNI: do not build functionality that is not required.
* Prefer the smallest correct implementation.
* Do not add a dependency unless the existing project cannot reasonably solve the problem.
* Prefer existing project patterns over introducing a new architecture.
* Avoid unnecessary abstractions, wrappers and helper files.

## 3. Alongkar architecture

Respect the existing structure:

* `src/components` → reusable UI components
* `src/pages` → page-level views
* `src/context` → shared application state
* `src/hooks` → reusable React hooks
* `src/lib` → utilities and integrations
* `src/types` → shared TypeScript types
* `src/data` → application/catalog data

Do not move files or redesign this structure unless the task genuinely requires it.

## 4. Product data

* Treat the database as the source of truth for dynamic products.
* Do not create a second product source just to solve a display issue.
* Keep product IDs, slugs and database records consistent between admin and storefront.
* When debugging products, trace:

Admin → Database → API/Data layer → Shop → Product details

## 5. React rules

* Prefer existing components before creating new ones.
* Keep state local unless it must be shared.
* Do not introduce global state unnecessarily.
* Avoid duplicate ProductCard, modal, drawer or form implementations.
* Keep components focused and readable.

## 6. Bug fixing

* Fix the root cause instead of adding a workaround.
* Check related callers and dependent code before changing shared logic.
* Do not patch only the visible symptom when the underlying shared function is incorrect.

## 7. Security

Never remove or weaken:

* Authentication
* Authorization
* Input validation
* Error handling
* Data protection
* Server-side security checks

Never expose secrets in client-side code.

## 8. Validation

After meaningful code changes:

* Run `npm run lint`
* Run `npm run build`
* Verify the affected user flow manually when appropriate.

Do not consider a task complete merely because the code compiles.

## 9. Dependency rule

Before installing a package, check:

1. Can existing code solve it?
2. Can an existing dependency solve it?
3. Can the browser/platform solve it natively?

Only add a package when there is a real need.

## 10. Change discipline

* Modify the fewest files necessary.
* Do not rewrite unrelated code.
* Do not change working functionality without a reason.
* Do not add speculative features.
* Preserve existing UI and behavior unless the task specifically asks for changes.

## 11. Completion rule

Before finishing, verify:

* The requested feature works.
* Existing functionality still works.
* No unnecessary files or dependencies were added.
* Lint passes.
* Production build passes.
