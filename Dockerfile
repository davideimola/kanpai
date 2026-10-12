# The image a copy of kanpai runs from, published to GHCR by CI (ADR-0008).
#
# Three things it has to be, and each one is a decision rather than boilerplate:
#
#   1. **It must build with no database.** `pnpm build` already works with `DATABASE_URL`
#      unset, because every page that reads the owner's record is `force-dynamic` and reads
#      it per request — so nothing here passes a connection string as a build argument, and
#      nothing should. A build that needed a database would need one in CI, in a registry
#      job and on a laptop, and the first thing anybody would reach for is a copy of the
#      owner's own.
#   2. **It must not run as root.** The image ships with `USER node`, and a runtime that
#      can refuse a root container should say so again where it is deployed. Twice on
#      purpose: the image is what makes it true anywhere it is run, and the deployment is
#      what refuses to start it if it ever stops being true.
#   3. **It must carry the migrations.** Whatever runs this image runs them from this same
#      image before the app is allowed to serve — compose's `migrate` service, or an init
#      container — so what is applied is exactly what was built. `db/` is therefore copied
#      into the runtime stage on purpose, next to the traced server rather than into it — and
#      `src/core` beside it, for the token command in `db/token.ts`.
#
# `output: "standalone"` in `next.config.ts` is the other half of this file: it traces what
# the server actually imports and writes a self-contained server, so the last stage is node
# plus that directory instead of node plus every dependency in the lockfile.

# The version mise pins for development, so what is built here is what was tested there.
FROM node:22-alpine AS base
# Corepack reads `packageManager` from package.json, so the pnpm version is the lockfile's
# and not whatever the image happens to ship.
RUN corepack enable
WORKDIR /build


# ── Dependencies ──────────────────────────────────────────────────────────────
# Its own stage so that the layer survives every change that is not a lockfile change,
# which is nearly all of them.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /build/node_modules ./node_modules
COPY . .
# No `DATABASE_URL` and no `AUTH_*`. See decision 1 above.
#
# `NEXT_TELEMETRY_DISABLED` because a build phoning home is a build that can fail for a
# reason that has nothing to do with the code.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# The migration runner is not part of what `standalone` traces. `db/cli.ts migrate` is run
# by node directly — that is the whole point of decision 3 — so it resolves its imports from
# `node_modules` at runtime rather than from the traced bundle. It needs `pg`, which the
# server imports too and which is therefore traced, and `drizzle-orm`, which is not: Next
# bundles Drizzle's code into the server's own chunks and leaves no package behind for
# anything else to import.
#
# So the one package is staged here explicitly. `cp -RL` because pnpm's `node_modules` entry
# is a symlink into `.pnpm/`, and the runtime stage has no store to point at. It is
# self-contained: `drizzle-orm` declares no runtime dependencies of its own.
RUN mkdir -p /build/runtime-node-modules \
 && cp -RL node_modules/drizzle-orm /build/runtime-node-modules/drizzle-orm


# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The traced server, its dependencies and the trimmed manifest, all of which `standalone`
# writes. `.next/static` is the one thing it deliberately does not trace — it is served,
# not imported — so it is copied.
COPY --from=build --chown=node:node /build/.next/standalone ./
COPY --from=build --chown=node:node /build/.next/static ./.next/static

# `public/` is not traced either, and it holds one thing: the barcode decoder the scanner falls
# back to in Safari, which has no `BarcodeDetector` of its own (`src/components/scan.tsx`). Left
# out, the scanner works in Chrome and is silently broken on an iPhone.
COPY --from=build --chown=node:node /build/public ./public

# The schema, and the runner that applies it. Plain `.ts` run through node's own type
# stripping, which is how `pnpm db:migrate` runs it on a laptop too — one runner, one
# convention, and no build step of its own to drift.
#
# `db/migrations/` comes with it, `meta/` included: Drizzle's migrator reads the journal
# there to decide what this database still needs.
COPY --from=build --chown=node:node /build/db ./db

# The core, as source, for the one command that runs it outside the server: `db/token.ts`,
# which issues the first access token of a copy that has no web view to issue one from yet
# (ADR-0009). It calls the same verbs `/settings` will, through node's type stripping like the
# migration runner, so it needs the `.ts` files and not the server's bundled chunks. Tests come
# along and are never run; excluding them would be a second list to keep.
COPY --from=build --chown=node:node /build/src/core ./src/core

# What the runner imports and the traced server does not leave behind. See the build stage.
COPY --from=build --chown=node:node /build/runtime-node-modules/drizzle-orm ./node_modules/drizzle-orm

# Next writes here when it caches a fetch, and a `node` that cannot create it fails at the
# first request rather than at start.
RUN mkdir -p .next/cache && chown -R node:node .next

# Decision 2. `node` is uid 1000 in this base image, which matters: Kubernetes'
# `runAsNonRoot` cannot tell whether a *name* is root, so a deployment states the number
# as well (`runAsUser: 1000`) and the two have to agree.
USER node

EXPOSE 3000

# `server.js`, not `next start`: standalone's whole point is that the CLI is not shipped.
CMD ["node", "server.js"]
