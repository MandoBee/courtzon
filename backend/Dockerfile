FROM node:22-alpine AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY backend/tsconfig.json ./
COPY backend/src/ src/
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache tini netcat-openbsd mysql-client gzip

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist/ dist/
COPY backend/scripts/ scripts/
COPY database/ database/
# Env: injected at runtime via compose `env_file` (never bake secrets into the image).

ENV NODE_ENV=production
EXPOSE 3000

COPY backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
