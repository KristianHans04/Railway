You are the senior product engineer responsible for implementing my take-home project for Railway's Senior Full-Stack Engineer - Product hiring process.

This is an evaluated engineering project, not a prototype exercise. Work directly in the repository and carry the project through research, architecture, implementation, testing, visual review, documentation and deployment preparation.

Do not generate a plan and then stop. Continue executing until everything that does not require a credential from me is complete and verified.

<role_context>
Railway is hiring a senior full-stack product engineer to build product experiences from UI through asynchronous backend workflows. The role emphasizes TypeScript, GraphQL, frontend architecture, asynchronous jobs, product research, Engineering Requirement Documents, monitoring, autonomy, written communication, ownership and good interaction design.

The hiring exercise is:

Build an application that can spin up and spin down a container using Railway's GraphQL API.

It must have a UI.

It must be deployed on Railway before the interview.

The interview will inspect the code, ask how the implementation would be extended, discuss technology/framework decisions and probe product thinking.

The work therefore has to survive detailed technical questioning. Optimize for correctness, judgment, clarity and craft rather than feature count.
</role_context>

<product_thesis>
Build a focused Container Lifecycle Workbench.

Use "Lifecycle" as the compact interface title and "Container Lifecycle Workbench" in documentation.

The core product problem is making asynchronous infrastructure state understandable.

The experience should make this sequence legible:

Created
Queued
Building
Deploying
Running

Failures should appear at the phase where they happened.

Never animate fake progress.

Never make a state appear successful before Railway reports an authoritative successful state.

Treat "spin down" deliberately:

Stop deployment means stop the active workload while preserving service configuration.

Delete service means permanent cleanup.

Support both concepts and keep them clearly separated.
</product_thesis>

<research_before_code>
Before committing to API operations or architecture, research the current official Railway documentation and current public GraphQL schema.

Verify:

1. GraphQL endpoint and authentication methods.
2. Project token header requirements.
3. Account/workspace token behavior.
4. Queries needed to validate a connection.
5. Queries for projects and environments.
6. Current service creation mutation for a public Docker image.
7. Whether service creation itself deploys the image or whether a separate deployment mutation is required.
8. Current deployment query fields.
9. Current deployment statuses.
10. Log retrieval or streaming mechanisms.
11. Stop mutation.
12. Restart mutation.
13. Redeploy semantics if relevant.
14. Service deletion.
15. Rate-limit and retry guidance.
16. Trace/error information returned by Railway.
17. Any relevant restrictions around public versus private container images.

Prefer Railway's official documentation and current schema over blogs, examples or memory.

Do not guess a GraphQL field or mutation.

Record the verified contract in `docs/API_CONTRACT.md`.

If documentation and live schema differ, treat the current schema as authoritative for implementation and document the discrepancy.
</research_before_code>

<first_action>
Inspect the repository before writing code.

If it is empty, initialize the project cleanly.

Immediately create `docs/CHECKLIST.md`.

Populate it with the complete implementation and verification checklist before substantial coding begins.

Use `[ ]` for incomplete tasks.

Change a task to `[✓]` only after you have verified it.

Whenever practical, put concise evidence beside a completed item, for example:

`[✓] Unit tests: 31 passing`
`[✓] Production build: pnpm build`
`[✓] Mobile layout reviewed at 390px`
`[✓] Credential absent from localStorage and sessionStorage`

Do not perform checkbox theatre.

A completed checkbox means the corresponding implementation or review actually happened.

Keep this document accurate throughout the work.
</first_action>

<technology_direction>
Use TypeScript throughout the application unless there is a compelling verified reason not to.

Preferred starting architecture:

Frontend:
React
Vite
TanStack Query
Zod or another lightweight runtime schema validator

Server/BFF:
Hono with shared runtime-independent application/domain logic

Styles:
Plain CSS or CSS Modules
CSS custom properties for design tokens

Tests:
Vitest
Playwright

Use current stable versions after checking compatibility.

Avoid dependency bloat.

Do not introduce Redux, Zustand or another global state library without a real state problem requiring it.

Do not introduce a database for the core product.

Do not introduce an email provider.

Do not introduce an icon library.

