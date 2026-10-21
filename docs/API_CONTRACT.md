# Railway GraphQL contract

Checked against Railway's official API documentation and authenticated `railway api describe` output on 2026-09-18. A live mutation is still required to verify runtime behavior.

## Connection and limits

- Endpoint: `https://backboard.railway.com/graphql/v2`.
- Project token: `Project-Access-Token: <token>`, scoped to one environment. Harmless validation query: `projectToken { projectId environmentId }`.
- Account/workspace token: `Authorization: Bearer <token>`. `projects { edges { node { id name } } }` is used for validation and discovery. Railway notes `me` does not work for workspace tokens.
- Current published limits: Free 100 requests/hour; Hobby 1,000/hour and 10/second; Pro 10,000/hour and 50/second. Inspect `Retry-After` after 429. Polling is deliberately slower than one request per second.
- GraphQL errors may arrive with HTTP 200. `extensions.code` and `extensions.traceId` are safe to expose after validation. A 200 mutation response with errors is never retried.

Source: [Railway Public API](https://docs.railway.com/integrations/api).

## Operations used

| Domain purpose | Official GraphQL operation | Inputs and fields used |
| --- | --- | --- |
| Resolve project token | `projectToken` | `projectId`, `environmentId` |
| Discover projects | `projects` | `edges.node.id`, `name` |
| Get context | `project` | `id`, `name`, `environments.edges.node.id`, `name`, `services.edges.node.id`, `name` |
| Create service from public image | `serviceCreate` | `ServiceCreateInput` with `projectId`, `environmentId`, `name`, `source.image`; returns `id`, `name` |
| Deploy existing service in selected environment | `serviceInstanceDeployV2` | `serviceId`, `environmentId`; returns deployment ID |
| Find latest deployment | `deployments` | `DeploymentListInput` with project, environment and service IDs, `first`; returns `id`, `status`, `createdAt` |
| Get deployment | `deployment` | `id`; returns `id`, `status`, `createdAt`, `meta` |
| Read logs | `buildLogs`, `deploymentLogs` | `deploymentId`, bounded `limit`, optional `startDate`; returns `timestamp`, `message`, `severity` |
| Stop workload | `deploymentStop` | deployment `id`; returns Boolean |
| Restart process | `deploymentRestart` | deployment `id`; returns Boolean, no rebuild |
| Delete service | `serviceDelete` | service `id`; returns Boolean. Omitting optional `environmentId` deletes across all non-fork environments. |

Sources: [manage projects](https://docs.railway.com/integrations/api/manage-projects), [manage services](https://docs.railway.com/integrations/api/manage-services), [manage deployments](https://docs.railway.com/integrations/api/manage-deployments).

Railway's deployment reference says creating a service with a source starts a deployment; Docker images skip build. The implementation observes the deployment list after `serviceCreate` and never declares launch successful before a deployment appears. If no deployment appears in the selected environment, the user can explicitly invoke `serviceInstanceDeployV2` after checking state. This avoids an automatic duplicate deployment. Live schema introspection confirms `ServiceCreateInput.environmentId` selects a fork only; for a regular environment, Railway creates the service in every non-fork environment. Initial creation behavior still needs a live project-token check. Source: [deployment reference](https://docs.railway.com/deployments/reference).

Live schema introspection returned `BUILDING`, `CRASHED`, `DEPLOYING`, `FAILED`, `INITIALIZING`, `NEEDS_APPROVAL`, `QUEUED`, `REMOVED`, `REMOVING`, `SKIPPED`, `SLEEPING`, `SUCCESS`, `WAITING`. The UI handles those and unknown values without treating them as success.

The official deployment guide provides `buildLogs` and `deploymentLogs`; CLI documentation confirms a WebSocket streaming mode. The BFF uses bounded polling because a cross-runtime WebSocket proxy would add session and connection failure modes. It asks for a bounded recent window and deduplicates by timestamp and message. The first fetch is capped; follow-up fetches use `startDate` where supported.

Public Docker images are in the official create-service example. Private registries require additional configuration and are outside this version. Railway's retry guidance permits safe reads to retry with backoff and `Retry-After`; mutation responses are never blindly retried. A live Cloudflare Pages call with an intentionally invalid project token reached Railway and returned an authentication error on 2026-09-19. Valid-token lifecycle behavior remains unverified because the Railway workspace trial has expired.
