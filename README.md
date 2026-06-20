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

## Verification

```sh
pnpm test
pnpm lint
pnpm build
```

## High-Level Architecture

Top Map Tap is a simple React application built on Cloudflare. Backed by Cloudflare [Workers](https://www.cloudflare.com/products/workers/), with [D1](https://www.cloudflare.com/products/d1/) storage, and [Turnstile](https://www.cloudflare.com/products/turnstile/) abuse protection.

See [CONTEXT.md](./CONTEXT.md) for the project language and [docs/adr](./docs/adr) for architectural decisions.
