# Container Lifecycle Workbench checklist

Checked items have local evidence. Mocked tests and local adapter checks do not establish live Railway or Cloudflare behavior.

## Research and verified API contract

- [✓] Railway documentation reviewed: endpoint, token headers, create, deploy, status, logs, stop, restart, delete, rate limits and retries recorded in `API_CONTRACT.md`.
- [✓] Authenticated live schema introspection: Railway CLI login succeeded; `ServiceCreateInput`, deployment mutations, log queries, `DeploymentStatus`, and token operations inspected on 2026-09-18.
- [ ] Confirm service creation and selected environment behavior with a live project token.

## Repository foundation and backend

- [✓] Strict TypeScript, lint, Vite build and CI configuration: `pnpm typecheck`, `pnpm lint`, `pnpm build` pass.
- [✓] AES-GCM HttpOnly session, SameSite, production Secure cookie, CSRF and Origin checks: session and route tests pass.
- [✓] Fixed Railway GraphQL transport, response validation, safe errors, bounded read retries, and no mutation retry after uncertainty: transport tests pass.
- [✓] Connection, account/project discovery, scoped context: route tests cover both token paths with a mocked Railway transport.
- [✓] Container creation, deployment read and explicit manual environment deploy: route tests pass with a mocked Railway transport.
- [✓] Bounded build/runtime logs and failure states: route, component and browser tests pass.
- [✓] Stop, Restart and exact-name Delete: route and browser journeys pass with mocked Railway responses.
- [✓] Sanitized diagnostics and structured request logging: redaction unit tests and server review complete.
- [✓] Node adapter: production build served `/`, `/robots.txt` and `/api/health` locally on port 3100 with security headers.
- [✓] Pages adapter: Wrangler local run served `/` and `/api/health` with secret binding and static security headers.

## Product and UI

- [✓] Disconnected shell, context controls, configuration and deployment views: browser journey passed.
- [✓] Desktop visual review: revised connection, queued and running deployment screenshots inspected at 1024px and 1440px.
- [✓] Mobile visual review: revised connection, queued and running deployment screenshots inspected at 320px, 390px and 768px; mobile hides the desktop product preview, collapses deployment identifiers, uses compact context, and changes the lifecycle to a vertical sequence; no horizontal page overflow at any review width.
- [✓] Automated accessibility and keyboard checks: axe reported zero violations in light and dark deployment views and the dark connection view; skip link, mobile focus entry and Escape behavior passed in Playwright.
- [ ] Screen reader pass with assistive software: not performed in this environment.
- [✓] Error, unknown-state and mutation-uncertainty review: status mapping, transport and UI tests pass.
- [✓] UI and writing review: screenshots inspected after the 2026-09-19 rebuild; warm canvas, deep green navigation, coral actions, sage configuration rail, blue log controls, semantic status fills, rounded surfaces, and a product-specific desktop login preview applied. Decorative coloured card edges and purple were removed; IBM Plex Sans and Mono remain self-hosted.

## Verification and delivery

- [✓] Unit and integration tests: 46 passing on 2026-09-19; Vitest coverage 85.05% statements and 94.77% lines for application source.
- [✓] Browser tests: 2 passing on 2026-09-19, including the core journey and five viewport widths.
- [✓] Dependency audit: `pnpm audit` reported no known vulnerabilities on 2026-09-19.
- [✓] Security checks: session/CSRF tests, browser storage assertion, no duplicate create mutation, and built client scan for server credential names, upstream URL and source map links.
- [ ] 100% security-critical statement and branch coverage across the BFF and transport: the session module has zero uncovered statements or branches, but route and transport branches remain below 100%.
- [✓] Documentation: README, PRD, ERD, architecture, API contract, decisions and security review written against the implementation.
- [✓] Production build: `pnpm build` passes with no client source maps.
- [ ] Railway deployment and live container smoke test: CLI login works, but `railway init` rejected creation of an isolated project with "Your trial has expired. Please select a plan to continue using Railway." An active Railway plan is required.
- [✓] Cloudflare Pages live deployment: production at `https://lifecycle-workbench.pages.dev/`; `/` and `/api/health` returned 200, session cookie and security headers verified, cross-origin POST rejected, and an invalid project token reached Railway and returned 401. Production secrets set in Pages, not in the repository.
- [✓] Final browser review: screenshots inspected, axe passed, browser console had no errors, and Playwright checked browser storage.

## Known limits to resolve before submission

- Live Railway behavior must be checked for project and workspace token permissions, image creation in a selected environment, log `startDate`, Stop, Restart and cleanup. Authenticated schema introspection and mocked tests are the current evidence; project creation is blocked by the expired Railway trial.
- Rate limiting is per process or Pages isolate and uses a forwarded IP header. A production edge rule is needed for distributed abuse protection. CAPTCHA was not added to the token connection form.
- The API rate budget is designed around two-minute polling plus five-minute project cache, but it has not been measured with a live Free-plan token.
