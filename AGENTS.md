# AGENTS.md — Xilo

**Xilo** is the Pilotariak Slack bot, built as a Cloudflare Worker.
It exposes slash commands and a natural-language AI agent that queries Frontis (GraphQL gateway).

## Architecture

```
xilo/
└── src/
    ├── index.ts        # Worker entry — routes Slack events and slash commands
    ├── types.ts        # Shared TypeScript types and Env bindings
    ├── logger.ts       # Pino-based structured logger
    ├── slack/          # Slack signature verification, response helpers
    ├── handlers/       # One handler per slash command (/categories, /clubs, …)
    ├── frontis/        # GraphQL client for Frontis
    └── agent/          # AI agent (Workers AI + tool-calling over Frontis)
```

## Cloudflare Bindings

Declared in `wrangler.jsonc`:

| Binding       | Type                        | Purpose                                                       |
| ------------- | --------------------------- | ------------------------------------------------------------- |
| `AI`          | Workers AI                  | LLM inference for the `/ask` command and natural-language bot |
| `AGENT_QUEUE` | Queue (producer + consumer) | Async agent processing (dequeues up to 5 concurrent)          |

## Dev Setup

Requirements: [Bun](https://bun.sh) ≥ 1.1, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) ≥ 4

```bash
npm install          # install dependencies (xilo uses npm, not bun)
```

Create `.dev.vars` (git-ignored) for local secrets:

```
SLACK_SIGNING_SECRET=<from Slack app settings>
SLACK_BOT_TOKEN=xoxb-<from Slack app settings>
```

## Running Locally

```bash
make dev             # bunx wrangler dev
```

Wrangler starts the worker at `http://localhost:8787`. To test Slack events locally, use
[ngrok](https://ngrok.com/) or [cloudflared tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## Testing

```bash
make test            # vitest with @cloudflare/vitest-pool-workers
```

Tests run inside a real Workers runtime via the Cloudflare Vitest pool. Do not mock the `AI` binding
unless testing error paths — use `miniflare`'s built-in AI stub.

## Environments

| Env                     | Worker name    | Notes                              |
| ----------------------- | -------------- | ---------------------------------- |
| `development` (default) | `xilo` (local) | `wrangler dev`, verbose logging    |
| `staging`               | `xilo-staging` | `wrangler deploy --env staging`    |
| `production`            | `xilo`         | `wrangler deploy --env production` |

Key vars (set per env in `wrangler.jsonc`):

- `FRONTIS_URL` — GraphQL endpoint (default: `https://frontis-gateway.pilotariak.com/graphql`)
- `AGENT_PROVIDER` — `workers-ai` (only supported value currently)
- `DEFAULT_LEAGUE` — fallback when no league code detected in message

## Production Secrets

```bash
bunx wrangler secret put SLACK_SIGNING_SECRET
bunx wrangler secret put SLACK_BOT_TOKEN
```

## Deployment

```bash
make deploy          # bunx wrangler deploy (production)
make logs            # tail live worker logs
```

## Key Conventions

- All Slack requests are **verified** using `SLACK_SIGNING_SECRET` before processing
- Agent responses are dispatched through the **Queue** to avoid the 3-second Slack ack timeout
- GraphQL queries live in `src/frontis/` — keep them colocated with their types
- League codes (`lcapb`, `lidfpb`, `ccapb`, `ctpb`) are detected from message text by the agent
- Formatting: `dprint` (config in `dprint.json`)
- License headers required (checked by `licenserc.toml`)

## Adding a Slash Command

1. Add handler in `src/handlers/<command>.ts`
2. Register the route in `src/index.ts`
3. Add the command in the Slack app manifest
