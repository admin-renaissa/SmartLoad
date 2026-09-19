# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json* ./packages/ui/
COPY packages/auth-sdk/package.json ./packages/auth-sdk/
COPY packages/connect-sdk/package.json ./packages/connect-sdk/
COPY packages/ai-sdk/package.json ./packages/ai-sdk/
COPY packages/suite-oidc-adapter/package.json ./packages/suite-oidc-adapter/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/auth-sdk ./packages/auth-sdk
COPY packages/connect-sdk ./packages/connect-sdk
COPY packages/ai-sdk ./packages/ai-sdk
COPY packages/suite-oidc-adapter ./packages/suite-oidc-adapter
COPY apps/api ./apps/api

# Generate Prisma client
RUN pnpm --filter @smartload/db run generate

# Build
RUN pnpm --filter @smartload/api run build

# ─── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built files and deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]
