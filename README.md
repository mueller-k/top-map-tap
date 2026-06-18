# Top Map Tap

An unofficial, password-protected companion for sharing daily [MapTap](https://maptap.gg) results with a small group.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

The checked-in Turnstile site key and `.dev.vars.example` secret are Cloudflare public test keys. They must be replaced for production.

## Verification

```sh
pnpm test
pnpm lint
pnpm build
```

## Production setup

1. Create the D1 database:

   ```sh
   wrangler d1 create top-map-tap
   ```

2. Replace the placeholder `database_id` in `wrangler.jsonc`.
3. Create a managed Turnstile widget for the production `workers.dev` hostname.
4. Replace `TURNSTILE_SITE_KEY` in `wrangler.jsonc`.
5. Store the Turnstile secret securely:

   ```sh
   wrangler secret put TURNSTILE_SECRET_KEY
   ```

6. Apply migrations and deploy:

   ```sh
   pnpm db:migrate:remote
   pnpm deploy
   ```

Dashboard settings are intentionally immutable in v1. There are no accounts, deletion tools, or administrative bypass.

See [CONTEXT.md](./CONTEXT.md) for the project language and [docs/adr](./docs/adr) for architectural decisions.
