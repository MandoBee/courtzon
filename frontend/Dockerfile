FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
COPY packages/shared/ /packages/shared/
RUN npm ci --ignore-scripts

COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json ./
COPY frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js ./
COPY frontend/index.html ./
COPY frontend/public/ public/
COPY frontend/src/ src/
COPY frontend/scripts/ scripts/

ARG VITE_PAYMOB_PUBLIC_KEY
ENV VITE_PAYMOB_PUBLIC_KEY=$VITE_PAYMOB_PUBLIC_KEY

ARG VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED
ENV VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED=$VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED

RUN npm run build

FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl && addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist/ /usr/share/nginx/html/
    COPY frontend/nginx.conf /etc/nginx/nginx.conf
    COPY frontend/security-headers.conf /etc/nginx/security-headers.conf
    COPY frontend/api-proxy.conf /etc/nginx/api-proxy.conf

RUN chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /tmp
USER appuser

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
