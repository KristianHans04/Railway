# Container Lifecycle Workbench

## 1. Product purpose

Build a focused developer tool that lets a Railway user securely connect their account or project, select the appropriate Railway context, launch a service from a public container image, understand exactly what Railway is doing while the deployment progresses, inspect runtime logs, stop the running deployment, restart it, and clean up the created service.

The product should demonstrate senior product engineering through interaction design, state modeling, API correctness, reliability, security, documentation, responsive behavior, and engineering judgment.

It is deliberately not a general Railway dashboard.

## 2. Hidden evaluation criteria

The take-home technically asks for a UI that spins a container up and down through Railway's GraphQL API.

The deeper evaluation is likely to include:

1. Can the engineer translate an underspecified problem into sensible product semantics?
2. Can the engineer model asynchronous distributed-system state without lying to the user?
3. Can the engineer work comfortably across frontend and backend boundaries?
4. Does the engineer understand GraphQL beyond sending one mutation?
5. Are secrets and destructive actions handled responsibly?
6. Does the UI make complicated infrastructure behavior easier to understand?
7. Does the engineer recognize edge cases before an interviewer has to point them out?
8. Can the implementation be explained and extended coherently during a 60-minute technical discussion?
9. Does the engineer make deliberate scope decisions rather than accumulating features?
10. Does the work feel authored by an experienced engineer rather than assembled from generated components?

## 3. Product thesis

The key UX problem is uncertainty during infrastructure operations.

After a user clicks Launch, several states can occur before the workload becomes usable. Failure can happen during queueing, building, deployment or runtime. A simple spinner obscures that information.

The application will therefore center the experience around a visible deployment lifecycle:

Created → Queued → Building → Deploying → Running

Failures branch from the relevant phase rather than becoming a generic red toast.

Railway's actual API status remains the source of truth. The application never simulates progress.

## 4. Working name

Use "Lifecycle" in the interface.

Use "Container Lifecycle Workbench" in technical documentation.

Do not create a startup-style logo, slogan, mascot, marketing landing page or fabricated brand narrative.

## 5. User

Primary user:

A software engineer with access to a Railway project who wants to launch and control a container without losing visibility into what is happening.

Secondary user:

The Railway engineer reviewing this take-home, who needs to understand the architecture and product decisions quickly.

## 6. Core jobs to be done

The user needs to:

* connect Railway securely;
* establish a project and environment context;
* launch a public Docker image;
* know what state the operation is actually in;
* inspect useful logs while it progresses;
* understand a failure without opening browser developer tools;
* stop runtime execution without accidentally deleting its configuration;
* restart the workload;
* deliberately remove resources when finished;
* disconnect and remove their credential from the application.

## 7. Critical semantic decision: "spin down"

"Spin down" is ambiguous.

This product assigns separate meanings:

Stop deployment:
Stops the active workload while retaining the Railway service configuration.

Delete service:
Permanently removes the service and is presented as cleanup.

The UI must never use "Stop" and "Delete" interchangeably.

This is important enough to explain in `docs/DECISIONS.md`.

## 8. End-to-end flow

### 8.1 Initial state

The application opens directly into the workspace shell.

There is no marketing page.

The workspace says that no Railway connection is active and provides a compact connection form.

The form explains in one sentence that credentials are used server-side and are not written to browser storage.

Token choices:

* Project token, recommended because its scope is narrower.
* Account or workspace token where broader context discovery is required.

Do not create a conventional sign-in page with a giant logo, illustration, gradient panel or testimonial.

### 8.2 Credential validation

When submitted:

1. Send the credential to the application server through TLS.
2. Determine and validate its declared token type using an appropriate harmless Railway query.
3. Encrypt the credential into a short-lived HttpOnly session cookie.
4. Return only non-secret session metadata to the browser.
5. Never return the credential to client JavaScript.
6. Never store it in localStorage, sessionStorage, IndexedDB, D1 or KV.
7. Never include it in logs or error reporting.

Invalid credentials return a concrete explanation.

### 8.3 Context selection

For an account or workspace credential:

Show a compact project selector and then environment selector.

For a project-scoped credential:

Resolve its permitted project/environment context where the API supports this and avoid presenting meaningless choices.

The selected context remains visible in the workspace header.

