# ==========================================
# STAGE 1: Build & Install Dependencies
# ==========================================
FROM node:25-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies (including devDependencies if needed for build steps)
RUN npm ci

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:25-alpine AS runner

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


# # ==========================================
# # STAGE 1: Build & Install Dependencies
# # ==========================================
# FROM node:26-alpine AS builder

# WORKDIR /usr/src/app

# # Copiar archivos de dependencias
# COPY package*.json ./

# # Instalar dependencias
# RUN npm ci

# # ==========================================
# # STAGE 2: Production Runtime
# # ==========================================
# FROM node:26-alpine AS runner

# # Instalar curl para el healthcheck
# RUN apk add --no-cache curl

# WORKDIR /usr/src/app

# # Variables de entorno
# ENV NODE_ENV=production
# ENV PORT=5000

# # Copiar dependencias y código asignando el propietario al usuario node
# COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
# COPY --chown=node:node package*.json ./
# COPY --chown=node:node src ./src

# # Ejecutar como usuario no privilegiado
# USER node

# # Puerto expuesto
# EXPOSE 5000

# # Healthcheck
# HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
#   CMD curl -f http://localhost:5000/live || exit 1

# # Comando de inicio
# CMD ["node", "src/index.js"]