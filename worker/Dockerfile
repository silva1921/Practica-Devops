# ==========================================
# STAGE 1: Build & Install Dependencies
# ==========================================
FROM node:26-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:26-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV HEALTHCHECK_PORT=5001

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

USER node

# Healthcheck port exposed internally
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5001/live || exit 1

CMD ["node", "src/index.js"]
