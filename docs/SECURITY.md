# Security review

The application accepts a user-supplied Railway token. Its main risk is credential disclosure or a cross-site request that operates on Railway resources. The session is AES-GCM encrypted with a configured 256-bit secret, expires after four hours, and uses HttpOnly, SameSite=Strict and Secure in production. Logout expires the cookie. A random CSRF cookie and matching header plus exact Origin check protect writes. Railway GraphQL documents and endpoint are fixed on the server.

The BFF validates UUIDs, image and service name formats, request sizes and allowed fields. It checks project, environment, service and deployment relationship before actions. The delete control requires the exact current service name. Railway mutation requests are not blindly retried after an ambiguous response. The client treats unknown statuses as ineligible for actions.

CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` are sent by the BFF. The production Vite build emits no source maps. Server logs contain request ID, route, operation, duration and outcome, without arguments, cookies or tokens. Diagnostics omit known secret keys and redact obvious credential patterns. The browser writes only a theme preference to local storage.

Limitations: rate limiting is best effort per server process or Pages isolate, not distributed. Railway account tokens have broad access and should be used only when project discovery is needed. Live permission behavior for project and workspace tokens still needs verification with a valid token. A user who controls the browser can inspect their own Railway resource IDs, which are not secrets. The app has not undergone an external penetration test.
