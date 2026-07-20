# ==========================================
# STAGE 1: Build static assets
# ==========================================
FROM node:26-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ==========================================
# STAGE 2: Serve with Non-Root Nginx
# ==========================================
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Copy built assets
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose non-privileged HTTP port
EXPOSE 8080

# Healthcheck to verify index page accessibility
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
