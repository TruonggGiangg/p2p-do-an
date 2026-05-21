# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json ./

RUN npm install

# Copy source code
COPY . .

# Build NestJS
RUN npm run build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

RUN npm install --omit=dev && npm cache clean --force

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

USER nestjs

EXPOSE 3001

CMD ["node", "dist/main"]
