"""M3 语音一句话记录 e2e（Web 构建，端口 8090）：
1) 打字兜底（未登录 → 本地规则解析）：拆两条 / 追问奶量 / 体温+用药风险框 / 一句话修改 / 无关话 / 点卡片编辑
2) 按住团子（Chrome 假麦克风）：听写浮层、上滑取消、短按提示、松手 → 整理中 → 未登录时转打字
3) 登录测试账号 A 后：按住说话 → 线上 Edge Function voice-parse（百炼 key 未配置时 503）→ 转打字；打字 → 云端不可用时本地兜底
4) 和原型确认卡并排截图（shots/m3/cmp-*.png）
跑法：npm run serve:web 之后 .venv/bin/python tools/e2e_m3.py（需要 .env.test 与真实测试账号）"""
import asyncio, datetime, re
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
O = paths.sub('m3')
import os; os.makedirs(O,exist_ok=True)
env=dict(l.split('=',1) for l in open(str(paths.ENV_TEST)).read().split('\n') if '=' in l)
ok=[];bad=[]
def check(name,cond,info=''):
  (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(info) if info and not cond else ''))
def side(a,b,o):
  A=Image.open(O+a).convert('RGB');B=Image.open(O+b).convert('RGB')
  c=Image.new('RGB',(A.width+B.width+40,max(A.height,B.height)+70),'white');c.paste(A,(0,70));c.paste(B,(A.width+40,70))
  d=ImageDraw.Draw(c); f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',30)
  d.text((20,18),'原型 index.html',fill='#4A3A2E',font=f); d.text((A.width+60,18),'App（Web 构建）',fill='#4A3A2E',font=f); c.save(O+o)
NOW=datetime.datetime(2026,11,1,18,10,0)

