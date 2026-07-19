# ==========================================
# STAGE 1: Build & Install Dependencies
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies (including devDependencies if needed for build steps)
RUN npm ci

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

# Install curl for health checking purposes
RUN apk add --no-cache curl

WORKDIR /usr/src/app

# Set Node environment to production
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules and code from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Use non-privileged node user for security
USER node

EXPOSE 5000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/live || exit 1

CMD ["node", "src/index.js"]