### 8.4 Launch container

Required input:

Container image.

Optional input:

Service name.

Advanced configuration should stay collapsed unless a verified Railway API capability materially improves the exercise.

Do not create a multi-step wizard for two inputs.

A quiet example can show a known public image format, but production behavior must use the user's actual value.

Before launching:

* validate input locally;
* prevent accidental duplicate submissions;
* show the selected target environment;
* clearly state what resource is about to be created.

### 8.5 Service creation and deployment

The backend performs verified Railway GraphQL operations.

The implementation must inspect the current Railway schema before finalizing mutation names or fields.

The operation sequence should be represented internally as explicit domain operations instead of GraphQL scattered through React components.

Example domain boundary:

`createContainerService()`
`getDeployment()`
`getDeploymentLogs()`
`stopDeployment()`
`restartDeployment()`
`deleteContainerService()`

The exact GraphQL beneath these methods is documented in `docs/API_CONTRACT.md`.

### 8.6 Lifecycle view

After launch, configuration recedes and the deployment becomes the primary object.

Show:

* service name;
* container image;
* Railway environment;
* current state as text and restrained semantic color;
* deployment identifier in monospace;
* elapsed operation duration;
* lifecycle events;
* live or incrementally refreshed logs;
* context-appropriate actions.

Do not display fake metrics.

Do not display "Total deployments", "Success rate", "Containers running" or other statistic tiles.

### 8.7 Lifecycle timeline

Represent real states received from Railway.

Known deployment statuses must be mapped explicitly and safely, including asynchronous and failure states.

Unknown future statuses must render as an understandable unknown state rather than crashing or being silently interpreted as success.

Each lifecycle event contains:

* phase;
* time;
* status;
* optional duration;
* concise failure information where relevant.

Where useful, a disclosure reveals sanitized request information such as:

* GraphQL operation name;
* request duration;
* response outcome;
* Railway trace identifier where supplied.

Never expose credentials, headers, environment variable values or other secrets.

### 8.8 Logs

Logs are a first-class portion of the run view.

Requirements:

* readable monospace typography;
* follow latest output where appropriate;
* pause automatic following when the user scrolls upward;
* allow returning to the newest line;
* preserve useful whitespace;
* do not fake terminal chrome;
* do not add decorative red/yellow/green traffic-light buttons;
* represent loading with factual copy such as "Waiting for the first log line";
* distinguish an empty log stream from a failed log request;
* avoid refetching the complete log history on every polling interval.

If Railway's current APIs offer an appropriate streaming mechanism that works safely through the backend architecture, use it. Otherwise implement bounded incremental polling and document the tradeoff.

### 8.9 Stop

The Stop action is available only when valid for the current Railway state.

On activation:

* prevent duplicate mutation submission;
* immediately show that the stop request is being processed;
* wait for Railway to become authoritative again;
* do not manufacture a "Stopped" status before the API confirms it;
* surface an API failure inline.

### 8.10 Restart

Where supported by the current Railway deployment state and API:

* restart without rebuilding when the Railway API defines restart that way;
* clearly distinguish Restart from Redeploy if both concepts exist;
* refetch the authoritative state afterward.

### 8.11 Cleanup

"Delete service" belongs in a lower-emphasis danger area.

Require explicit confirmation containing the service name.

After deletion:

* clear the selected run;
* return to a useful empty state;
* confirm cleanup without a celebratory modal.

### 8.12 Disconnect

Disconnecting:

* expires the server-issued session;
* expires the browser cookie;
* clears cached Railway responses from the client query cache;
* returns to disconnected state.

## 9. Standout feature: diagnostic bundle

Once the core lifecycle is complete, implement a small "Copy diagnostics" action.

It creates a sanitized troubleshooting payload containing useful information already available to the application, such as:

* service identifier;
* deployment identifier;
* current status;
* timestamps;
* known phase durations;
* GraphQL operation names and timings;
* trace IDs where available;
* a bounded tail of relevant logs.

It must automatically omit or redact:

* Railway credentials;
* authorization headers;
* cookies;
* environment variable values;
* known secret fields.

This is useful product functionality rather than a demo gimmick and creates a strong interview discussion around observability, supportability and security.

## 10. Information architecture

Desktop:

