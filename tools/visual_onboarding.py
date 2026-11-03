"""首次使用流程 · 每一页 日间 + 夜间 与原型 docs/prototype/index.html#onboarding/<id> 像素对比（390x844 @2x，阈值见 paths.py）。

App 一侧全部走真实界面操作 + 拦截 Supabase（tools/e2e_onboarding.py 的假后端），原型一侧用 OBX.jump(id) 跳页。
两边都冻结动画、隐藏 toast；原型隐藏评审用的「流程导航」按钮和虚线「原型演示」提示框（这些不做进 App）。
数据对齐原型：邮箱 mama@example.com，宝宝 糯米 / 男宝 / 2026-09-12 / 冒芽团子 / 瓶喂母乳，加入的家庭有 126 条记录。
跑法：npm run test:web，或 python3 tools/run_web_tests.py visual_onboarding.py"""
import asyncio, datetime, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
from e2e_onboarding import Backend, new_ctx

O = paths.sub('onboarding-visual')
BASE = paths.BASE_URL
PROTO = paths.require_proto()
NOW = datetime.datetime(2026, 10, 31, 10, 20, 0)
MAIL = 'mama@example.com'
FZ = '*,*:before,*:after{animation:none!important;transition:none!important;caret-color:transparent!important}'
HIDE_P = '#obNavBtn,#obNavPop,.ob-demo-n,.toast{display:none!important}'
HIDE_A = '[data-testid="toast"]{display:none!important}'
results = []   # (id, mode, pct)
bad = []


def diff(name, a_path, b_path):
    A = Image.open(a_path).convert('RGB'); B = Image.open(b_path).convert('RGB').resize(A.size)
    c = Image.new('RGB', (A.width * 2 + 20, A.height), 'white'); c.paste(A, (0, 0)); c.paste(B, (A.width + 20, 0)); c.save(O + f'compare-{name}.png')
    d = ImageChops.difference(A, B).convert('L')
    px = sum(1 for v in d.get_flattened_data() if v > 40)
    pct = px / (A.width * A.height) * 100
    if paths.visual_report(f'onboarding/compare-{name}.png', pct):
        bad.append(name)
    return pct


async def proto_shot(b, sid, night, out):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, reduced_motion='reduce')
    a = await ctx.new_page()
    await a.goto(PROTO + '#onboarding/welcome'); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(600)
    if night:
        await a.evaluate('OBX.night()'); await a.wait_for_timeout(300)
    await a.evaluate(f"OBX.jump('{sid}')"); await a.wait_for_timeout(900)
    await a.add_style_tag(content=FZ + HIDE_P); await a.wait_for_timeout(400)
    await a.screenshot(path=out)
    await ctx.close()


class App:
    def __init__(self, b, night):
        self.b = b; self.night = night; self.mode = 'night' if night else 'day'

    async def open(self, be=None, url='/'):
        self.be = be or Backend(); self.be.email = MAIL
        self.ctx = await new_ctx(self.b, self.be, night=self.night, still=True)
        self.r = await self.ctx.new_page(); self.T = self.r.get_by_test_id
        self.errs = []
        self.r.on('pageerror', lambda e: self.errs.append(str(e)))
        await self.r.clock.set_system_time(NOW)
        await self.r.goto(BASE + url, wait_until='domcontentloaded')
        return self

    async def shot(self, sid, settle=700):
        r = self.r
        await r.wait_for_timeout(settle)
        st = await r.add_style_tag(content=FZ + HIDE_A); await r.wait_for_timeout(350)
        rn = O + f'rn-{sid}-{self.mode}.png'; pr = O + f'proto-{sid}-{self.mode}.png'
        await r.screenshot(path=rn)
        await st.evaluate('e => e.remove()')
        await proto_shot(self.b, sid, self.night, pr)
        pct = diff(f'{sid}-{self.mode}', pr, rn)
        results.append((sid, self.mode, pct))

    async def close(self):
        if self.errs:
            print('page errors:', self.errs); bad.append('page errors ' + self.mode)
        await self.ctx.close()


async def login(app):
    T = app.T
    await T('ob-welcome').wait_for(state='visible', timeout=60000)
    await T('ob-start').click(); await app.r.wait_for_timeout(400)
    await T('ob-mode-in').click(); await T('ob-email').fill(MAIL); await T('ob-pw').fill('tuanzi2026'); await T('ob-submit').click()
    await T('ob-choose').wait_for(state='visible', timeout=10000)


