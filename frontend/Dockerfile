FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts tailwind.config.js postcss.config.js ./
COPY index.html ./
COPY public/ public/
COPY src/ src/

ARG VITE_PAYMOB_PUBLIC_KEY
ENV VITE_PAYMOB_PUBLIC_KEY=$VITE_PAYMOB_PUBLIC_KEY

RUN npm run build

FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl && addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY api-proxy.conf /etc/nginx/api-proxy.conf

RUN chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /tmp
USER appuser

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
