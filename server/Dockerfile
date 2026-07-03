ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS builder

WORKDIR /app
ENV DATABASE_URL=mysql://root:password@localhost:3306/life_assistant

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

RUN npm run prisma:generate && npm run build

FROM ${NODE_IMAGE} AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3100

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