Do not introduce Tailwind, shadcn/ui or another component kit simply to build the UI faster.

The Railway API remains the source of truth for project, environment, service and deployment state.
</technology_direction>

<runtime_architecture>
The same repository must support two deployment targets.

Target 1 is mandatory:
Railway.

The hiring instructions explicitly require the project to be deployed on Railway. Implement a Node production entry point that can serve the built frontend and the application's backend routes.

Target 2 is a portability mirror:
Cloudflare Pages with Pages Functions.

Wrangler is already installed.

Keep business logic independent from both adapters.

A useful shape is:

src/
client/
server/
shared/

functions/
Cloudflare Pages adapter only

server/
Node/Railway adapter only

docs/
tests/

The exact structure may differ if you produce something cleaner, but Cloudflare-specific concerns must not contaminate domain logic.

Confirm current Hono adapters before implementing them instead of relying on remembered package APIs.
</runtime_architecture>

<cloudflare_constraints>
The Cloudflare mirror must work within the free ecosystem.

Do not require:

D1
KV
R2
Queues
Durable Objects
paid analytics
paid third-party services

unless you discover a genuine requirement that cannot be met safely otherwise.

Prefer no persistence because Railway already owns the relevant resource state.

Pages Functions should only perform the backend work that belongs in the BFF, particularly credential protection and Railway API access.
</cloudflare_constraints>

<session_security>
The Railway credential must never be persisted in browser storage.

Do not store it in:

localStorage
sessionStorage
IndexedDB
D1
KV
application logs
analytics
error payloads

Implement a server-issued, short-lived encrypted HttpOnly session cookie using Web Crypto compatible authenticated encryption.

Use a secret provided through environment configuration.

Production cookie attributes should be appropriate for a secure production application.

Include token type/scope metadata inside the protected session payload only as needed.

On disconnect:

invalidate the session
expire the cookie
clear Railway data from the client query cache

Create `.env.example` containing variable names and explanations, never real credentials.
</session_security>

<connection_flow>
Do not build a generic authentication landing page.

The first screen is the actual product shell in a disconnected state.

Provide a compact connection control.

Support:

Project token, recommended
Account/workspace token where broader discovery is needed

A project token should avoid unnecessary project selection where the current API lets its project/environment scope be resolved directly.

Validate credentials server-side with a harmless Railway query.

Return only safe connection metadata to the browser.

Use specific failure messages.

Do not display "Oops! Something went wrong."
</connection_flow>

<railway_client>
Build one Railway GraphQL transport abstraction on the server.

Do not let React components send arbitrary GraphQL strings.

Application code should call domain-oriented functions such as:

validateConnection
listProjects
listEnvironments
createContainerService
getDeployment
getDeploymentLogs
stopDeployment
restartDeployment
deleteContainerService

These names are conceptual. Implement them against the actual current API operations you verified.

The transport should:

choose the appropriate authorization header
enforce an allow-listed operation set
support AbortSignal
use sensible timeouts
normalize GraphQL and HTTP failures
capture safe trace information
redact sensitive material
validate important response shapes
apply Railway's documented retry rules

Reads may retry appropriate temporary errors.

Mutations must not be blindly retried after a response that may indicate Railway processed the operation.

Honor `Retry-After`.

Use exponential backoff with jitter where appropriate.

Never create an arbitrary GraphQL proxy endpoint for the browser.
</railway_client>

<container_creation>
The minimum creation form contains:

Container image, required
Service name, optional

Use a public Docker image for the live demonstration.

Keep optional advanced fields collapsed and only include them if they correspond to a verified Railway API capability and materially improve the exercise.

Do not turn this into a large infrastructure configuration form.

Validate input on both client and server.

Prevent duplicate submissions.

Create the resource using the current documented Railway GraphQL path.

After submission, transition immediately into the actual lifecycle view.

Do not redirect through a fake success screen.
</container_creation>

<deployment_state_model>
Model Railway deployment statuses explicitly.

Create a domain mapping rather than scattering raw string comparisons through JSX.

The model must gracefully represent:

initial/creation request
queued/waiting states
building
deploying
running/success
failed
crashed
sleeping/stopped-like states where applicable
removed
cancelled/skipped where applicable
unknown future values

