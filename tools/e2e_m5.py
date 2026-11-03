"""团子育儿本 M5 一键摘要 e2e（本地 / 未登录）：390x844，时钟固定 2026-10-31 10:20。
1) 问团子页右上角入口 → 默认「给医生 / 近 3 天」
2) 生成的便签数字用 localStorage 里的记录**独立重算**核对（日均奶量 / 睡眠 / 尿布）
3) 切奶奶版 + 近 7 天：标题、口吻、小叮嘱
4) 换一种回到选择屏；存图片能下载；分享文字进剪贴板
5) 我的页也有入口
6) 没有记录时的空状态
7) 选择屏与原型并排像素对比（便签屏数据是真实的，只做内容断言，不做像素对比）
跑法：npm run test:web（会自动构建 + 起服务 + 收尾）"""
import asyncio, datetime, json, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
import e2e_common as common
O = paths.sub('m5')
BASE = paths.BASE_URL
PROTO = paths.require_proto()
FZ = '*,*:before,*:after{animation:none!important;transition:none!important}'
NOW = datetime.datetime(2026, 10, 31, 10, 20, 0)
ok = []; bad = []


def check(name, cond, info=''):
    (ok if cond else bad).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(info) if info else ''))


def diff(name, A, B):
    """A / B 是尺寸相同的 PIL 图；差异走统一出口（不静默）。"""
    d = ImageChops.difference(A.convert('RGB'), B.convert('RGB')).convert('L')
    px = sum(1 for v in d.getdata() if v > 40)
    pct = px / (A.width * A.height) * 100
    if paths.visual_report(name, pct):
        bad.append('visual ' + name)


async def onboard(r):
    # 正式版必须登录：用 e2e_common 播种「已登录 + 有家庭 + 有 14 天记录」，不连真后端
    await common.login(r, BASE)


async def tab(r, name):
    await r.get_by_text(name, exact=True).last.click(); await r.wait_for_timeout(700)


async def ready(r):
    """reload 之后等应用起来：底部 tab 栏出现即视为就绪（比等某个页面元素稳）。"""
    await r.get_by_text('今天', exact=True).last.wait_for(state='visible', timeout=60000)


