FROM node:22-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY backend/tsconfig.json ./
COPY backend/src/ src/
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache tini su-exec netcat-openbsd mysql-client

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist/ dist/
COPY backend/scripts/ scripts/
COPY database/ database/
RUN test -f database/baseline/001_courtzon_v3.sql || test -f database/migrations/.gitkeep || echo "No baseline or migrations found"

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN date -u +"%Y-%m-%dT%H:%M:%SZ" > /app/build-time.txt
RUN chown -R appuser:appgroup /app

# Entrypoint runs as root, fixes bind-mounted uploads permissions at startup,
# then drops privileges to appuser via su-exec.
# USER is deliberately NOT set here — the entrypoint handles the switch.

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d);process.exit(j.status==='ok'?0:1)}catch{process.exit(1)}})}).on('error',()=>process.exit(1))"

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
