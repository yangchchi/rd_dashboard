#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
DIST_DIR="$ROOT_DIR/dist"

TOTAL_START=$(node -e "console.log(Date.now())")

print_time() {
  local start=$1
  local end=$(node -e "console.log(Date.now())")
  local elapsed=$((end - start))
  local seconds=$((elapsed / 1000))
  local ms=$((elapsed % 1000))
  echo "   ⏱️  耗时: ${seconds}.$(printf "%03d" $ms)s"
}

echo "📝 [1/4] 更新 openapi 代码"
STEP_START=$(node -e "console.log(Date.now())")
npm run gen:openapi
print_time $STEP_START
echo ""

echo "🗑️  [2/4] 清理 dist 目录"
STEP_START=$(node -e "console.log(Date.now())")
rm -rf "$ROOT_DIR/dist"
print_time $STEP_START
echo ""

echo "🔨 [3/4] 并行构建 server 与 Next.js (web)"
STEP_START=$(node -e "console.log(Date.now())")

echo "   ├─ 启动 server 构建..."
npm run build:server > /tmp/build-server.log 2>&1 &
SERVER_PID=$!

echo "   ├─ 启动 web 构建..."
npm run build:web > /tmp/build-web.log 2>&1 &
WEB_PID=$!

SERVER_EXIT=0
WEB_EXIT=0

wait $SERVER_PID || SERVER_EXIT=$?
wait $WEB_PID || WEB_EXIT=$?

if [ $SERVER_EXIT -ne 0 ]; then
  echo "   ❌ Server 构建失败"
  cat /tmp/build-server.log
  exit 1
fi

if [ $WEB_EXIT -ne 0 ]; then
  echo "   ❌ Web 构建失败"
  cat /tmp/build-web.log
  exit 1
fi

echo "   ✅ Server 构建完成"
echo "   ✅ Web 构建完成"
print_time $STEP_START
echo ""

echo "📦 [4/4] 准备产物"
STEP_START=$(node -e "console.log(Date.now())")

cp "$ROOT_DIR/scripts/run.sh" "$DIST_DIR/"

if [ -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env" "$DIST_DIR/"
fi

mkdir -p "$DIST_DIR/web"
if [ -d "$ROOT_DIR/web/.next" ]; then
  cp -R "$ROOT_DIR/web/.next" "$DIST_DIR/web/"
fi
if [ -d "$ROOT_DIR/web/public" ]; then
  cp -R "$ROOT_DIR/web/public" "$DIST_DIR/web/"
fi
cp "$ROOT_DIR/web/package.json" "$DIST_DIR/web/" 2>/dev/null || true
cp "$ROOT_DIR/web/package-lock.json" "$DIST_DIR/web/" 2>/dev/null || true

rm -rf "$DIST_DIR/scripts"
rm -rf "$DIST_DIR/tsconfig.node.tsbuildinfo"

print_time $STEP_START
echo ""

echo "✂️  智能依赖裁剪"
STEP_START=$(node -e "console.log(Date.now())")
node "$ROOT_DIR/scripts/prune-smart.js"
print_time $STEP_START
echo ""

echo "构建完成"
print_time $TOTAL_START

DIST_SIZE=$(du -sh "$DIST_DIR" | cut -f1)
NODE_MODULES_SIZE=$(du -sh "$DIST_DIR/node_modules" 2>/dev/null | cut -f1 || echo "n/a")
echo ""
echo "📊 构建产物统计:"
echo "   产物大小:        $DIST_SIZE"
echo "   node_modules: $NODE_MODULES_SIZE"
echo ""
echo "   前端：在项目根目录执行 npm --prefix web run start（或从 dist/web 安装依赖后 next start）。"
echo ""