async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f"--use-file-for-fake-audio-capture={paths.ROOT / 'tools/voice/fake-mic.wav'}"])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Asia/Shanghai',permissions=['microphone'])
    # ---------- 原型：同样几句话的确认卡 ----------
    a=await ctx.new_page(); await a.clock.set_system_time(NOW)
    await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1500)
    async def proto(i,name):
      await a.evaluate(f'()=>{{window.__noAutosave=true;openConfirm(parse(SAMPLES[{i}].text))}}'); await a.wait_for_timeout(900); await a.screenshot(path=O+name)
      await a.evaluate("()=>{const b=[...document.querySelectorAll('.sheet button')].find(x=>/撤销|算了/.test(x.textContent));b&&b.click()}"); await a.wait_for_timeout(700)
    await proto(0,'proto-split.png'); await proto(1,'proto-clar.png'); await proto(6,'proto-fever.png'); await proto(4,'proto-update.png')
    box=await a.locator('#mic').bounding_box(); await a.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2); await a.mouse.down(); await a.wait_for_timeout(1300)
    await a.screenshot(path=O+'proto-listen.png'); await a.mouse.up(); await a.wait_for_timeout(300); await a.screenshot(path=O+'proto-thinking.png'); await a.wait_for_timeout(1500)
    await a.close()

    # ---------- App ----------
    r=await ctx.new_page(); errs=[]
    r.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    r.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    await r.clock.set_system_time(NOW)
    T=r.get_by_test_id
    async def shot(p,w=450): await r.wait_for_timeout(w); await r.screenshot(path=O+p)
    async def body(): return await r.locator('body').inner_text()
    async def count(): return int(re.match(r'(\d+)',(await T('tl-count').inner_text()).strip()).group(1))
    await r.goto(BASE+'/'); await r.wait_for_timeout(2500)
    await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(600)
    await T('pf-name').fill('豆米'); await T('pf-bd').fill('2026-03-28'); await T('pf-gender-girl').click(); await T('pf-submit').click(); await r.wait_for_timeout(2500)
    async def typed(text, open_from='samples'):
      if open_from=='samples':
        await T('sample-switch').scroll_into_view_if_needed(); await T('sample-switch').click(); await r.wait_for_timeout(500); await T('sample-type').click(); await r.wait_for_timeout(500)
      await T('type-input').fill(text); await T('type-go').click(); await T('voice-sheet').wait_for(timeout=8000); await r.wait_for_timeout(300)

    # 1) 一句话拆两条（本地规则）
    await T('sample-switch').scroll_into_view_if_needed(); await T('sample-switch').click(); await r.wait_for_timeout(500)
    check('samples popup has 打一句话 entry', await T('sample-type').is_visible()); await shot('01-samples-type-entry.png')
    await T('sample-type').click(); await r.wait_for_timeout(500); await shot('02-type-sheet.png')
    check('type sheet opens', await T('type-sheet').is_visible())
    n0=await count()
    await T('type-input').fill('十点喝了 120 毫升奶，拉了一次'); await T('type-go').click(); await T('voice-sheet').wait_for(timeout=8000)
    await shot('03-confirm-split.png',300)
    t=await body()
    check('confirm: 听到啦 + 原话', '听到啦！' in t and '「十点喝了 120 毫升奶，拉了一次」' in t)
    check('confirm: 拆出 2 条记录 + 本地规则', '拆出 2 条记录' in t and '本地规则解析' in t, t[:300])
    check('confirm: 喂奶 120ml + 换尿布 · 便便 @10:00', '喂奶 120ml' in t and '换尿布 · 便便' in t and '10:00' in t)
    check('confirm: autosave hint', '3 秒后自动保存 · 点卡片可以改' in t)
    side('proto-split.png','03-confirm-split.png','cmp-split.png')
    # 点卡片 → 编辑器（暂停自动保存）→ +10ml
    await T('voice-rc-0').click(); await r.wait_for_timeout(500)
    await T('v-ml-plus').click(); await r.wait_for_timeout(200); await shot('04-confirm-edit.png')
    t=await body(); check('edit: paused autosave text', '已暂停自动保存' in t); check('edit: ml stepper 130', '130 ml' in t)
    await r.wait_for_timeout(3300); check('edit: no autosave while paused', await T('voice-sheet').is_visible())
    await T('voice-save').click(); await r.wait_for_timeout(2600)
    check('commit: 2 records added', await count()==n0+2, (n0,await count()))
    t=await body(); check('commit: timeline shows 130ml', '130' in t)

    # 2) 追问奶量
    await typed('刚喂了一瓶奶'); await shot('05-confirm-clar.png',300)
    t=await body(); check('clarify: 差一点点就记好啦 + 追问', '差一点点就记好啦' in t and '喝了多少毫升呀' in t and await T('voice-clar').is_visible())
    check('clarify: options 120/150/180/210', all([await T(f'clar-{v}').is_visible() for v in (120,150,180,210)]))
    side('proto-clar.png','05-confirm-clar.png','cmp-clar.png')
    n1=await count(); await T('clar-150').click(); await r.wait_for_timeout(500); await shot('06-clar-answered.png',100)
    check('clarify answered → 喂奶 150ml', '喂奶 150ml' in await body())
    await r.wait_for_timeout(3300); await r.wait_for_timeout(2000)
    check('autosave after 3s commits', await count()==n1+1, (n1,await count()))

    # 3) 体温 + 用药（风险框，不给剂量）
    await typed('38度5，刚吃了一次退烧药'); await shot('07-confirm-fever.png',300)
    t=await body()
    check('fever: risk box + 及时就医', '38.5℃ 已帮你记下' in t and '及时就医' in t)
    check('fever: no dose, 只记你说的', '剂量按医嘱 · 只记你说的' in t and '团团不判断病情' in t)
    side('proto-fever.png','07-confirm-fever.png','cmp-fever.png')
    await T('voice-save').click(); await r.wait_for_timeout(2700)
    check('fever commit toast', '已记入健康档案' in await body())
    await r.wait_for_timeout(2000)
    # 37.6 偏高
    await typed('量了体温三十七度六'); t=await body(); await shot('08-confirm-high.png',200)
    check('37.6 → 偏高 tag, no 就医 risk box', '偏高' in t and '已帮你记下' not in t)
    await T('voice-undo').click(); await r.wait_for_timeout(500); check('undo toast', '已撤销，这句话没有写入记录' in await body())
    await r.wait_for_timeout(2400)

    # 4) 一句话修改
    await typed('刚才那次是150不是120'); await shot('09-confirm-update.png',300)
    t=await body(); check('update: action update + diff', 'action: update' in t and '→ 150ml' in t, t[:400])
    side('proto-update.png','09-confirm-update.png','cmp-update.png')
    await T('voice-undo').click(); await r.wait_for_timeout(2600)

    # 5) 问剂量 / 无关话
    await typed('该给宝宝喂多少水'); await shot('10-confirm-advice.png',300)
    t=await body(); check('advice question → nothing recorded + 只负责记录', '这句话里没找到要记的' in t and '团团只负责记录' in t)
    await T('voice-cancel').click(); await r.wait_for_timeout(400)
    await typed('今天天气真好'); check('irrelevant → none', '这句话里没找到要记的' in await body()); await T('voice-cancel').click(); await r.wait_for_timeout(2400)

    # 6) 未登录：按住团子 → 直接转打字（不白录）
    mic=await T('mic').bounding_box(); cx,cy=mic['x']+mic['width']/2,mic['y']+mic['height']/2
    await r.mouse.move(cx,cy); await r.mouse.down(); await r.wait_for_timeout(200); await r.mouse.up(); await r.wait_for_timeout(300)
    check('short press → 要按住团子说话哦～', '要按住团子说话哦' in await body()); await r.wait_for_timeout(2400)
    await r.mouse.move(cx,cy); await r.mouse.down(); await r.wait_for_timeout(900); await r.mouse.up()
    await T('type-sheet').wait_for(timeout=8000); await shot('14-signed-out-type.png',300)
    check('signed out: hold mic → 打字 with reason', '登录并加入家庭后可以用 AI 语音' in await body())
    await T('type-cancel').click(); await r.wait_for_timeout(400)

    # 7) 登录 A → 线上 voice-parse
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('login').click(); await r.wait_for_timeout(800)
    await T('login-email').fill(env['YJ_IT_A'].strip()); await T('login-password').fill(env['YJ_IT_PASSWORD'].strip())
    await T('login-go').click(); await T('family-page').wait_for(timeout=15000); await r.wait_for_timeout(2500)
    check('A logged in + linked to family', await T('family-done').is_visible())
    await T('family-done').click(); await r.wait_for_timeout(1500)
    await r.get_by_text('今天',exact=True).last.click(); await r.wait_for_timeout(1200)
    # 8) 已登录：按住团子（Chrome 假麦克风）
    await r.mouse.move(cx,cy); await r.mouse.down(); await r.wait_for_timeout(1400)
    check('hold → listen overlay', await T('listen-ov').is_visible()); await shot('11-listen.png',100)
    check('listen: 团团在听… + 松开就记好 · 上滑取消', '团团在听' in await body() and '松开就记好 · 上滑取消' in await body())
    side('proto-listen.png','11-listen.png','cmp-listen.png')
    await r.mouse.move(cx,cy-130,steps=6); await r.wait_for_timeout(300); await shot('12-listen-cancel.png',100)
    check('slide up → cancel hint', '松开手指，取消这次录音' in await body())
    await r.mouse.up(); await r.wait_for_timeout(500)
    check('cancel → toast, nothing saved', '已取消，没有保存任何记录' in await body() and not await T('listen-ov').is_visible()); await r.wait_for_timeout(2400)
    async def hold_say(ms=2200, first_shot=None):
      for attempt in range(3):
        await r.mouse.move(cx,cy); await r.mouse.down(); await r.wait_for_timeout(ms); await r.mouse.up(); await r.wait_for_timeout(120)
        if first_shot: await shot(first_shot,0)
        for _ in range(100):
          if await T('type-sheet').is_visible() or await T('voice-sheet').is_visible(): return attempt
          if '没录到声音' in await body(): break
          await r.wait_for_timeout(200)
        print('   (麦克风首帧为空，重试)'); await r.wait_for_timeout(2600)
      return -1
    calls=[]; r.on('response',lambda q: calls.append(q.status) if 'functions/v1/voice-parse' in q.url else None)
    await hold_say(2500,'13-thinking.png')
    side('proto-thinking.png','13-thinking.png','cmp-thinking.png')
    await T('type-sheet').wait_for(timeout=20000); await r.wait_for_timeout(300); await shot('15-cloud-voice.png',100)
    check('signed in: audio POSTed to voice-parse', len(calls)>=1, calls)
    t=await body(); print('   function status',calls)
    check('signed in: function says AI 未配置 → 打字兜底', 503 in calls and '打一句话也行' in t, calls)
    await T('type-input').fill('八点喝了150毫升奶然后睡着了'); await T('type-go').click(); await T('voice-sheet').wait_for(timeout=20000); await shot('16-cloud-text.png',300)
    t=await body(); check('signed in: typed → confirm card (AI or local fallback)', '拆出 2 条记录' in t, t[:300])
    await T('voice-save').click(); await r.wait_for_timeout(3000)
    fatal=[e for e in errs if 'PAGEERR' in e]
    check('no page errors', not fatal, fatal[:3])
    other=[e for e in errs if 'PAGEERR' not in e and 'voice-parse' not in e and '503' not in e]
    if other: print('   console:', other[:5])
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    await b.close()
asyncio.run(main())
