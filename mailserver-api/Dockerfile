FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- api-deps: install API deps (native build for better-sqlite3, argon2) ---
FROM base AS api-deps
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN apk del .build-deps

# --- ui-build: build the React/Vite SPA ---
FROM base AS ui-build
# `@contracts` alias resolves to ../src/contracts (outside ui/), which in turn
# re-exports pure types from ../src/domain/sync/types. Provide the whole src tree
# so both `tsc -b` and the vite bundle resolve it (tsc only follows real imports,
# so no runtime deps are pulled in).
COPY src /app/src
WORKDIR /app/ui
COPY ui/package.json ./
RUN pnpm install
COPY ui/ ./
RUN pnpm build

# --- api-build: compile TS to dist/, prune dev deps ---
FROM base AS api-build
COPY --from=api-deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY drizzle/ ./drizzle/
RUN pnpm build:api
RUN pnpm prune --prod

# --- runtime: small image with only production artefacts ---
FROM node:24-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/dist ./dist
COPY --from=api-build /app/drizzle ./drizzle
COPY --from=api-build /app/package.json ./
COPY --from=ui-build /app/ui/dist ./ui/dist

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3050

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --output-document=- http://127.0.0.1:3050/health > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
