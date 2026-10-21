# Product requirements: Container Lifecycle Workbench

Lifecycle helps a Railway user launch a public container image, see the actual deployment state, read logs, stop or restart the workload, and delete the service when finished. It is a focused workbench, not a general infrastructure dashboard.

The central product decision is the meaning of spin down. **Stop deployment** stops active execution and keeps the service. **Delete service** removes the service and its deployment history. The interface labels these separately and requires the exact service name for deletion.

## User journey

1. Connect with a project token, or an account token for project selection. The BFF validates it and encrypts it into an HttpOnly cookie.
2. Confirm the project and environment. The project token resolves both directly.
3. Enter a public Docker image and optional service name. Railway's create operation creates the service. The workbench waits for Railway to report a deployment.
4. Inspect the current status, observed state changes, bounded build or runtime logs, and valid actions.
5. Stop a running deployment, restart a running or crashed process, or delete the service after typing its name.
6. Copy a redacted diagnostic bundle when needed, and disconnect to remove the session.

## Product rules

- Railway data is authoritative. A submitted mutation is never displayed as a completed state.
- Unknown deployment statuses disable actions and keep refresh available.
- A network loss during a mutation is reported as uncertain. Creation is blocked until the user refreshes the service list.
- Errors appear next to the affected action or resource.
- Logs are bounded to 1,000 rendered lines. The view follows output only while the user is near its end.
- Mobile gives the deployment and logs priority. Configuration opens as a focused screen.
- The interface has no aggregate metrics, email, user accounts, or marketing sections.

The remaining live API and deployment checks are tracked in [CHECKLIST.md](CHECKLIST.md).