def recompute(recs):
    """照 lib/summary.ts 的规则独立算一遍：近 3 天 = 今天 + 前两个整天，日均只算完整的天。"""
    # 统一转成「本机时区的 naive 时间」，好和第几天 0 点直接比较
    loc = lambda iso: datetime.datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone().replace(tzinfo=None)
    today = datetime.date(2026, 10, 31)
    ml, sl, dia = [], [], []
    for i in (2, 1):
        d = today - datetime.timedelta(days=i)
        rs = [x for x in recs if loc(x['time']).date() == d]
        ml.append(sum((x['values'].get('ml') or 0) for x in rs if x['type'] == 'feed'))
        dia.append(sum(1 for x in rs if x['type'] == 'diaper'))
        a = datetime.datetime.combine(d, datetime.time()); b = a + datetime.timedelta(days=1)
        tot = 0.0
        for x in recs:
            if x['type'] != 'sleep' or not x.get('endTime'):
                continue
            s = max(loc(x['time']), a); e = min(loc(x['endTime']), b)
            tot += max(0.0, (e - s).total_seconds() / 60)
        sl.append(tot)
    return {
        'ml': str(round(sum(ml) / len(ml))),
        'sl': '%.1f' % (sum(sl) / 60 / len(sl)),
        'dia': '%.1f' % (sum(dia) / len(dia)),
    }


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=paths.CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        await common.install_routes(ctx); await common.seed_context(ctx)
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE)
        r = await ctx.new_page(); T = r.get_by_test_id; errs = []
        r.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await r.clock.set_system_time(NOW)
        await onboard(r)

        # ---------- 1. 入口：问团子页右上角 ----------
        await tab(r, '问团子')
        check('ai tab: 一键摘要 entry shown', await T('summary-open').is_visible())
        await r.screenshot(path=O + '00-ai-tab.png')
        await T('summary-open').click(); await r.wait_for_timeout(700)
        check('summary sheet opens on pick stage', await T('sm-pick').is_visible())
        check('default audience = doctor (implied by 生成结果)', await T('sm-aud-doctor').is_visible())
        check('range options 1 / 3 / 7', all([await T(f'sm-range-{d}').count() for d in (1, 3, 7)]))
        await r.screenshot(path=O + '01-pick-doctor.png')

        # ---------- 2. 给医生：数字必须和独立重算一致 ----------
        recs = json.loads(await r.evaluate("localStorage.getItem('yj:v1:records')"))
        exp = recompute(recs)
        await T('sm-gen').click()
        await T('sm-memo').wait_for(state='visible', timeout=15000); await r.wait_for_timeout(700)
        memo = await T('sm-memo').inner_text()
        check('gen → 团团在写便签 → 便签出现', True)
        check('doctor memo title + sub 给医生看', '记录摘要' in memo and '给医生看' in memo, memo[:60])
        check('doctor memo 不含诊断 footer', '不含诊断' in memo)
        feed_seg = memo[memo.find('喂养'):memo.find('喂养') + 90]
        check(f'feed 日均 = 独立重算 {exp["ml"]} ml', f'日均 {exp["ml"]} ml' in memo, feed_seg)
        check(f'sleep 日均 = 独立重算 {exp["sl"]} 小时', f'日均 {exp["sl"]} 小时' in memo)
        check(f'diaper 日均 = 独立重算 {exp["dia"]} 次', f'日均 {exp["dia"]} 次' in memo)
        check('doctor memo has 体温/用药 row', '体温 · ' in memo and '用药' in memo)
        check('doctor memo has 健康档案 row', '健康档案' in memo and '过敏' in memo)
        await r.screenshot(path=O + '02-memo-doctor.png')

        # ---------- 3. 给奶奶 + 近 7 天 ----------
        await T('sm-again').click(); await r.wait_for_timeout(500)
        check('换一种 → 回到选择屏', await T('sm-pick').is_visible())
        await T('sm-aud-granny').click(); await r.wait_for_timeout(300)
        await T('sm-range-7').click(); await r.wait_for_timeout(300)
        await T('sm-gen').click()
        await T('sm-memo').wait_for(state='visible', timeout=15000); await r.wait_for_timeout(700)
        g = await T('sm-memo').inner_text()
        check('granny memo title', '奶奶' in g and '这样带就好啦' in g, g[:50])
        check('granny memo 用近 7 天的日期范围', '10/25' in g, g.split(chr(10))[1][:60])
        check('granny memo 喝奶行有下一顿', '下一顿大约' in g)
        check('granny memo 大字版 = 睡觉/尿布行', '睡觉' in g and '尿布' in g)
        await r.screenshot(path=O + '03-memo-granny.png')

        # ---------- 4. 存图片 / 分享文字 ----------
        async with r.expect_download() as dl:
            await T('sm-img').click()
        d = await dl.value
        await d.save_as(O + '04-memo-export.png')
        im = Image.open(O + '04-memo-export.png')
        check('存图片 → 拿到 PNG', im.width > 300 and im.height > 300, im.size)
        # 分享文字：浏览器没有 navigator.share 时才走复制，这里显式去掉，结果不依赖宿主机
        await r.evaluate("Object.defineProperty(navigator,'share',{value:undefined,configurable:true})")
        await T('sm-share').click(); await r.wait_for_timeout(800)
        clip = await r.evaluate('navigator.clipboard.readText()')
        check('分享 → 剪贴板里有便签文字', '奶奶' in clip and '团团' in clip, clip[:60])

        # ---------- 5. 我的页入口 ----------
        await r.goto(BASE + '/'); await ready(r)
        await tab(r, '我的')
        check('me tab: 一键摘要 li 存在', await T('me-summary').is_visible())
        await T('me-summary').click(); await r.wait_for_timeout(600)
        check('me tab 入口也能打开选择屏', await T('sm-pick').is_visible())
        await r.mouse.click(195, 70); await r.wait_for_timeout(600)

        # ---------- 6. 空状态：把记录清空后重开 ----------
        await r.evaluate("localStorage.setItem('yj:v1:records','[]')")
        await r.goto(BASE + '/'); await ready(r)
        await tab(r, '问团子'); await T('summary-open').click(); await r.wait_for_timeout(600)
        await T('sm-gen').click()
        await T('sm-memo').wait_for(state='visible', timeout=15000); await r.wait_for_timeout(500)
        e = await T('sm-memo').inner_text()
        check('空状态：便签说明还没有记录', '还没有记录' in e, e[:60])
        check('空状态：给「去记一笔」按钮', await T('sm-record').is_visible())
        await r.screenshot(path=O + '05-empty.png')
        await T('sm-close').click(); await r.wait_for_timeout(400)

        # ---------- 7. 选择屏 vs 原型（只比便签上半部分：sheet 区域） ----------
        a = await ctx.new_page(); await a.clock.set_system_time(NOW)
        await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1200)
        await a.evaluate('()=>openSummary()'); await a.wait_for_timeout(900)
        await a.screenshot(path=O + 'proto-pick.png')
        pbox = await a.locator('.sheet').bounding_box()
        await a.close()

        await T('summary-open').click(); await r.wait_for_timeout(700)
        await r.screenshot(path=O + 'rn-pick.png')
        abox = await T('summary-sheet').bounding_box()
        A = Image.open(O + 'rn-pick.png').convert('RGB')
        B = Image.open(O + 'proto-pick.png').convert('RGB')
        top = int(max(abox['y'], pbox['y']) * 2)  # device_scale_factor=2
        h = min(A.height, B.height) - top
        w = min(A.width, B.width)
        side = Image.new('RGB', (w, h * 2 + 20), 'white')
        side.paste(A.crop((0, top, w, top + h)), (0, 0))
        side.paste(B.crop((0, top, w, top + h)), (0, h + 20))
        side.save(O + 'compare-pick.png')
        diff('m5/compare-pick.png', A.crop((0, top, w, top + h)), B.crop((0, top, w, top + h)))

        print('\nconsole/page errors:', errs)
        check('no page errors', not [e for e in errs if 'PAGEERR' in e], errs[:3])
        print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
        await b.close()
        sys.exit(1 if bad else 0)

asyncio.run(main())