Top context bar:
Lifecycle | connection state | project/environment context | disconnect

Workspace:

Left control rail, approximately 320 to 380px when configuration is needed.

Main work surface containing the current deployment lifecycle and logs.

A narrow detail surface may appear contextually when inspecting technical information.

Do not create a permanent application sidebar containing unrelated sections.

Do not create Dashboard, Analytics, Billing, Settings or Team navigation merely to fill space.

### Desktop launch state

Left:
Container configuration.

Right:
Useful empty workspace explaining what will appear when a deployment begins.

### Desktop active state

Main area prioritizes:

1. deployment identity and state;
2. lifecycle;
3. logs;
4. contextual actions;
5. request/diagnostic details.

### Mobile

Do not stack the desktop columns vertically and call it responsive.

On narrow screens:

* context becomes a compact top control;
* the primary screen is the deployment/run view;
* configuration opens as its own focused screen or sheet;
* logs receive most of the viewport while being inspected;
* technical request details move behind a disclosure;
* destructive actions remain reachable without competing with primary content;
* tables become purpose-built rows rather than horizontally overflowing desktop tables.

Test actual layout behavior at several narrow and wide viewport sizes.

## 11. Visual direction

The product should look like developer infrastructure tooling designed intentionally by a human team.

Use:

* light-first interface;
* neutral background;
* high-contrast text;
* restrained single accent for selection and focus;
* semantic colors only where state requires them;
* system sans-serif typography for interface text;
* system monospace typography for logs, identifiers and code;
* separators and whitespace for hierarchy;
* compact controls;
* modest corner radii;
* strong text hierarchy without oversized marketing typography.

Avoid:

* gradients;
* glassmorphism;
* glow;
* giant shadows;
* decorative blobs;
* hero sections;
* eyebrow text;
* bento grids;
* feature cards;
* statistic cards;
* excessive pills;
* gratuitous badges;
* icon-only actions where text would be clearer;
* Lucide;
* Heroicons used as a Lucide replacement;
* generic icon packages throughout the interface;
* shadcn visual defaults;
* default Tailwind starter aesthetics;
* oversized 12px to 20px border radii everywhere;
* fake charts;
* avatars;
* fake activity;
* placeholder testimonials;
* emoji;
* decorative illustrations;
* "Get Started";
* repeated CTA buttons.

Where an icon is genuinely useful, draw a tiny purpose-specific inline SVG or use a text label.

## 12. Copy direction

Interface text should sound like engineering software.

Good:

"Deployment is queued."
"Railway returned a rate limit. Retrying in 8 seconds."
"Stopping deployment..."
"No logs have been emitted yet."
"Delete `api-preview`?"

Bad:

"Deploy with confidence."
"Seamlessly manage your containers."
"Your infrastructure, simplified."
"Supercharge your workflow."
"Oops! Something went wrong."
"Ready to get started?"

No em dashes anywhere in user-facing copy or project documentation.

## 13. Technical architecture

### Client

TypeScript
React
Vite
TanStack Query for authoritative remote state
Zod or another small runtime validator
Plain CSS or CSS Modules using design tokens

Do not use Tailwind or a component-library theme for this exercise unless an existing codebase already requires it.

### Application API

Hono with a small shared application layer.

The same domain handlers should be reusable by:

* Cloudflare Pages Functions;
* a Node runtime used for the required Railway deployment.

Business logic must not live inside Cloudflare-specific entry files.

### Railway API client

One server-side module owns Railway GraphQL communication.

Responsibilities:

* select the correct authentication header;
* execute an allow-listed operation;
* parse GraphQL errors;
* expose trace information;
* validate responses where useful;
* implement safe retry behavior;
* redact sensitive information;
* support abort signals and timeouts.

React components never send arbitrary GraphQL to Railway.

### Persistence

No application database.

Railway is the source of truth for:

* projects;
* environments;
* services;
* deployments;
* logs.

Short-lived interface preferences may remain client-side if they contain no credentials or sensitive Railway data.

### Sessions

Use a versioned encrypted HttpOnly cookie.

Use Web Crypto compatible primitives so the same implementation can operate on Cloudflare and Node.

Properties:

