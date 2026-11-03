"""团子育儿本 M1/M2 端到端测试：390x844，时钟固定从 2026-10-31 10:20 起走。
跑法：npm run test:web（会自动构建 + 起服务 + 收尾），或先 npm run serve:web 再
     .venv/bin/python tools/e2e.py"""
import asyncio, datetime, re, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
import e2e_common as common
O = paths.O
BASE = paths.BASE_URL
PROTO = paths.require_proto()
FZ='*,*:before,*:after{animation:none!important;transition:none!important}'
ok=[];bad=[]
def check(name,cond,info=''):
  (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(info) if info else ''))
def side(a,b,o):
  A=Image.open(O+a).convert('RGB');B=Image.open(O+b).convert('RGB')
  c=Image.new('RGB',(A.width*2+20,max(A.height,B.height)),'white');c.paste(A,(0,0));c.paste(B,(A.width+20,0));c.save(O+o)
  d=ImageChops.difference(A,B.resize(A.size)).convert('L');px=sum(1 for v in d.getdata() if v>40)
  pct=px/(A.width*A.height)*100
  if paths.visual_report(o,pct): bad.append('visual '+o)

async def expected_avg(r,k,rng):
  """独立重算：范围内完整的天（不含今天），起点 = 这一类最早记录 / 同意协议 取早者；无记录的天按 0（体温只算有记录的天）"""
  import json
  recs=json.loads(await r.evaluate("localStorage.getItem('yj:v1:records')"))
  st=json.loads(await r.evaluate("localStorage.getItem('yj:v1:settings')"))
  loc=lambda iso: datetime.datetime.fromisoformat(iso.replace('Z','+00:00')).astimezone()
  today=datetime.datetime(2026,10,31).date()
  first=min([loc(x['time']).date() for x in recs if x['type']==k]+([loc(st['consentAt']).date()] if st.get('consentAt') else []))
  def val(d):
    rs=[x for x in recs if loc(x['time']).date()==d]
    if k=='feed': return sum((x['values'].get('ml') or 0) for x in rs if x['type']=='feed')
    if k=='bath': return sum(1 for x in rs if x['type']=='bath')
    if k=='temp':
      t=sorted([x for x in rs if x['type']=='temp'],key=lambda x:x['time']); return t[-1]['values']['v'] if t else None
  # 本期 = 今天往前 1..rng-1 天（柱子含今天，但今天不计）；上期 = rng..2rng-1 天前
  cur=[]; 
  for i in range(1,rng):
    d=today-datetime.timedelta(days=i)
    if d<first: continue
    v=val(d)
    if k=='temp':
      if v is not None: cur.append(v)
    else: cur.append(v)
  prev=[]
  for i in range(rng,2*rng):
    d=today-datetime.timedelta(days=i)
    if d<first: continue
    v=val(d)
    if k=='temp':
      if v is not None: prev.append(v)
    else: prev.append(v)
  A=lambda xs: sum(xs)/len(xs) if xs else None
  return A(cur),A(prev),len(cur)
