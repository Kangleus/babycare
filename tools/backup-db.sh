#!/usr/bin/env bash
# 导出 Supabase 数据库备份。
#
# 为什么需要它：Supabase 免费版没有任何自动备份（官方文档明确说明，付费版才有每日备份）。
# 在真实用户进来之前，必须能随时导出一份完整数据。
#
# 用法：
#   SUPABASE_DB_URL='<Supabase Dashboard 上复制的 Session pooler 连接串>' npm run backup:db
#
# 也可以把 SUPABASE_DB_URL 写进仓库根目录的 .env（已被 gitignore）。
# 连接串里的密码只经环境变量 / PGPASSWORD 传给容器，不会出现在命令行参数和日志里。
# 注意：不要把真实连接串写进注释、文档或提交信息 —— 这里刻意不写示例 URL。
#
# 版本规则：pg_dump 的主版本必须 >= 数据库服务器的主版本，否则可能导不出来。
# 所以先探服务器版本，再用对应主版本的 postgres 镜像；禁止用裸 postgres（拉 latest）。
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077

say() { printf '==> %s\n' "$1"; }
die() { printf '错误：%s\n' "$1" >&2; exit 1; }

# 1) 取连接串（环境变量优先，其次 .env）
URL="${SUPABASE_DB_URL:-}"
if [ -z "$URL" ] && [ -f .env ]; then
  URL=$(grep -E '^[[:space:]]*SUPABASE_DB_URL[[:space:]]*=' .env | tail -1 \
        | sed -E 's/^[^=]*=[[:space:]]*//; s/^["'\'']//; s/["'\'']$//' || true)
fi
[ -n "$URL" ] || die "没有 SUPABASE_DB_URL。
  到 Supabase Dashboard → Project Settings → Database → Connection string 取 Session pooler 连接串，
  然后：SUPABASE_DB_URL='postgresql://...' npm run backup:db
  （或写进仓库根目录的 .env，该文件不进 git）"

case "$URL" in
  postgres://*|postgresql://*) ;;
  *) die "SUPABASE_DB_URL 不是有效的 postgres 连接串" ;;
esac

# 从连接串里单独拿出密码给 PGPASSWORD（不打印、不进 argv）
export PGPASSWORD="${PGPASSWORD:-$(printf '%s' "$URL" | sed -nE 's#^[a-z]+://[^:/@]+:([^@]*)@.*$#\1#p')}"
export DBURL="$URL"
unset URL

have() { command -v "$1" >/dev/null 2>&1; }

# 2) 探测服务器主版本（客户端向下兼容，先用 17 探，失败再退 15）
probe_server_major() {
  local sql='psql "$DBURL" -tAc "show server_version_num"'
  if have psql; then
    printf '%s' "$(psql "$DBURL" -tAc 'show server_version_num' 2>/dev/null | tr -d '[:space:]')"
    return
  fi
  have docker || return 0
  for img in postgres:17 postgres:15; do
    local v
    v=$(docker run --rm -e DBURL -e PGPASSWORD "$img" sh -c "$sql" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -n "$v" ]; then printf '%s' "$v"; return; fi
  done
}

say '探测数据库服务器版本'
VERNUM=$(probe_server_major || true)
[ -n "${VERNUM:-}" ] || die "连不上数据库，或本机既没有 psql 也没有可用的 docker。
  请确认：连接串正确、数据库在运行、必要时先 docker login / 启动 Docker Desktop。"
SERVER_MAJOR=$(( VERNUM / 10000 ))
say "服务器 PostgreSQL 主版本：$SERVER_MAJOR（server_version_num=$VERNUM）"

# 3) 选落地方案：本机 pg_dump 主版本够就用本机，否则用同主版本镜像
LOCAL_PGDUMP_MAJOR=0
if have pg_dump; then
  LOCAL_PGDUMP_MAJOR=$(pg_dump --version | sed -nE 's/.* ([0-9]+)(\.[0-9]+)*.*/\1/p' | head -1)
  LOCAL_PGDUMP_MAJOR=${LOCAL_PGDUMP_MAJOR:-0}
fi

if [ "$LOCAL_PGDUMP_MAJOR" -ge "$SERVER_MAJOR" ] && [ "$LOCAL_PGDUMP_MAJOR" -gt 0 ]; then
  MODE="local"
  say "使用本机 pg_dump $LOCAL_PGDUMP_MAJOR（>= 服务器 $SERVER_MAJOR）"
else
  have docker || die "本机没有 pg_dump，也没有可用的 docker，无法导出。"
  MODE="docker"
  IMG="postgres:$SERVER_MAJOR"
  say "使用容器 $IMG 里的 pg_dump（本机版本 $LOCAL_PGDUMP_MAJOR，不足以导出 $SERVER_MAJOR）"
fi

# 4) 导出
mkdir -p backups
OUT="backups/babycare-$(date +%Y%m%d-%H%M).sql.gz"
say "导出到 $OUT"
if [ "$MODE" = "local" ]; then
  pg_dump "$DBURL" --no-owner --no-privileges --no-comments | gzip -9 > "$OUT"
else
  docker run --rm -e DBURL -e PGPASSWORD "$IMG" \
    sh -c 'pg_dump "$DBURL" --no-owner --no-privileges --no-comments' | gzip -9 > "$OUT"
fi
chmod 600 "$OUT"

# 5) 校验：压缩完整 + 表数量（和预期对不上就说明没导全）
gzip -t "$OUT" || die "备份文件损坏（gzip 校验失败）"
TABLES=$(gzip -dc "$OUT" | grep -c '^CREATE TABLE' || true)
BYTES=$(wc -c < "$OUT" | tr -d ' ')
say "完成：$OUT（$TABLES 张表，$(printf '%.1f' "$(echo "$BYTES/1024" | bc -l 2>/dev/null || echo 0)") KB）"
echo
echo "提示："
echo "  · 文件权限已设为 600，且 backups/ 在 .gitignore 里 —— 不要手动提交它。"
echo "  · 免费版没有自动备份，建议每周跑一次，或升级到付费版用每日备份。"
