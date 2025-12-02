# Multi-stage Docker build for Pocketable backend
FROM node:20-alpine

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

# Copy package files
COPY package*.json ./

# Install all dependencies (tsx is needed to run TypeScript)
RUN npm ci

# Copy application code (TypeScript files)
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start application with tsx (runs TypeScript directly)
CMD ["npx", "tsx", "src/server.ts"]