* Secure in production;
* HttpOnly;
* SameSite=Strict where deployment topology permits;
* sensible expiration;
* authenticated encryption;
* no raw token in cookie plaintext.

The encryption secret comes from environment configuration.

## 14. GraphQL reliability

Reads may retry conservatively for appropriate temporary errors.

Mutations require more care.

If the client receives a successful HTTP response indicating that Railway processed the mutation request, do not blindly retry the mutation and risk creating duplicate resources.

Handle:

* network failure before a response;
* HTTP 429;
* `Retry-After`;
* temporary 5xx errors;
* GraphQL errors inside HTTP 200;
* authorization expiry;
* malformed/changed API responses;
* unknown statuses.

Use exponential backoff with jitter for safe read retry behavior.

No infinite polling.

Polling cadence can slow after long-running operations.

Cancel unnecessary work when the selected run changes or a component unmounts.

## 15. Client state

Server state belongs in TanStack Query.

Small ephemeral interface state stays local.

Do not create a large global state store simply because dashboards usually have one.

Model lifecycle state explicitly rather than deriving everything from button booleans.

## 16. Security

Mandatory:

* Railway credentials never enter the client bundle;
* no credential persistence in browser storage;
* secrets redacted from logging;
* origin validation on state-changing application API requests;
* secure response headers;
* Content Security Policy suitable for the application;
* no arbitrary GraphQL proxy;
* no user-controlled server-side URL fetching;
* input size limits;
* schema validation;
* destructive-action confirmation;
* no secrets in diagnostic bundles;
* `.env.example` contains names only, never values.

## 17. Accessibility

Target WCAG 2.2 AA behavior.

At minimum:

* complete keyboard navigation;
* strong visible focus state;
* semantic HTML;
* correctly associated form labels;
* error messages associated with fields;
* status is understandable without color;
* sufficient contrast;
* reduced-motion preference honored;
* dialogs/sheets correctly manage focus;
* logs remain readable with zoom;
* controls remain usable on touch devices.

## 18. Error model

Errors belong near the action or resource that produced them.

Avoid a generic toast as the only representation of consequential failures.

Error classes should include:

Authentication:
Credential rejected or expired.

Authorization:
Credential is valid but lacks required access.

Validation:
Bad image/service input.

Rate limit:
Railway asks the application to slow down.

Temporary Railway failure:
Retryable read or recoverable operation.

Mutation uncertainty:
The request outcome cannot safely be assumed. Refresh authoritative state before offering another mutation.

Deployment failure:
Railway successfully accepted the deployment, but the workload failed during its lifecycle.

Application failure:
Unexpected client/server defect.

Each type should produce an actionable and technically accurate message.

## 19. No fake progress

Never use timers to make deployment phases appear animated.

Never advance a lifecycle step unless Railway state or a confirmed local request event justifies it.

A slow operation is allowed to look slow.

That honesty is part of the product.

## 20. Testing

### Unit tests

Test:

* lifecycle status mapping;
* unknown statuses;
* action eligibility;
* GraphQL response/error normalization;
* retry decisions;
* rate-limit handling;
* secret redaction;
* encrypted session round trip;
* deployment diagnostic serialization;
* input validation.

### Integration tests

Mock the Railway transport boundary and test:

* connect;
* project/environment resolution;
* successful launch;
* queued deployment;
* failed deployment;
* stop;
* restart;
* cleanup;
* expired credentials;
* 429;
* 5xx;
* GraphQL 200 with errors;
* mutation uncertainty.

### Browser tests

Use Playwright.

Cover the complete core journey.

Also cover keyboard behavior and representative responsive layouts.

Use mocked Railway API responses for deterministic CI tests.

A separate live smoke test may run when a test Railway credential and project are available.

Production code must never fall back to mock data.

## 21. Responsive QA

Visually inspect at minimum:

* small phone;
* larger phone;
* tablet/narrow laptop;
* standard desktop;
* wide desktop.

Do not merely confirm that no CSS media query failed.

Ask at every breakpoint:

* what is most important here?
* what should disappear?
* what deserves its own view?
* can logs actually be read?
* are destructive controls too prominent?
* does any desktop information architecture become awkward on touch?

There must be no accidental horizontal page overflow.

## 22. Performance

Keep the dependency graph intentionally small.

Lazy-load secondary technical detail where useful.

