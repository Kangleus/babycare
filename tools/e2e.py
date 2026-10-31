"""一句记 M1/M2 端到端测试：390x844，时钟固定从 2026-10-31 10:20 起走。
跑法：python3 -m http.server 8090 -d dist &  然后  /workspace/.venv-proto/bin/python tools/e2e.py"""
import asyncio, datetime, re, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
O='/workspace/yijuji-app/shots/'
FZ='*,*:before,*:after{animation:none!important;transition:none!important}'
ok=[];bad=[]
def check(name,cond,info=''):
  (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(info) if info else ''))
def side(a,b,o):
  A=Image.open(O+a).convert('RGB');B=Image.open(O+b).convert('RGB')
  c=Image.new('RGB',(A.width*2+20,max(A.height,B.height)),'white');c.paste(A,(0,0));c.paste(B,(A.width+20,0));c.save(O+o)
  d=ImageChops.difference(A,B.resize(A.size)).convert('L');px=sum(1 for v in d.getdata() if v>40)
  print(o,'differing px (>40):',f'{px/(A.width*A.height)*100:.2f}%')
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    r=await ctx.new_page();errs=[]
    r.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    r.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    await r.clock.set_system_time(datetime.datetime(2026,10,31,10,20,0))
    T=r.get_by_test_id
    async def shot(path,full=False): await r.wait_for_timeout(450); await r.screenshot(path=O+path,full_page=full)
    async def txt(id): return (await T(id).first.inner_text()).strip()
    async def count(): return int(re.match(r'(\d+)',await txt('tl-count')).group(1))
    async def home():
      await r.get_by_text('今天',exact=True).last.click(); await r.wait_for_timeout(500)

    # ---------- 1. onboarding ----------
    await r.goto('http://localhost:8090/'); await r.wait_for_timeout(3000)
    check('onboarding: consent page shown on first run', await T('ob-consent').is_visible())
    await shot('m2/01-onboarding-consent.png')
    check('consent: continue disabled until checked', await T('ob-continue').get_attribute('aria-disabled')=='true')
    await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(700)
    check('onboarding: profile page', await T('ob-profile').is_visible())
    await T('pf-bd').fill('2026-13-40'); await shot('m2/02-onboarding-profile-invalid.png')
    check('profile: invalid birthday blocks submit', await T('pf-submit').get_attribute('aria-disabled')=='true')
    await T('pf-name').fill('豆米'); await T('pf-bd').fill('2026-03-28'); await T('pf-gender-girl').click()
    await shot('m2/03-onboarding-profile.png')
    await T('pf-submit').click(); await r.wait_for_timeout(2000)
    check('home after onboarding', await T('tl-count').is_visible())
    check('age line computed from birthday', '7 个月 3 天' in await r.locator('body').inner_text())
    await shot('m1/01-home.png')
    # compare with prototype
    a=await ctx.new_page(); await a.goto('file:///workspace/yijuji-prototype/index.html'); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1800)
    await a.add_style_tag(content=FZ); await r.add_style_tag(content=FZ); await a.wait_for_timeout(300)
    await a.screenshot(path=O+'m1/proto-home.png'); await r.screenshot(path=O+'m1/rn-home.png'); side('m1/proto-home.png','m1/rn-home.png','m1/compare-home.png')
    # scrolled compare (the overlap zone)
    await a.evaluate("[...document.querySelectorAll('.page')].forEach(p=>p.scrollTop=420)")
    await a.wait_for_timeout(300); await a.screenshot(path=O+'m1/proto-home-scrolled.png')
    await r.mouse.move(195,500); await r.mouse.wheel(0,420); await r.wait_for_timeout(600); await r.screenshot(path=O+'m1/rn-home-scrolled.png')
    side('m1/proto-home-scrolled.png','m1/rn-home-scrolled.png','m1/compare-home-scrolled.png')
    await r.mouse.wheel(0,-2000); await r.wait_for_timeout(300)
    await a.close()
    # 解冻：RN-web 的 Modal 依赖 animationend 才会卸载，冻结样式只用于对比截图
    await r.evaluate("document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('animation:none!important'))s.remove()})")
    # pill must not overlap the hint row or the timeline title (layout check)
    await r.wait_for_timeout(1000)
    hint,pill,tlc=await r.evaluate("['hint','sample-pill','tl-count'].map(i=>{const b=document.querySelector(`[data-testid=${i}]`).getBoundingClientRect();return {y:b.y,height:b.height}})")
    check('sample pill below hint & above 今日时间线 (no overlap)', pill['y']>=hint['y']+hint['height'] and pill['y']+pill['height']<=tlc['y'], (hint,pill,tlc))

    # ---------- 2. add one record of each default type ----------
    lvl0=await txt('lvl')
    async def add(k,prep=None,name=None,expect_change=True):
      n0=await count(); v0=await txt(f'card-{k}-v'); s0=await txt(f'card-{k}-s')
      await T(f'plus-{k}').click(); await r.wait_for_timeout(700)
      check(f'{k}: quick-record sheet opens', await T('record-sheet').is_visible())
      if prep: await prep()
      await shot(f'm1/sheet-{name or k}.png')
      await T('rec-save').click(); await r.wait_for_timeout(450)
      if k=='feed': await r.screenshot(path=O+'m1/cele.png')
      await r.wait_for_timeout(2600)
      n1=await count(); v1=await txt(f'card-{k}-v'); s1=await txt(f'card-{k}-s')
      check(f'{k}: timeline +1', n1==n0+1, (n0,n1))
      if expect_change: check(f'{k}: card updated', (v0,s0)!=(v1,s1), (v0,s0,'→',v1,s1))
    async def feed():
      await T('ml-plus').click(); await T('ml-plus').click()
    await add('feed',feed)
    greet=await txt('greet'); check('greeting stats updated (4 顿奶)', '4' in greet, greet)
    async def sleep():
      for _ in range(9): await T('time-minus').click()
      await T('sleep-state-woke').click()
    await add('sleep',sleep)
    async def diaper(): await T('diaper-sub-both').click()
    await add('diaper',diaper)
    async def water(): await T('wml-plus').click()
    await add('water',water)
    async def med(): await T('med-益生菌').click()
    await add('med',med)
    async def temp():
      for _ in range(8): await T('temp-plus').click()
      await shot('m1/sheet-temp-37x-high.png')
      for _ in range(6): await T('temp-plus').click()
    await add('temp',temp,'temp-fever')
    check('temp card shows 偏高', '偏高' in await r.locator('body').inner_text())
    lvl1=await txt('lvl'); print('lvl',lvl0,'→',lvl1)
    await shot('m1/02-home-after-adds.png')
    await r.mouse.move(195,500); await r.mouse.wheel(0,700); await shot('m1/03-timeline-after-adds.png'); await r.mouse.wheel(0,-3000)
    check('records show who recorded (妈妈记)', await r.get_by_text('妈妈记').count()>0 or '妈妈' in await r.locator('body').inner_text())

    # ---------- 3. edit & delete ----------
    tl=r.locator('[data-testid^="tl-"]:not([data-testid^="tl-del"]):not([data-testid="tl-count"])')
    first=tl.first; await first.evaluate("e=>e.scrollIntoView({block:'center'})"); await r.wait_for_timeout(400); fid=(await first.get_attribute('data-testid'))[3:]
    await first.click(); await r.wait_for_timeout(700)
    check('tap timeline → edit sheet', await T('rec-delete').is_visible())
    await T('note').fill('E2E 改过'); await shot('m1/sheet-edit.png')
    await T('rec-save').click(); await r.wait_for_timeout(1200)
    check('edit saved (note in timeline)', await r.get_by_text('E2E 改过',exact=False).count()>0)
    n0=await count()
    item=T(f'tl-{fid}'); await item.evaluate("e=>e.scrollIntoView({block:'center'})"); await r.wait_for_timeout(400); bb=await item.bounding_box()
    await r.mouse.move(bb['x']+bb['width']*0.7,bb['y']+bb['height']/2); await r.mouse.down()
    for i in range(1,11): await r.mouse.move(bb['x']+bb['width']*0.7-12*i,bb['y']+bb['height']/2)
    await r.mouse.up(); await r.wait_for_timeout(700)
    await shot('m1/swipe-delete.png')
    await T(f'tl-del-{fid}').click(); await r.wait_for_timeout(700)
    check('swipe-left delete asks confirm', await T('confirm-sheet').is_visible())
    await shot('m1/confirm-delete.png')
    await T('confirm-ok').click(); await r.wait_for_timeout(1200)
    check('delete removes record', await count()==n0-1, (n0,await count()))

    # ---------- 4. trend ----------
    await r.mouse.wheel(0,-3000); await r.wait_for_timeout(300)
    await T('card-feed').click(); await r.wait_for_timeout(900)
    check('tap card → trend sheet', await T('trend-sheet').is_visible())
    await shot('m1/trend-feed-7d.png')
    await T('range-30').click(); await shot('m1/trend-feed-30d.png')
    await T('trend-close').click(); await r.wait_for_timeout(600)
    for k in ['sleep','temp']:
      await T(f'card-{k}').click(); await r.wait_for_timeout(900); await shot(f'm1/trend-{k}.png'); await T('trend-close').click(); await r.wait_for_timeout(600)
    await T('pred').scroll_into_view_if_needed(); await shot('m1/pred.png')

    # ---------- 5. change cards (+ optional sheets) ----------
    await T('edit-cards').click(); await r.wait_for_timeout(900)
    await T('slot-3').click(); await T('pool-pee').click(); await T('slot-4').click(); await T('pool-symptom').click(); await T('slot-5').click(); await T('pool-growth').click()
    await shot('m1/card-editor.png')
    await T('editor-ok').click(); await r.wait_for_timeout(900)
    for k in ['pee','symptom','growth']: check(f'card {k} on home', await T(f'card-{k}').count()==1)
    await shot('m1/04-home-new-cards.png')
    async def sym(): await T('sym-咳嗽').click()
    await add('pee',None); await add('symptom',sym)
    async def growth():
      await T('cm-plus').click(); await T('kg-plus').click()
    await add('growth',growth)
    # sample pill popup
    await T('sample-switch').scroll_into_view_if_needed(); await T('sample-switch').click(); await r.wait_for_timeout(600)
    check('换一句 opens samples popup', await T('samples-pop').is_visible()); await shot('m1/samples-pop.png')
    await T('sample-3').click(); await r.wait_for_timeout(400)

    # ---------- 6. reload persists ----------
    before=await count(); cards_before=[await r.locator('[data-testid^="card-"][data-testid$="-v"]').nth(i).get_attribute('data-testid') for i in range(6)]
    await r.reload(); await r.wait_for_timeout(3000)
    check('reload: still onboarded', await T('tl-count').is_visible())
    after=await count(); cards_after=[await r.locator('[data-testid^="card-"][data-testid$="-v"]').nth(i).get_attribute('data-testid') for i in range(6)]
    check('reload: records persisted', before==after, (before,after))
    check('reload: card selection persisted', cards_before==cards_after, cards_after)
    check('reload: edited sample persisted', (await txt('sample-pill')).find('「')>=0)

    # ---------- 7. 我的 ----------
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(900)
    await shot('m2/04-me.png'); await shot('m2/04-me-full.png',True)
    check('family shows 妈妈 (本机)', await T('member-local').is_visible())
    await T('me-profile').click(); await r.wait_for_timeout(900)
    await shot('m2/05-profile-edit.png')
    await T('pf-name').fill('小豆米'); await T('pf-av-crown').click(); await T('pf-gender-boy').click(); await T('pf-bd').fill('2026-04-01')
    await T('pf-submit').click(); await r.wait_for_timeout(900)
    check('profile edit saved', await txt('me-name')=='小豆米')
    await T('invite').click(); await r.wait_for_timeout(800); await shot('m2/06-invite-unavailable.png')
    check('invite shows 云端同步开通后可用', await r.get_by_text('云端同步开通后可用').count()>0); await T('invite-ok').click(); await r.wait_for_timeout(600)
    await T('login').click(); await r.wait_for_timeout(900); await shot('m2/07-login-not-connected.png')
    check('login page marked 未接入', await r.get_by_text('未接入 · 云端同步开通后可用').count()>0)
    await T('full-close').click(); await r.wait_for_timeout(700)
    await T('policy').scroll_into_view_if_needed(); await T('policy').click(); await r.wait_for_timeout(800); await shot('m2/08-policy.png'); await r.get_by_text('关闭',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('about').scroll_into_view_if_needed(); await T('about').click(); await r.wait_for_timeout(800); await shot('m2/09-about.png'); await r.get_by_text('关闭',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('night-toggle').scroll_into_view_if_needed(); await T('night-toggle').click(); await r.wait_for_timeout(900); await shot('m2/10-me-night.png')
    await home(); await r.wait_for_timeout(500); await shot('m2/11-home-night-renamed.png')
    check('home header uses new name', '小豆米' in await r.locator('body').inner_text())
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('night-toggle').click(); await r.wait_for_timeout(600)
    await T('reset-demo').scroll_into_view_if_needed(); await T('reset-demo').click(); await r.wait_for_timeout(700); await shot('m2/12-reset-confirm.png')
    await T('confirm-ok').click(); await r.wait_for_timeout(1200)
    await home(); n_demo=await count(); check('reset demo restores 12 demo events', n_demo==12, n_demo)
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('clear-all').scroll_into_view_if_needed(); await T('clear-all').click(); await r.wait_for_timeout(700); await shot('m2/13-clear-confirm-1.png')
    await T('confirm-ok').click(); await r.wait_for_timeout(1200); await shot('m2/14-clear-confirm-2.png')
    check('clear all asks twice', await T('confirm-sheet').is_visible())
    await T('confirm-ok').click(); await r.wait_for_timeout(1800)
    check('clear all → back to onboarding', await T('ob-consent').is_visible())
    await r.reload(); await r.wait_for_timeout(2500)
    check('after clear + reload still onboarding', await T('ob-consent').is_visible())

    print('\nconsole/page errors:',errs); check('no console errors', not errs, errs)
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    await b.close()
    sys.exit(1 if bad else 0)
asyncio.run(main())