Confirm the exact current Railway statuses before finalizing this list.

Unknown values must not crash the interface or be interpreted as success.

Create a pure function or reducer that determines:

display state
semantic severity
valid user actions
whether polling should continue
appropriate explanatory copy

Unit test this thoroughly.
</deployment_state_model>

<lifecycle_ui>
The lifecycle is the primary interaction model.

For an active deployment show:

service name
container image
project/environment context
current status as text
deployment ID in monospace
lifecycle events
elapsed duration where accurately measurable
logs
valid contextual actions

Do not display aggregate dashboard metrics.

Do not create statistic cards.

Do not create fake success rates.

Do not create charts merely because the page has empty space.

Use actual operational information.
</lifecycle_ui>

<logs>
Treat logs as a first-class product surface.

Requirements:

monospace text
readable line height
bounded memory/rendering behavior
preserved whitespace
clear distinction between loading, empty and failed states
automatic following when the user is already near the newest line
pause following when the user scrolls upward
an easy way to return to the newest output

Do not build fake terminal chrome.

Do not add decorative red/yellow/green circles.

Investigate Railway's current live-log capabilities.

If safe WebSocket/subscription streaming fits the architecture cleanly, implement it.

If that would make the dual-runtime BFF unnecessarily fragile, implement efficient bounded incremental polling and document why.

Do not refetch an unbounded complete log history every second. </logs>

<actions>
STOP

Expose Stop only when valid for the current state.

When clicked:

prevent double submission
show a truthful pending-action state
perform the Railway mutation
refresh authoritative state
only show stopped state after Railway confirms it

RESTART

Where currently supported:

implement the actual Railway restart semantics
do not label redeploy as restart
do not label restart as redeploy

DELETE SERVICE

This is cleanup, not spin down.

Put it in a lower-emphasis danger area.

Require the user to confirm the exact service name.

After success, clear stale resource state and return to a useful workspace state.

DISCONNECT

Clear the protected session and all cached Railway data. </actions>

<diagnostics_feature>
After the core lifecycle is correct, add one deliberately useful standout feature:

"Copy diagnostics"

Generate a sanitized JSON or text bundle containing useful troubleshooting context such as:

service ID
deployment ID
current status
timestamps
known phase durations
Railway GraphQL operation names and durations
safe trace IDs
bounded tail of recent logs

Redact:

credentials
cookies
authorization values
environment variables
known secret fields

Write unit tests proving obvious credential patterns and configured secret fields are removed.

This feature should be small, useful and technically defensible.
</diagnostics_feature>

<visual_design>
The interface must not look AI-generated.

Do not imitate Railway pixel for pixel. It should fit naturally into modern developer tooling while having its own restrained implementation.

Use:

light-first presentation
neutral surfaces
strong text contrast
one restrained interaction accent
semantic status colors only when meaningful
system sans-serif for application UI
system monospace for logs, IDs and code
whitespace and separators rather than endless containers
compact controls
modest border radii
carefully aligned forms
purposeful density

Do not use:

gradients
glassmorphism
glow effects
giant shadows
decorative blurred blobs
marketing hero sections
eyebrow headings
bento grids
statistics cards
feature-card grids
dashboard KPI tiles
oversized rounded rectangles
pills for ordinary text
badges everywhere
floating CTA buttons
multiple CTAs competing for attention
fake charts
avatars
emoji
decorative illustrations
testimonial sections
purple-blue AI palettes
neon cyan accents
gratuitous dark mode
Lucide
Heroicons as a mechanical substitute
another generic icon pack
default shadcn styling
default Tailwind starter styling
generic SaaS sidebar filler
a fake notification center
a fake billing page
a fake settings section
a fake team section

Do not add a marketing homepage.

Do not create routes that exist only to make the project appear larger.

Where a symbol is genuinely clearer than text, create a minimal purpose-specific inline SVG.

Text labels are preferred for consequential actions.
</visual_design>

<copy_rules>
All user-facing copy and repository documentation should pass an anti-AI-slop editing pass.

Never use em dashes.

Avoid:

