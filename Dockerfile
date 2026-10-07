# ---- build: compile the PWA and bundle the server ----------------------------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: production dependencies and build output only ------------------
# Debian (glibc) rather than Alpine so the bufferutil prebuild loads; it speeds up
# WebSocket unmasking on the upload path at multi-gigabit rates.
FROM node:24-slim
LABEL org.opencontainers.image.title="Uplink" \
      org.opencontainers.image.description="Self-hosted LAN speed test with history (PWA)"
ENV NODE_ENV=production \
    PORT=5090
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
EXPOSE 5090
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||5090)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server/index.js"]
