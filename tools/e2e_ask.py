"""团子育儿本 M5 问团子界面 e2e（本地 / 未登录，不需要 key）：390x844，时钟固定 2026-10-31 10:20。
覆盖：
1) S0：页头（副标题不再有「演示」）+ 开场白 + 4 个建议问题
2) 空输入不发送
3) 点第 4 个建议问题 → 本机紧急卡（不联网、不计次）：含「请尽快就医」「120」
4) 紧急卡「生成给医生的摘要」→ 一键摘要面板默认选中「给医生」
5) 未登录问普通问题 → S5 登录提示
6) 夜间模式下紧急卡仍可见
7) S0 与原型「问团子」页并排像素对比（打印差异，不静默）
跑法：npm run test:web（会自动构建 + 起服务 + 收尾）"""
import asyncio, datetime, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
O = paths.sub('m5-ask')
BASE = paths.BASE_URL
PROTO = paths.require_proto()
NOW = datetime.datetime(2026, 10, 31, 10, 20, 0)
ok = []; bad = []


def check(name, cond, info=''):
    (ok if cond else bad).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(info) if info else ''))


def side(name, A, B):
    w, h = min(A.width, B.width), min(A.height, B.height)
    A2, B2 = A.crop((0, 0, w, h)), B.crop((0, 0, w, h))
    c = Image.new('RGB', (w, h * 2 + 20), 'white')
    c.paste(A2, (0, 0)); c.paste(B2, (0, h + 20))
    c.save(O + name)
    d = ImageChops.difference(A2.convert('RGB'), B2.convert('RGB')).convert('L')
    px = sum(1 for v in d.getdata() if v > 40)
    pct = px / (w * h) * 100
    if paths.visual_report(name, pct):
        bad.append('visual ' + name)


async def tab(r, name):
    await r.get_by_text(name, exact=True).last.click(); await r.wait_for_timeout(800)


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=paths.CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        r = await ctx.new_page(); T = r.get_by_test_id; errs = []
        r.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await r.clock.set_system_time(NOW)
        await r.goto(BASE + '/'); await r.wait_for_timeout(3000)
        await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(600)
        await T('pf-submit').click(); await r.wait_for_timeout(2500)

        # ---------- 1. S0 ----------
        await tab(r, '问团子')
        body = await r.locator('body').inner_text()
        check('S0 页头：问团子 + 只看…的记录回答（无「演示」）', '问团子' in body and '只看豆米的记录回答' in body and '演示' not in body, body[:60])
        check('S0 开场白', '我是团团！' in body and '不会瞎编' in body)
        check('S0 有 4 个建议问题', all([await T(f'ask-chip-{i}').count() for i in range(4)]))
        await r.screenshot(path=O + 's0.png')

        # ---------- 2. 空输入不发送 ----------
        before = await T('ask-msg-me').count()
        await T('ask-send').click(); await r.wait_for_timeout(500)
        check('空输入不发送', await T('ask-msg-me').count() == before)

        # ---------- 3. 第 4 个建议问题 → 本机紧急卡 ----------
        await T('ask-chip-3').click(); await r.wait_for_timeout(800)
        check('紧急卡出现', await T('ask-risk').last.is_visible())
        risk = await T('ask-risk').last.inner_text()
        check('紧急卡含「请尽快就医」', '请尽快就医' in risk, risk[:40])
        check('紧急卡含 120', '120' in risk)
        check('紧急卡不做诊断声明', '不做诊断' in risk and '用药剂量' in risk)
        check('紧急卡带记录摘要与按钮', '今天喂奶' in risk and await T('ask-risk-summary').last.is_visible())
        await r.screenshot(path=O + 's3-urgent.png')

        # ---------- 4. 紧急卡 → 一键摘要默认给医生 ----------
        await T('ask-risk-summary').last.click(); await r.wait_for_timeout(800)
        check('紧急卡按钮打开一键摘要', await T('sm-pick').is_visible())
        await T('sm-gen').click()
        await T('sm-memo').wait_for(state='visible', timeout=15000); await r.wait_for_timeout(500)
        memo = await T('sm-memo').inner_text()
        check('打开的就是「给医生」版', '给医生看' in memo, memo[:40])
        await T('sm-again').click(); await r.wait_for_timeout(300)
        await r.mouse.click(195, 70); await r.wait_for_timeout(600)

        # ---------- 5. 未登录问普通问题 → S5 ----------
        await T('ask-input').fill('这周奶量正常吗？'); await T('ask-send').click(); await r.wait_for_timeout(900)
        after = await T('ask-msg-bot').last.inner_text() if await T('ask-msg-bot').count() else ''
        body2 = await r.locator('body').inner_text()
        check('未登录 → 提示登录后才能翻记录', '登录后团团才能翻记录' in body2 and '加入家庭' in body2, (after or body2)[:60])
        await r.screenshot(path=O + 's5-login.png')

        # ---------- 6. 夜间模式紧急卡 ----------
        await tab(r, '我的')
        await T('night-toggle').scroll_into_view_if_needed(); await T('night-toggle').click(); await r.wait_for_timeout(700)
        await tab(r, '问团子')
        await T('ask-chip-3').click(); await r.wait_for_timeout(700)
        check('夜间模式下紧急卡仍显示', await T('ask-risk').last.is_visible())
        await r.screenshot(path=O + 's3-night.png')
        await tab(r, '我的'); await T('night-toggle').click(); await r.wait_for_timeout(500)

        # ---------- 7. 与原型并排对比（问团子初始屏） ----------
        # 新开一个页面：对话状态是内存里的，新页面才是干净的 S0（否则会带上刚才的紧急卡）
        r2 = await ctx.new_page(); await r2.clock.set_system_time(NOW)
        await r2.goto(BASE + '/'); await r2.wait_for_timeout(2500)
        await r2.get_by_text('问团子', exact=True).last.click(); await r2.wait_for_timeout(900)
        await r2.screenshot(path=O + 'rn-ask.png')
        await r2.close()
        a = await ctx.new_page(); await a.clock.set_system_time(NOW)
        await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1200)
        await a.get_by_text('问团子', exact=True).last.click(); await a.wait_for_timeout(1000)
        await a.screenshot(path=O + 'proto-ask.png')
        await a.close()
        side('compare-ask.png', Image.open(O + 'rn-ask.png'), Image.open(O + 'proto-ask.png'))

        check('no page errors', not [e for e in errs if 'PAGEERR' in e], errs[:3])
        print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
        await b.close()
        sys.exit(1 if bad else 0)

asyncio.run(main())