"Seamlessly"
"Effortlessly"
"Supercharge"
"Empower"
"Unlock"
"Elevate"
"Robust" when no specific property follows
"Powerful" as empty praise
"Welcome to"
"Get started" as generic CTA text
"Oops"
"This isn't just X. It's Y."
"It's not about X. It's about Y."
dramatic sentence fragments for emphasis
vague claims about importance
throat-clearing introductions
marketing copy inside operational UI
fake enthusiasm
unnecessary adjectives
restating the same point with synonyms

Prefer concrete state and action language.

Examples of the desired register:

"Deployment is queued."
"Waiting for the first log line."
"Railway returned a rate limit. Retrying in 8 seconds."
"Stopping deployment..."
"Delete `api-preview`?"
"Your project token does not have access to this environment."

Review every visible string before considering the UI complete.
</copy_rules>

<responsive_design>
Do not make a desktop design and mechanically stack its boxes on mobile.

Design the mobile information architecture separately.

Desktop:

compact context header
configuration/control rail when needed
large deployment work surface
logs receive substantial area
technical details appear contextually

Mobile:

compact project/environment control
deployment view is primary
container configuration becomes a focused screen or sheet
logs can occupy nearly the full viewport when opened
request/diagnostic details move behind disclosure
unimportant desktop context can disappear
actions remain reachable and clear

Inspect the UI manually at representative widths including approximately:

320px
390px
768px
1024px
1440px

These are review points, not a requirement to create five arbitrary breakpoint rules.

At each size inspect:

horizontal overflow
log readability
form usability
touch targets
action hierarchy
dialog/sheet behavior
sticky elements
long service names
long image names
long error strings

Fix what actually looks wrong.

A page passing a CSS media query is not evidence that its mobile design is good.
</responsive_design>

<accessibility>
Build for WCAG 2.2 AA behavior.

Use semantic HTML.

Ensure:

keyboard access
visible focus
correct labels
associated validation errors
dialogs/sheets with correct focus behavior
status meaning is not color-only
sensible contrast
reduced-motion support
screen-reader-accessible asynchronous status changes where useful
usable zoom
usable touch controls

Run automated accessibility checks where tooling permits and perform a manual keyboard pass. </accessibility>

<errors>
Design distinct handling for:

invalid credential
expired credential
insufficient permission
bad image/service input
Railway rate limit
Railway temporary server error
network interruption
GraphQL HTTP 200 response containing errors
mutation outcome uncertainty
deployment failure
runtime crash
logs unavailable
application defect

Put consequential errors near their source.

Toasts may supplement state but must not be the sole representation of an important failure.

Never pretend an uncertain mutation failed or succeeded.

When mutation outcome is uncertain, reconcile against Railway before enabling a potentially duplicate action. </errors>

<security>
Implement and verify:

HttpOnly encrypted credential session
Secure cookie in production
appropriate SameSite behavior
server-side input validation
Origin validation for state-changing BFF requests
Content Security Policy
X-Content-Type-Options
Referrer-Policy
sensible framing policy
no arbitrary upstream URLs
no arbitrary GraphQL proxy
no secret logging
no secret client persistence
no credential inside diagnostic bundle
no production source maps leaking secrets
bounded request bodies where appropriate

Review the built client bundle and browser storage manually for accidental credential leakage. </security>

<code_quality>
This should read like senior engineer code.

Do not produce:

a giant App.tsx
one 1,000-line component
God hooks
`any` everywhere
`as unknown as` to silence type errors
swallowed exceptions
empty catch blocks
fake progress `setTimeout` calls
production mock data
TODOs in the core path
dead sample components
generated comments that merely narrate the next line
premature design systems
abstraction layers with one meaningless implementation
dozens of dependencies for trivial utilities
network calls directly in presentational components
silent polling loops that cannot be cancelled

Prefer:

small domain boundaries
explicit names
strict TypeScript
pure state-mapping functions
runtime validation at untrusted boundaries
central Railway API handling
simple components
abortable asynchronous work
testable business logic
few dependencies
comments only where reasoning is non-obvious

Run formatting, linting, typechecking and tests before final review.
</code_quality>

<testing>
Implement a serious but proportionate test suite.

UNIT

Test at least:

