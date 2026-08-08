# Top Map Tap

Free, unofficial leaderboards for [MapTap](https://maptap.gg).

Easily create password-protected leaderboards to share with your friends, and finally find out who the top map tapper is in your crew.

Visit [Top Map Tap](https://topmaptap.com) today!

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Set `GOOGLE_MAPS_API_KEY` in `.dev.vars` to a server-side key restricted to
Google Geocoding API v4. The placeholder is sufficient for development that
does not exercise location enrichment.

## Location archive

The production Worker runs the location collector every day at 12:15 UTC. It
collects the five MapTap locations only after the date has ended everywhere,
stores each complete date atomically in D1, and enriches pending locations with
Google Geocoding API v4. The archive starts on January 1, 2026.

Apply the migration before deploying the Worker, then add the production
secret separately:

```sh
pnpm db:migrate:remote
pnpm exec wrangler secret put GOOGLE_MAPS_API_KEY
```

The controlled backfill defaults to local D1 and exits nonzero when any
eligible base date remains uncovered. Pending Google enrichment is reported
but does not make the backfill fail:

```sh
pnpm location-archive:backfill
```

After checking the local result, production backfill requires the explicit
`--remote` flag. It writes to the production D1 database and reads the Google
key from the local `.dev.vars` file used by the temporary preview Worker:

```sh
pnpm location-archive:backfill --remote
```

The backfill Worker exists only for the lifetime of this command; no public
admin or raw Round Location endpoint is deployed.

## Verification

```sh
pnpm test
pnpm lint
pnpm build
```

## High-Level Architecture

Top Map Tap is a simple React application built on Cloudflare. Backed by Cloudflare [Workers](https://www.cloudflare.com/products/workers/), with [D1](https://www.cloudflare.com/products/d1/) storage, and [Turnstile](https://www.cloudflare.com/products/turnstile/) abuse protection.

See [CONTEXT.md](./CONTEXT.md) for the project language and [docs/adr](./docs/adr) for architectural decisions.
