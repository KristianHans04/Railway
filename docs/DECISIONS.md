# Decisions

## Stop and delete are separate

Railway's `deploymentStop` stops execution and preserves the service. `serviceDelete` removes the service and deployment history. The destructive control is separated and requires the exact service name.

## No database

Railway owns the relevant resource state. A second store would create synchronization and cleanup work without helping the required flow. Observed UI events are held only in memory.

## Credential in an encrypted server session

The token enters the server once and is encrypted into a short-lived HttpOnly cookie. The browser does not persist it. A project token is the default because its scope is one project environment.

## Poll logs rather than proxy WebSockets

Railway documents CLI WebSocket streaming, but a credential-bearing WebSocket proxy across both Node and Pages would add connection lifecycle and session complexity. Bounded GraphQL log reads with manual refresh and conservative polling fit this exercise. The client uses `startDate` for runtime follow-up reads and caps rendered history.

## Two adapters, one BFF

Railway deployment is required for submission. Pages is a portability check. Both call the same Hono application and Railway client, keeping runtime-specific code at the edges.

## No email

There is no email job in the container lifecycle. An email provider would add credentials and product surface without improving the exercise.