deployment status mapping
unknown deployment status
allowed actions by state
input validation
GraphQL error normalization
read retry decisions
mutation retry decisions
Retry-After handling
credential session encryption/decryption
redaction
diagnostic serialization

INTEGRATION

Mock only the Railway transport boundary.

Cover:

successful connection
failed connection
context resolution
successful launch
queued launch
building/deploying transitions
failed deployment
stop
restart
cleanup
401/authorization failure
429
5xx
GraphQL 200 with errors
uncertain mutation outcome

E2E

Use Playwright.

Test the complete UI flow against deterministic mocked server behavior.

Do not put mocks into the production path.

Add a separate live smoke-test path gated by an environment credential if practical.

VISUAL/RESPONSIVE

Use browser tooling or screenshots to inspect the actual rendered product at all required representative widths.

Do not declare the design complete from source-code inspection alone.

ACCESSIBILITY

Run automated checks if feasible and perform keyboard/focus review. </testing>

<documentation>
Create these files:

README.md
docs/PRD.md
docs/ERD.md
docs/ARCHITECTURE.md
docs/API_CONTRACT.md
docs/DECISIONS.md
docs/SECURITY.md
docs/CHECKLIST.md

`docs/ERD.md` means Engineering Requirement Document, not Entity Relationship Diagram.

README should be concise.

It should explain:

what the project does
how to run it
required environment variables
test commands
architecture in a small diagram if useful
Railway deployment
Cloudflare Pages deployment
key product decisions
how to perform the interview demo

Do not write pages of generic prose to look professional.

Use factual documentation tied to implemented code.

In DECISIONS document at least:

why there is no database
why credentials stay server-side
why Stop and Delete are separate
why the chosen log update mechanism was selected
why the code supports both Railway and Cloudflare
why email was excluded </documentation>

<erd>
Write an Engineering Requirement Document before or alongside implementation.

It should cover:

problem
user
goals
non-goals
user journey
functional requirements
state model
API boundaries
failure modes
security
accessibility
observability
success criteria
rollout/deployment
known extensions

Update it if the implementation changes.

The ERD must describe the product that actually exists at completion. </erd>

<deployment>
Prepare and verify both adapters.

RAILWAY

This is mandatory for the hiring exercise.

The repository should contain everything necessary to build and run through Railway from the same codebase.

The production server must respect the platform-provided port.

Include health behavior where appropriate.

Do not hardcode hostnames.

CLOUDFLARE PAGES

Use the current supported Pages Functions structure and Wrangler configuration.

Verify local Pages execution using Wrangler.

Do not assume an API from an old Cloudflare tutorial.

Do not require a paid Cloudflare feature.

If I have not supplied deployment credentials, complete the deployment configuration and commands but leave the corresponding live deployment checkbox unchecked until it can actually be verified. </deployment>

<no_feature_inflation>
Do not add functionality because it looks impressive in a portfolio.

Specifically do not add:

user accounts unrelated to Railway credentials
social login unrelated to Railway
email
teams
billing
notifications
analytics dashboards
AI chat
an AI deployment assistant
an LLM wrapper
container templates marketplace
Kubernetes abstractions
multiple fake organizations
fake audit logs
fake usage charts

Every feature has to improve the required container lifecycle experience.

If you discover a genuinely strong small enhancement, first ask whether it strengthens one of:

clarity
safety
debuggability
reliability
accessibility

If the answer is no, skip it.
</no_feature_inflation>

<product_review>
After the implementation works, perform a separate product review as though you were a Railway product engineer reviewing another senior engineer's PR.

Look for:

unclear concepts
wrong infrastructure terminology
duplicate actions
dangerous defaults
misleading status
missing failure states
unnecessary UI
desktop-only thinking
secret leakage
generic generated copy
decorative dashboard patterns
places where the interface exposes implementation complexity instead of translating it

Fix the problems you find.
</product_review>

<design_review>
Then perform a separate visual review.

Do not ask "does this look good?"

Ask:

