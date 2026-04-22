FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm pkg delete devDependencies.@rollup/rollup-darwin-arm64 \
  && npm pkg delete devDependencies.@tailwindcss/oxide-darwin-arm64 \
  && npm pkg delete devDependencies.lightningcss-darwin-arm64 \
  && npm install --ignore-scripts

COPY web/package*.json ./web/
RUN npm --prefix web ci --ignore-scripts

COPY server ./server
COPY shared ./shared
COPY web ./web
COPY nest-cli.json ./
COPY tsconfig*.json ./

RUN npm run build:server

# Web build-time API target, routed to local Nest in same container.
ENV API_ORIGIN=http://127.0.0.1:3000
RUN npm --prefix web run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache nginx

COPY package*.json ./
COPY web/package*.json ./web/

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/node_modules ./web/node_modules

COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/next.config.ts ./web/next.config.ts

COPY docker/nginx.conf /etc/nginx/http.d/default.conf

EXPOSE 80

CMD ["sh", "-c", "if [ -f /app/.env ]; then set -a; sed 's/\\r$//' /app/.env > /tmp/runtime.env; . /tmp/runtime.env; set +a; fi; export NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=${SERVER_PORT:-3000} HOSTNAME=0.0.0.0 PORT=3001 API_ORIGIN=http://127.0.0.1:3000; node /app/dist/server/main.js & npm --prefix /app/web run start -- -p 3001 -H 0.0.0.0 & exec nginx -g 'daemon off;'"]
