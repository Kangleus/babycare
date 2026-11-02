#!/usr/bin/env bash
# 提交前扫一遍，防止把密钥 / 测试账号 / 数据库导出带进公开仓库。
# 用法：npm run check:secrets     （建议每次 commit 前跑，配合 git status --short 一起看）
set -uo pipefail
cd "$(dirname "$0")/.."

fails=0
warns=0

red() { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

# 待扫的内容：已暂存的改动 + 未跟踪的新文件
scan_text() {
  {
    git diff --cached -U0 -- . ':(exclude)package-lock.json' ':(exclude)*.example' 2>/dev/null || true
    git ls-files --others --exclude-standard -z 2>/dev/null | while IFS= read -r -d '' f; do
      case "$f" in
        *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.ttf|*.woff*|*.zip|*.gz|*.example) continue ;;
      esac
      printf '+++ %s\n' "$f"
      sed -n '1,400p' "$f" 2>/dev/null || true
    done
  }
}

TEXT="$(scan_text)"

check() { # $1=说明 $2=正则
  local hits
  hits=$(printf '%s\n' "$TEXT" | grep -nE "$2" | head -5 || true)
  if [ -n "$hits" ]; then
    red "✗ $1"
    printf '%s\n' "$hits" | sed 's/^/    /'
    fails=$((fails + 1))
  fi
}

warn() { # $1=说明 $2=正则
  local hits
  hits=$(printf '%s\n' "$TEXT" | grep -nE "$2" | head -3 || true)
  if [ -n "$hits" ]; then
    yellow "! $1"
    printf '%s\n' "$hits" | sed 's/^/    /'
    warns=$((warns + 1))
  fi
}

check 'Supabase secret key（绝不能进仓库）' 'sb_secret_[A-Za-z0-9_-]{10,}'
check 'service_role / 私钥字样' 'service_role["'\'']?\s*[:=]'
check '第三方 AI key 被写死' '(DASHSCOPE|OPENAI|DEEPSEEK)_API_KEY\s*[=:]\s*["'\'']?[A-Za-z0-9_-]{12,}'
check '带密码的数据库连接串' 'postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]+@'
check 'OpenAI 风格 sk- 密钥' 'sk-[A-Za-z0-9]{20,}'
warn  'JWT（老的 anon key 长这样，确认是不是有意放进去的）' 'eyJhbGciOi[A-Za-z0-9_-]{10,}'
warn  '内网 / 本机绝对路径' '/Users/[A-Za-z0-9._-]+/'

# 明确的禁止项：这些文件/目录不能被 git 跟踪
for p in .env .env.test backups; do
  if git ls-files --cached --error-unmatch "$p" >/dev/null 2>&1; then
    red "✗ $p 已被 git 跟踪（应写进 .gitignore 并 git rm --cached）"
    fails=$((fails + 1))
  fi
done
if git ls-files --cached 'backups/*' 2>/dev/null | grep -q .; then
  red '✗ backups/ 里有文件被跟踪（数据库导出含宝宝真实数据，绝不能提交）'
  fails=$((fails + 1))
fi

echo
if [ "$fails" -gt 0 ]; then
  red "发现 $fails 类问题，先处理再提交。"
  exit 1
fi
if [ "$warns" -gt 0 ]; then
  yellow "没有硬性问题，但有 $warns 条提醒，请自己确认。"
else
  green '✓ 没发现密钥 / 密码 / 不该进仓库的文件。'
fi
