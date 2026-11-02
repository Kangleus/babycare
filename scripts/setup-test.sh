#!/usr/bin/env bash
# 建测试用的 Python venv 并装好 Playwright / Pillow。一台机器只需跑一次。
# 用法：npm run setup:test   （想指定解释器：PYTHON=python3.12 npm run setup:test）
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3.12 python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "找不到 python3，请先安装 Python 3.9+" >&2
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "==> 用 $PY 创建 .venv"
  "$PY" -m venv .venv
fi

echo "==> 安装 Python 依赖"
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r tools/test-requirements.txt

echo "==> 安装 Playwright 自带的 chromium"
.venv/bin/python -m playwright install chromium

echo
echo "完成。下一步："
echo "  npm run build:web && npm run test:web    # 构建并跑全套验收测试"
echo "  npm run test:web                         # 重新跑一遍（会先重新构建）"
