# Lookglass frontend

This repository is the Vite-built static public dashboard and authenticated
admin UI for Lookglass. Cloudflare Pages serves the generated `dist/`
directory. It is a Pages Functions-free deployment: the public dashboard
loads the status snapshot directly from R2, while only the admin UI calls the
Worker API.

## Configuration

The public dashboard reads `public/status.json` directly from the R2 public
domain configured by `VITE_STATUS_URL`. The admin UI uses the deployed Worker
origin configured by `VITE_API_BASE_URL`. Set both values in the shell or CI
environment before building; do not commit a `.env` file or a secret.

The following are non-production examples and must be replaced with the
deployed origins:

```bash
export VITE_STATUS_URL="https://status.example.com/public/status.json"
export VITE_API_BASE_URL="https://worker.example.com"
```

For GitHub Actions, set repository Variables named `VITE_STATUS_URL` and
`VITE_API_BASE_URL` to the deployed values. The CI workflow passes those
non-secret public URLs into the Vite build and refuses a `main` deployment when
either variable is missing. Do not put either URL or any credential value in a
committed file.

`VITE_STATUS_URL` must point to the R2 object at `public/status.json`, and
`VITE_API_BASE_URL` must be the Worker origin without an API path. The Worker
origin must allow the deployed Pages origin, and the R2 bucket CORS rule must
allow the same Pages origin for the public GET request.

## Local validation

Run these commands from this directory:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The build output is static files only. It includes `public/_redirects` for
the SPA fallback and `public/_headers` for the Pages security headers.

## Public display modes

The public dashboard has an `LG` mode and a `NAV` mode switch in the upper
right. `LG` shows the monitoring status cards and half-hour status cells;
`NAV` shows only each monitor's Logo and name. A monitor is clickable in NAV
mode only when the Worker configuration supplies a `link_url`; monitors
without one remain non-clickable.

The admin panel form has an `仅 NAV 模式` switch. A panel with this switch
enabled keeps its configured navigation monitors in the public snapshot, but
the Worker does not run their HTTP GET or TCPing checks. The panel uses NAV
cards even when the global display switch is set to LG.

The selected mode is stored in the browser under
`lookglass-display-mode` and restored on the next visit. Storage errors do not
prevent the current page from switching modes.

## Cloudflare Pages deployment

Authenticate Wrangler with the Cloudflare account that owns the Pages
project, set the two `VITE_*` values above to real deployed origins, and run:

```bash
npm run build
npx wrangler pages project create lookglass-frontend
npx wrangler pages deploy dist --project-name lookglass-frontend
```

The Pages project creation command is a one-time operation. Subsequent
deployments only need the build and deploy commands. The CI workflow runs the
same typecheck, tests, and build and deploys `dist/` only on a push to `main`.
It reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from CI secrets;
no credential value belongs in this repository.

## Public data path and CORS

The public dashboard does not proxy status data through the Worker. The
scheduled Worker writes `public/status.json` to R2, and the browser requests
that object from `VITE_STATUS_URL`. Before applying the Worker repository's
`r2-cors.json`, replace its Pages default example origin with the exact
deployed Pages origin. Keep the rule limited to that one origin and `GET`.
