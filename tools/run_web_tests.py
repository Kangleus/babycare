#!/usr/bin/env python3
"""一键跑网页版验收测试：构建 → 起静态服务 → 依次跑脚本 → 汇总 → 收尾。

用法：
  npm run test:web                   # 重新构建 + 跑全套（4 个脚本）
  npm run test:web -- --no-build     # 复用已有 dist（CI 里先单独构建，便于定位构建失败）
  python3 tools/run_web_tests.py e2e.py e2e_m4.py   # 只跑指定的几个

只依赖标准库；被测脚本需要的 playwright / pillow 装在 .venv 里（npm run setup:test）。
视觉差异不会静默：每个脚本会把超阈值项写进 VISUAL_REPORT_FILE，这里统一汇总成一段。
"""
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / 'tools'
DIST = ROOT / 'dist'

DEFAULT_TESTS = ['e2e.py', 'e2e_m4.py', 'mascot_check.py', 'night_check.py']
DEFAULT_PORT = 8090

# 中文说明，汇总时更好读
LABELS = {
    'e2e.py': 'M1/M2 主流程 + 趋势 + 原型对比',
    'e2e_m4.py': 'M4 健康 tab',
    'mascot_check.py': '团团动画：Web 实现 vs 原生实现',
    'night_check.py': '夜间模式星星',
}


def free_port(preferred):
    for port in [preferred] + list(range(preferred + 1, preferred + 40)):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise SystemExit('找不到可用端口')


def venv_python():
    p = ROOT / '.venv' / 'bin' / 'python'
    if not p.exists():
        raise SystemExit('没找到 .venv —— 先跑一次：npm run setup:test')
    return str(p)


def wait_ready(url, timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


def main(argv):
    no_build = '--no-build' in argv
    names = [a for a in argv if not a.startswith('-')] or list(DEFAULT_TESTS)
    missing = [n for n in names if not (TOOLS / n).exists()]
    if missing:
        raise SystemExit(f'找不到测试脚本：{", ".join(missing)}')

    if not no_build:
        print('==> 构建网页版（expo export --platform web）')
        rc = subprocess.run(['npx', 'expo', 'export', '--platform', 'web', '--output-dir', 'dist'],
                            cwd=ROOT).returncode
        if rc != 0:
            raise SystemExit('构建失败，先看看上面的报错（这一步失败与测试无关）')
    elif not (DIST / 'index.html').exists():
        raise SystemExit('dist/ 不存在，去掉 --no-build 让脚本先构建')

    port = free_port(int(os.environ.get('E2E_PORT') or DEFAULT_PORT))
    base = f'http://127.0.0.1:{port}'
    print(f'==> 起静态服务 {base}（目录 dist/）')
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(DIST)],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_ready(base + '/'):
            raise SystemExit('静态服务没起来')
        tmp = tempfile.NamedTemporaryFile(prefix='visual-', suffix='.tsv', delete=False)
        tmp.close()
        env = dict(os.environ)
        env.update({
            'E2E_BASE_URL': base,
            'PYTHONPATH': str(TOOLS) + (os.pathsep + env['PYTHONPATH'] if env.get('PYTHONPATH') else ''),
            'VISUAL_REPORT_FILE': tmp.name,
            'PYTHONIOENCODING': 'utf-8',
        })
        results = []
        py = venv_python()
        for i, n in enumerate(names, 1):
            print()
            print('=' * 68)
            print(f'[{i}/{len(names)}] {n} —— {LABELS.get(n, "")}')
            print('=' * 68)
            t0 = time.time()
            rc = subprocess.run([py, str(TOOLS / n)], cwd=ROOT, env=env).returncode
            results.append((n, rc, time.time() - t0))
        visual = []
        for line in Path(tmp.name).read_text(encoding='utf-8').splitlines():
            if line.strip():
                visual.append(line.split('\t'))
        os.unlink(tmp.name)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    print()
    print('=' * 68)
    print('汇总')
    print('=' * 68)
    failed = 0
    for n, rc, dt in results:
        failed += rc != 0
        print(f'  {"PASS" if rc == 0 else "FAIL"}  {n:<18} {dt:6.1f}s   {LABELS.get(n, "")}')

    if visual:
        print()
        print(f'  视觉差异：{len(visual)} 处超过阈值（样式必须与原型一致，见 docs/HANDOFF.md 第 2 节）')
        for name, pct, extra in visual:
            print(f'    ⚠️  {name}  {pct}%  {extra}'.rstrip())
    else:
        print()
        print('  视觉差异：全部在阈值内')

    shots = Path(os.environ.get('E2E_SHOTS_DIR') or (ROOT / 'shots'))
    if not os.environ.get('E2E_SHOTS_DIR'):
        print()
        print(f'  截图已写入 {shots}（git 跟踪目录）。只想看结果、不想让工作区变脏：')
        print('    git checkout -- shots/')

    print()
    print(f'  {len(results) - failed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