Do not load an icon library for a handful of icons.

Avoid refetch storms.

Bound log rendering if a deployment emits large amounts of output.

The interface should remain usable with thousands of log lines.

## 23. Observability

Server logs are structured.

Include:

* request identifier;
* route;
* Railway operation name where appropriate;
* duration;
* outcome class.

Exclude:

* credential;
* cookies;
* authorization headers;
* environment variable values.

Expose a basic health endpoint.

## 24. Email

Do not implement transactional email.

There is no core user job that requires email in this exercise. Adding Resend, Postmark or another provider introduces credentials, persistence and product surface without improving the required lifecycle experience.

Record this as a deliberate scope decision.

## 25. Deployment strategy

### Primary submission

Deploy the completed application on Railway because the hiring instructions explicitly require it.

The repository must contain the production Node entry point and configuration required to do this.

### Secondary mirror

Deploy the same application on Cloudflare Pages.

Use Pages Functions for the backend adapter.

Wrangler configuration must support local testing.

Do not depend on D1, KV, Queues, R2 or Durable Objects for the core flow.

This keeps the same repository portable across both deployment targets.

## 26. Required repository documentation

Create:

`README.md`
Concise setup, screenshots, architecture summary, commands, deployment instructions and interview walkthrough.

`docs/PRD.md`
This product specification adapted to the implemented result.

`docs/ERD.md`
Engineering Requirement Document, using Railway's terminology. This is not an entity-relationship diagram.

`docs/ARCHITECTURE.md`
Boundaries, runtime topology, session design and data flow.

`docs/API_CONTRACT.md`
Verified Railway GraphQL operations, required inputs, important output fields, status mapping and retry rules.

`docs/DECISIONS.md`
Short decision records covering major choices such as no database, token handling, stop versus delete semantics, polling versus streaming, and dual deployment.

`docs/SECURITY.md`
Threats, protections and remaining limitations.

`docs/CHECKLIST.md`
Execution checklist described below.

Do not generate enormous documentation to create the appearance of seniority. Every file must contain information worth discussing.

## 27. Checklist discipline

Before implementation, populate `docs/CHECKLIST.md` with concrete tasks written as:

`[ ]`

Only change a task to:

`[✓]`

after verifying it.

Where possible, include evidence:

`[✓] Lifecycle reducer tests (18 passing)`
`[✓] Mobile overflow review (390px viewport checked)`
`[✓] Production build (pnpm build)`
`[✓] Credential absent from localStorage/sessionStorage`
`[✓] Railway deployment smoke test`

A checkbox is not evidence by itself.

Never mark a blocked live-credential task complete without actually performing it.

## 28. Definition of done

The project is complete when:

* a fresh reviewer can install and run it from the README;
* the reviewer can securely connect Railway;
* valid context can be selected;
* a real public container image can be launched;
* actual lifecycle state is visible;
* real logs can be inspected;
* deployment failures are understandable;
* the workload can be stopped;
* a valid restart flow works where supported;
* created resources can be cleaned up;
* connection credentials can be removed;
* no production path depends on fake data;
* no secret reaches browser storage;
* GraphQL operations match the current Railway schema;
* core tests pass;
* browser tests pass;
* mobile and desktop have been visually reviewed;
* accessibility has been inspected;
* the Railway deployment works;
* the Cloudflare Pages mirror works if configured;
* documentation matches reality;
* every completed checklist item has evidence;
* there are no TODOs in the core experience;
* there are no user-visible em dashes;
* the interface contains none of the prohibited AI-dashboard patterns.

## 29. Interview walkthrough

The implementation should naturally support a 30-minute code discussion.

Suggested walkthrough:

1. Start with the product ambiguity around "spin down."
2. Demonstrate the complete real lifecycle.
3. Show how deployment state drives UI behavior.
4. Show the Railway GraphQL boundary and mutation retry policy.
5. Show credential handling.
6. Trigger or demonstrate an error scenario.
7. Show the responsive mobile interpretation.
8. Explain why no database was introduced.
9. Show the diagnostic bundle and redaction.
10. Discuss how subscriptions, OAuth, private registries or multi-service orchestration could be added without pretending they were required for v1.

The reviewer should come away understanding the decisions, not merely seeing many files.