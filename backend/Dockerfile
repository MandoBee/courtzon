FROM node:22-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY backend/tsconfig.json ./
COPY backend/src/ src/
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache tini netcat-openbsd

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist/ dist/
COPY backend/scripts/ scripts/
COPY database/ database/
RUN test -f database/baseline/001_courtzon_v3.sql || test -f database/migrations/.gitkeep || echo "No baseline or migrations found"

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{const j=JSON.parse(d);process.exit(j.status==='ok'?0:1)}catch{process.exit(1)}})}).on('error',()=>process.exit(1))"

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