async def run(b, night):
    # 1 / 2 / 2a / 2b / 2c / 2d / 2e
    app = await App(b, night).open(); T = app.T; r = app.r
    await T('ob-welcome').wait_for(state='visible', timeout=60000); await app.shot('welcome', 1200)
    await T('ob-start').click(); await app.shot('auth-up')
    await T('ob-mode-in').click(); await app.shot('auth-in')
    await T('ob-forgot').click(); await T('ob-forgot').wait_for(state='visible'); await app.shot('forgot')
    await T('ob-forgot-email').fill(MAIL); await T('ob-forgot-send').click(); await T('ob-forgot-sent').wait_for(state='visible'); await app.shot('forgot-sent')
    await T('ob-back-login').click(); await r.wait_for_timeout(400)
    app.be.login = 'bad'; await T('ob-pw').fill('000000'); await T('ob-submit').click(); await T('ob-auth-banner').wait_for(state='visible')
    await r.locator('input').first.blur(); await app.shot('auth-err')
    await T('ob-mode-up').click(); await T('ob-pw').fill('tuanzi2026'); await T('ob-agree').click(); await T('ob-submit').click()
    await T('ob-verify').wait_for(state='visible'); await app.shot('verify')
    await app.close()

    # 2f 设置新密码（点重置邮件里的链接回来）
    app = await App(b, night).open(url='/#access_token=e2e-access-token&expires_in=3600&refresh_token=e2e-refresh&token_type=bearer&type=recovery')
    await app.T('ob-setpw').wait_for(state='visible', timeout=60000); await app.shot('setpw')
    await app.close()

    # 3 / 4 / 5 / 7 / 7a / 5a
    app = await App(b, night).open(); T = app.T; r = app.r
    await login(app); await app.shot('choose', 2600)
    await T('ob-choose-new').click(); await T('ob-profile').wait_for(state='visible'); await app.shot('profile')
    await T('pf-name').fill('糯米'); await T('pf-bd').fill('2026-09-12'); await T('pf-gender-boy').click(); await T('pf-av-sprout').click(); await T('pf-feed-bm').click()
    await T('pf-submit').click(); await T('pred-fresh').wait_for(state='visible', timeout=10000)
    await app.shot('home', 2600)
    await r.get_by_text('我的', exact=True).last.click(); await app.shot('me', 1000)
    await T('sign-out').scroll_into_view_if_needed(); await T('sign-out').click()
    # 原型的确认框弹在页面顶部（没滚动）；App 里要先滚到「退出登录」才点得到，对比前把页面滚回顶部
    await r.evaluate("document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; })"); await app.shot('me-logout', 900)
    await T('confirm-cancel').click(); await r.wait_for_timeout(600)
    await r.get_by_text('今天', exact=True).last.click(); await r.wait_for_timeout(800)
    await T('plus-feed').click(); await T('rec-save').wait_for(state='visible'); await T('rec-save').click()
    await T('first-sheet').wait_for(state='visible', timeout=8000); await app.shot('home-first', 1200)
    await app.close()

    # 3a / 3b
    be = Backend(); be.rows = 126
    app = await App(b, night).open(be); T = app.T; r = app.r
    await login(app); await T('ob-choose-join').click(); await T('ob-join').wait_for(state='visible'); await app.shot('join', 2400)
    await T('ob-code-in').fill('7K2QMB'); await T('ob-join-go').click(); await T('ob-join-ok').wait_for(state='visible', timeout=10000)
    await app.shot('join-ok', 1500)
    await app.close()

    # 6 示例
    app = await App(b, night).open(); T = app.T
    await T('ob-welcome').wait_for(state='visible', timeout=60000); await T('ob-demo').click(); await T('demo-banner').wait_for(state='visible')
    await app.shot('demo', 2600)
    await app.close()


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=paths.CHROME, args=['--no-sandbox'])
        for night in (False, True):
            await run(b, night)
        await b.close()
    print('\n页面            日间      夜间')
    ids = list(dict.fromkeys(x[0] for x in results))
    for i in ids:
        d = next((p for s, m, p in results if s == i and m == 'day'), float('nan')); n = next((p for s, m, p in results if s == i and m == 'night'), float('nan'))
        print(f'{i:14s} {d:6.2f}%  {n:6.2f}%')
    over = [f'{s}-{m}' for s, m, p in results if p > paths.VISUAL_WARN_PCT]
    print(f'\n{len(results)} 张对比，{len(over)} 张超阈值（{paths.VISUAL_WARN_PCT}%）', over)
    sys.exit(1 if [x for x in bad if x.startswith('page errors')] or (bad and paths.VISUAL_STRICT) else 0)

if __name__ == '__main__':
    asyncio.run(main())
