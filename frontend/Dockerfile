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

COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
