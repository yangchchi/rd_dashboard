# 基础阶段：仅引入node运行时，无变更
FROM 10.6.37.167:30005/library/node@sha256:894c91653e564b9ba29400e6e1675bbcbc667158c1706c655dd4ccf84d0f54e8 AS node_runtime

# 主运行阶段
FROM 10.6.37.167:30005/library/nginx:1.27-bookworm AS runtime
WORKDIR /app

# 构建参数（合并为一行）
ARG NEXT_PUBLIC_FEISHU_APP_ID
ARG FEISHU_APP_ID
ARG FEISHU_APP_SECRET

# 复制node运行时环境 + 配置环境变量（合并层）
COPY --from=node_runtime /usr/local /usr/local
ENV PATH="/usr/local/bin:${PATH}" \
    NEXT_PUBLIC_FEISHU_APP_ID="${NEXT_PUBLIC_FEISHU_APP_ID}" \
    FEISHU_APP_ID="${FEISHU_APP_ID}" \
    FEISHU_APP_SECRET="${FEISHU_APP_SECRET}"

# 复制后端/前端运行所需文件（保留目录结构，避免同名文件覆盖）
COPY package*.json ./
COPY web/package*.json ./web/
COPY node_modules ./node_modules
COPY web/node_modules ./web/node_modules
COPY dist ./dist
COPY web/.next ./web/.next
COPY web/public ./web/public
COPY web/next.config.ts ./web/next.config.ts

# 创建nginx目录 + 复制配置文件（合并为一层，替代原2层）
RUN mkdir -p /etc/nginx/conf.d /etc/nginx/http.d
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN [ -d /etc/nginx/http.d ] && cp /etc/nginx/conf.d/default.conf /etc/nginx/http.d/default.conf

# 暴露端口
EXPOSE 80

# 启动命令：兼容不同构建输出目录（dist/server/main.js 或 dist/main.js）
CMD ["sh", "-c", "if [ -f /app/.env ]; then set -a; sed 's/\\r$//' /app/.env > /tmp/runtime.env; . /tmp/runtime.env; set +a; fi; export NODE_ENV=production SERVER_HOST=0.0.0.0 SERVER_PORT=${SERVER_PORT:-3000} HOSTNAME=0.0.0.0 PORT=3001 API_ORIGIN=${API_ORIGIN:-http://127.0.0.1:3000}; if [ -f /app/dist/server/main.js ]; then node /app/dist/server/main.js; else node /app/dist/main.js; fi & npm --prefix /app/web run start -- -p 3001 -H 0.0.0.0 & exec nginx -g 'daemon off;'"]