def fmt_avg(k,v):
  if k=='temp': return '%.1f'%v
  if v<10 and abs(v-round(v))>1e-9: return '%.1f'%v
  return str(round(v))
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    # 正式版必须登录：用公共装置造出「已登录 + 有家庭 + 有 14 天记录」，不连真后端
    await common.install_routes(ctx); await common.seed_context(ctx)
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

    # ---------- 1. 已登录进首页（登录流程本身由 tools/e2e_onboarding.py 覆盖） ----------
    await common.login(r, BASE)
    check('home after login', await T('tl-count').is_visible())
    check('age line computed from birthday', '7 个月 3 天' in await r.locator('body').inner_text())
    await shot('m1/01-home.png')
    # compare with prototype
    a=await ctx.new_page(); await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1800)
    await a.add_style_tag(content=FZ); await r.add_style_tag(content=FZ); await a.wait_for_timeout(300)
    await a.screenshot(path=O+'m1/proto-home.png'); await r.screenshot(path=O+'m1/rn-home.png'); side('m1/proto-home.png','m1/rn-home.png','m1/compare-home.png')
    # scrolled compare (the overlap zone)
    await a.evaluate("[...document.querySelectorAll('.page')].forEach(p=>p.scrollTop=420)")
    await a.wait_for_timeout(300); await a.screenshot(path=O+'m1/proto-home-scrolled.png')
    # 用 scrollTop 精确设 420，和原型 .page 的 scrollTop=420 同口径；
    # 之前用滚轮会带惯性，取景多滚几十像素，对比虚高到 10%+
    await r.evaluate("""[...document.querySelectorAll('div')].filter(e=>e.scrollHeight>e.clientHeight+100&&getComputedStyle(e).overflowY!=='visible').forEach(e=>{e.scrollTop=420})""")
    await r.wait_for_timeout(600); await r.screenshot(path=O+'m1/rn-home-scrolled.png')
    side('m1/proto-home-scrolled.png','m1/rn-home-scrolled.png','m1/compare-home-scrolled.png')
    await r.mouse.wheel(0,-2000); await r.wait_for_timeout(300)
    await a.close()
    # 解冻：RN-web 的 Modal 依赖 animationend 才会卸载，冻结样式只用于对比截图
    await r.evaluate("document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('animation:none!important'))s.remove()})")
    # pill must not overlap the hint row or the timeline title (layout check)
    await r.wait_for_timeout(1000)
    hint,pill,tlc=await r.evaluate("['hint','sample-pill','tl-count'].map(i=>{const b=document.querySelector(`[data-testid=${i}]`).getBoundingClientRect();return {y:b.y,height:b.height}})")
    check('sample pill below hint & above 今日时间线 (no overlap)', pill['y']>=hint['y']+hint['height'] and pill['y']+pill['height']<=tlc['y'], (hint,pill,tlc))


    async def open_trend(k):
      if k=='temp':  # M4：首页体温卡片进健康页，趋势从健康页「看趋势」打开
        await T('card-temp').click(); await r.wait_for_timeout(900)
        await T('h-trend-temp').first.click(); await r.wait_for_timeout(900)
      else: await T(f'card-{k}').click(); await r.wait_for_timeout(900)
    async def close_trend(k):
      await T('trend-close').click(); await r.wait_for_timeout(600)
      if k=='temp': await home()
    async def check_trend(k,rngs=(7,30)):
      await open_trend(k)
      for rng in rngs:
        await T(f'range-{rng}').click(); await r.wait_for_timeout(300)
        cur,prev,n=await expected_avg(r,k,rng)
        shown=await txt('trend-avg'); cmp=await txt('trend-cmp')
        check(f'trend {k} {rng}d avg = {fmt_avg(k,cur)} over {n} days (zeros counted, pre-start days skipped)', shown==fmt_avg(k,cur), (shown,cur,cmp))
        if prev is None: check(f'trend {k} {rng}d: previous period empty', '还没有记录' in cmp, cmp)
        else: check(f'trend {k} {rng}d prev avg {fmt_avg(k,prev)} in comparison', ('日均 '+fmt_avg(k,prev)) in cmp, cmp)
      await shot(f'm1/trend-{k}-avg.png')
      await close_trend(k)
    # ---------- 1b. trend averages on fresh demo data ----------
    await check_trend('feed'); await check_trend('temp')

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
      await open_trend(k); await shot(f'm1/trend-{k}.png'); await close_trend(k)
    await T('pred').scroll_into_view_if_needed(); await shot('m1/pred.png')

    # ---------- 5. change cards (+ optional sheets) ----------
    await T('edit-cards').click(); await r.wait_for_timeout(900)
    await T('slot-3').click(); await T('pool-pee').click(); await T('slot-4').click(); await T('pool-symptom').click(); await T('slot-5').click(); await T('pool-growth').click(); await T('slot-2').click(); await T('pool-bath').click()
    await shot('m1/card-editor.png')
    await T('editor-ok').click(); await r.wait_for_timeout(900)
    for k in ['pee','symptom','growth','bath']: check(f'card {k} on home', await T(f'card-{k}').count()==1)
    await check_trend('bath')
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
    # CI 的 runner 没有缓存，冷启动比本机慢（实测 3 秒不够）。这里等元素出现而不是睡固定时长：
    # 状态真丢了的话 20 秒也等不到，用例照样失败，只是失败得更慢。
    await r.reload()
    try:
      await T('tl-count').wait_for(state='visible', timeout=60000); still_onboarded=True
    except Exception:
      still_onboarded=False
      print('  [diag] reload 后 60s 内 tl-count 仍不可见')
      print('  [diag] body:', (await r.locator('body').inner_text())[:200].replace(chr(10),' | '))
      print('  [diag] ob-welcome visible:', await T('ob-welcome').is_visible())
      print('  [diag] tl-count 存在:', await T('tl-count').count())
    check('reload: still onboarded', still_onboarded)
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
    # 正式版必须登录才能用：这里已经是登录态，所以「邀请家人」直接出邀请码；
    # 「未登录时提示去登录」的场景改由 tools/e2e_onboarding.py 覆盖（欢迎页 → 注册）。
    await T('invite').click(); await r.wait_for_timeout(900); await shot('m2/06-invite.png')
    code = ''.join([await T(f'invite-c{i}').inner_text() for i in range(6)])
    check('invite: 已登录 → 6 位邀请码 + 48 小时有效期', len(code.strip()) == 6 and '48 小时' in await txt('invite-exp'), code)
    await T('invite-ok').click(); await r.wait_for_timeout(600)
    check('我的：显示已登录账号', 'e2e@test.local' in await r.locator('body').inner_text())
    await T('policy').scroll_into_view_if_needed(); await T('policy').click(); await r.wait_for_timeout(800); await shot('m2/08-policy.png'); await r.get_by_text('我知道了',exact=True).last.click(); await r.wait_for_timeout(700)
    body=await r.locator('body').inner_text()
    check('我的：没有「清空全部数据 / 重置演示数据」', '清空全部数据' not in body and '重置演示数据' not in body)
    check('我的：账号区 邮箱 / 修改密码 / 退出登录 / 注销账号', all(await T(t).count()==1 for t in ['account','change-pw','sign-out','delete-account']))
    await T('night-toggle').scroll_into_view_if_needed(); await T('night-toggle').click(); await r.wait_for_timeout(900); await shot('m2/10-me-night.png')
    await home(); await r.wait_for_timeout(500); await shot('m2/11-home-night-renamed.png')
    check('home header uses new name', '小豆米' in await r.locator('body').inner_text())
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(700)
    await T('night-toggle').click(); await r.wait_for_timeout(600)
    # 必须登录才能用：「清空全部数据」已移除；退出登录 → 确认 → 回欢迎页，本机数据清空（注销见 tools/e2e_onboarding.py）
    await T('sign-out').scroll_into_view_if_needed(); await T('sign-out').click(); await r.wait_for_timeout(700); await shot('m2/13-logout-confirm.png')
    check('退出登录先确认', '退出登录？' in await r.locator('body').inner_text())
    await T('confirm-ok').click(); await r.wait_for_timeout(2000)
    check('退出登录 → 回到欢迎页', await T('ob-welcome').is_visible())
    await r.reload(); await r.wait_for_timeout(3000)
    check('退出 + reload 仍在欢迎页', await T('ob-welcome').is_visible())

    print('\nconsole/page errors:',errs); check('no console errors', not errs, errs)
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    await b.close()
    sys.exit(1 if bad else 0)
asyncio.run(main())
