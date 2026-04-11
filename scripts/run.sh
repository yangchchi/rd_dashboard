#!/usr/bin/env bash
# 生产环境从 dist/ 启动 Nest API（cwd 与开发一致，便于加载相对路径资源）
NODE_ENV=production node server/main.js
