# Engineering Requirement Document

## Problem and user

The Railway exercise asks for a UI that spins a container up and down through the GraphQL API. The user is a developer who needs to understand an asynchronous deployment and control its workload without losing the service configuration by accident.

## Goals

- Create a service from a public Docker image and observe a real deployment.
- Expose Railway status and bounded logs, including failures.
- Stop, restart and delete through distinct, scoped actions.
- Protect a user-provided Railway token and keep the implementation portable between Node and Cloudflare Pages.

No accounts, database, private registry setup, email, analytics or multi-service orchestration are planned.

## Requirements and boundaries

The React client calls only fixed BFF routes. The shared Hono app validates input, session, origin, CSRF token and resource scope before invoking the Railway client. The Railway client owns fixed GraphQL documents, authentication headers, response checks, timeouts, retry policy and error classification. Node serves the built frontend; Pages Functions mount the same API app.

The `DeploymentStatus` mapping is a pure function. It determines label, explanation, tone, polling and action eligibility. Unrecognized values are not success. `serviceCreate` returns a service, after which the client queries the selected environment's deployments. Railway remains authoritative for the deployment result.

Reads retry temporary failures with bounded backoff. Mutations do not automatically retry after an ambiguous outcome. A 200 response with GraphQL errors is treated as failure. Railway trace IDs may be carried to safe error reports. No raw upstream error or token reaches the browser.

The credential is encrypted with AES-GCM inside a four-hour HttpOnly session cookie. A separate same-site CSRF cookie and header protect writes, with Origin validation. Inputs are allow-listed; request bodies are capped at 8 KB. The server emits structured route and operation summaries without arguments or credentials.

## Quality and rollout

Automated checks cover pure state and security logic, server route flow, and a browser journey with deterministic Railway responses. Mobile and desktop screenshots are reviewed. Railway is the required primary deployment. Cloudflare Pages is a portability mirror. A live Railway smoke test must create and clean up a real public-image service before the exercise is submitted; this remains pending until account access is available.

Success means the reviewer can reproduce the flow, inspect the code path from UI to Railway, and distinguish observed state from local request state. See [CHECKLIST.md](CHECKLIST.md) for current verification evidence.