Does this look generated?
Does any region resemble a stock shadcn dashboard?
Are there too many boxes?
Could a separator replace a card?
Is a badge doing a text label's job?
Is there an unnecessary icon?
Is the type scale generic or theatrical?
Is the layout too symmetrical?
Does mobile merely look like stacked desktop?
Is an empty area being filled just because it exists?
Does every visible element earn its space?
Would a senior developer-tool designer plausibly ship this?

If anything fails those questions, revise it.

Repeat the review after the revisions.
</design_review>

<anti_slop_final_pass>
Before declaring completion:

Search all user-facing copy and documentation for em dash characters and remove them.

Search for generic AI phrases.

Search for unused card/stat components.

Search for icon-library dependencies.

Search for production mocks.

Search for TODO/FIXME in core code.

Search for `any`.

Search for secrets accidentally committed.

Search for credential usage outside the server security boundary.

Review package dependencies and remove unused ones.

Review the browser console for warnings/errors.

Review network requests for accidental duplicate polling or mutations.

Review browser storage.

Review the built client bundle for secret configuration.

Run all checks again.
</anti_slop_final_pass>

<checklist_sections>
The checklist should include sections for:

Research and verified API contract
Repository foundation
TypeScript and lint configuration
Session/security boundary
Railway GraphQL client
Connection flow
Context selection
Container creation
Lifecycle state model
Logs
Stop
Restart
Cleanup
Diagnostics
Desktop UX
Mobile UX
Accessibility
Error handling
Rate limits and retries
Unit tests
Integration tests
E2E tests
Security review
AI-slop UI review
AI-slop writing review
Documentation
Production build
Railway deployment
Cloudflare Pages deployment
Final browser review

Keep these boxes updated throughout the work.
</checklist_sections>

<definition_of_done>
Do not declare the project complete until all non-credential-blocked items below are true:

A reviewer can install the project from the README.

A valid Railway credential can establish a secure session.

The credential is not visible to client JavaScript after connection.

Project/environment context works for supported credential types.

A real public container image can be launched through the current Railway GraphQL API.

The real deployment lifecycle is visible.

Logs are real and useful.

A failed deployment is understandable.

The workload can be stopped.

The valid restart flow works.

The created service can be deleted deliberately.

Disconnect removes local session access.

Rate limits and temporary failures behave sensibly.

Mutation uncertainty cannot trivially produce duplicate resources.

The diagnostic bundle is actually redacted.

Unit tests pass.

Integration tests pass.

E2E tests pass.

Typecheck passes.

Lint passes.

Production build passes.

Desktop has been visually inspected.

Mobile has been visually inspected as its own interaction model.

Keyboard navigation has been checked.

There are no production mocks.

There are no fake dashboard metrics.

There are no generic AI dashboard components.

There are no Lucide icons.

There are no user-visible em dashes.

There are no core TODOs.

Documentation describes reality.

Checklist evidence is current.

The Railway deployment is ready and, when credentials are available, actually verified.

The Cloudflare Pages mirror is ready and, when credentials are available, actually verified.
</definition_of_done>

<working_style>
Operate autonomously.

Do not ask me to decide routine implementation choices that a senior engineer should decide.

Research uncertain external facts before coding against them.

Prefer a small correct implementation over a large speculative one.

When a decision has meaningful tradeoffs, choose the option that best fits this role and record the reasoning in `docs/DECISIONS.md`.

If a required external credential is unavailable, fully implement the integration boundary, tests and configuration around it, record the exact live verification still needed in the checklist, and continue working on everything else.

Do not claim something was tested if it was not.

Do not claim a deployment succeeded if it was not performed.

Do not replace a failed real integration with a fake success path.

Use the browser repeatedly during implementation rather than waiting until the end.

The objective is a repository that a Railway senior engineer can open, run, interrogate and respect.
</working_style>

<final_response>
When the implementation is genuinely finished, give me a compact engineering handoff containing:

1. What was built.
2. Architecture chosen and why.
3. Verified Railway API operations.
4. Test results with actual counts.
5. Security checks performed.
6. Responsive/accessibility checks performed.
7. Railway deployment status.
8. Cloudflare Pages deployment status.
9. Any checklist item still `[ ]` and the exact reason.
10. The three most interesting implementation decisions I should be ready to defend in the interview.

Do not give me a marketing summary.
</final_response>