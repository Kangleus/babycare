"""测试脚本共用的路径 / 浏览器 / 视觉阈值配置。

背景：这批脚本原本写死了原开发机的 `/workspace/yijuji-app/...`、
`/workspace/yijuji-prototype/index.html` 和 `/usr/bin/google-chrome`，
换一台机器（macOS、CI 的 ubuntu runner）就全部跑不起来。现在统一从这里取。

可用环境变量覆盖：
  E2E_BASE_URL     被测站点地址，默认 http://localhost:8090
  E2E_SHOTS_DIR    截图输出目录，默认 <repo>/shots
                   （CI 指到临时目录，避免改动已被 git 跟踪的 PNG）
  CHROME_PATH      指定 Chrome 可执行文件；不设则找系统默认位置，
                   再找不到就交给 Playwright 自带 chromium
  ENV_TEST_FILE    云端测试账号文件，默认 <repo>/.env.test（不进 git）
  VISUAL_WARN_PCT  像素差异告警阈值（百分比），默认 2.0
  VISUAL_STRICT    设为 1 时差异超阈值直接判失败（默认只警示，见 visual_report）
  VISUAL_REPORT_FILE  由 run_web_tests.py 注入，用于把告警汇总到总报告
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get('E2E_SHOTS_DIR') or (ROOT / 'shots')).resolve()
PROTO = ROOT / 'docs' / 'prototype' / 'index.html'
PROTO_URI = PROTO.as_uri()
BASE_URL = (os.environ.get('E2E_BASE_URL') or 'http://localhost:8090').rstrip('/')
ENV_TEST = Path(os.environ.get('ENV_TEST_FILE') or (ROOT / '.env.test'))

VISUAL_WARN_PCT = float(os.environ.get('VISUAL_WARN_PCT') or 2.0)
VISUAL_STRICT = os.environ.get('VISUAL_STRICT') == '1'
_VISUAL_LOG = os.environ.get('VISUAL_REPORT_FILE') or ''

# 兼容老脚本里 `O='/workspace/yijuji-app/shots/'` 的写法：给一个带尾分隔符的字符串
O = str(SHOTS) + os.sep


def sub(*parts):
    """返回 shots 下某个子目录的「带尾分隔符」字符串，并按需创建目录。"""
    p = SHOTS.joinpath(*parts)
    p.mkdir(parents=True, exist_ok=True)
    return str(p) + os.sep


_CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
]


def find_chrome():
    """返回可用的 Chrome/Chromium 可执行文件；都没有则返回 None（用 Playwright 自带的）。"""
    env = os.environ.get('CHROME_PATH')
    if env:
        return env
    for c in _CHROME_CANDIDATES:
        if os.path.exists(c):
            return c
    return None


CHROME = find_chrome()


def load_env_file(path=None):
    """读 .env.test 这类 KEY=VALUE 文件，返回 dict；文件不存在返回 {}。"""
    p = Path(path or ENV_TEST)
    if not p.exists():
        return {}
    out = {}
    for line in p.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


ALLOWLIST = ROOT / 'tools' / 'visual-allowlist.txt'


def _load_allowlist():
    """读豁免名单：每行 「前缀 <空白> 原因」。没有原因的行忽略。"""
    out = []
    if not ALLOWLIST.exists():
        return out
    for raw in ALLOWLIST.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 1)
        if len(parts) == 2:
            out.append((parts[0], parts[1].strip()))
    return out


_ALLOW = _load_allowlist()


def _exempt_reason(name):
    for prefix, reason in _ALLOW:
        if name.startswith(prefix):
            return reason
    return None


def visual_report(name, pct, extra=''):
    """像素差异的统一出口：无论是否超阈值都打印百分比，超阈值醒目告警。

    视觉标准是硬规则（见 docs/HANDOFF.md 第 2 节），所以这里不允许静默：
      - 每条对比都留一行记录
      - 超阈值打 ⚠️ 块，并写入 VISUAL_REPORT_FILE 供 test:web 汇总
      - 豁免名单（tools/visual-allowlist.txt）里的条目仍然打印、仍然汇总，
        但标注为「已豁免」并附原因，不算需要处理的告警
      - VISUAL_STRICT=1 时，未豁免的超阈值差异算失败
    返回 True 表示这条差异是否应判为失败。
    """
    over = pct > VISUAL_WARN_PCT
    print(f'  visual {name} {pct:.2f}%' + (f'  {extra}' if extra else ''))
    if not over:
        return False

    exempt = _exempt_reason(name)
    if exempt:
        print()
        print(f'  ⚠️  已豁免（{exempt}）')
        print(f'     {name}  {pct:.2f}%  —— 原型未跟上，差异属预期；补上原型后应删掉豁免。')
        print()
        if _VISUAL_LOG:
            _log('EXEMPT', name, pct, exempt + (f' | {extra}' if extra else ''))
        return False

    print()
    print('  ' + '!' * 56)
    print(f'  ⚠️  视觉差异超标：{name}  {pct:.2f}%（阈值 {VISUAL_WARN_PCT:.1f}%）')
    print('     样式必须和原型一模一样（docs/HANDOFF.md 第 2 节），请人工确认这张对比图。')
    print('  ' + '!' * 56)
    print()
    if _VISUAL_LOG:
        _log('OVER', name, pct, extra)
    return VISUAL_STRICT


def _log(status, name, pct, extra):
    try:
        with open(_VISUAL_LOG, 'a', encoding='utf-8') as f:
            f.write(f'{status}\t{name}\t{pct:.2f}\t{extra}\n')
    except OSError:
        pass



def require_proto():
    """原型不存在时直接报错，避免脚本静默跑到一半才崩。"""
    if not PROTO.exists():
        sys.exit(f'找不到视觉原型：{PROTO}')
    return PROTO_URI
