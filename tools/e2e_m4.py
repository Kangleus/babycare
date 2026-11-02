"""团子育儿本 M4 健康 Tab 端到端（本地 / 未登录）：390x844，时钟从 2026-10-31 10:20 起。
跑法：npm run test:web（会自动构建 + 起服务 + 收尾），或先 npm run serve:web 再
     .venv/bin/python tools/e2e_m4.py"""
import asyncio, datetime, json, re, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
O = paths.sub('m4')
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

async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,accept_downloads=True)
    await ctx.grant_permissions(['clipboard-read','clipboard-write'],origin=BASE)
    r=await ctx.new_page();errs=[]
    r.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    r.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    await r.clock.set_system_time(datetime.datetime(2026,10,31,10,20,0))
    T=r.get_by_test_id
    async def shot(path,full=False): await r.wait_for_timeout(450); await r.screenshot(path=O+path,full_page=full)
    async def body(): return await r.locator('body').inner_text()
    async def tab(n): await r.get_by_text(n,exact=True).last.click(); await r.wait_for_timeout(900)
    async def into(id): await T(id).first.evaluate("e=>e.scrollIntoView({block:'center'})"); await r.wait_for_timeout(350)
    async def count(): return int(re.match(r'(\d+)',(await T('tl-count').first.inner_text()).strip()).group(1))
    async def health_store(): return json.loads(await r.evaluate("localStorage.getItem('yj:v1:health')") or '{}')
    async def recs(): return json.loads(await r.evaluate("localStorage.getItem('yj:v1:records')"))
    def in_view(bb): return bb and 0<=bb['y']<844

    # ---------- onboarding (demo data) ----------
    await r.goto(BASE+'/'); await r.wait_for_timeout(2500)
    await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(600)
    await T('pf-name').fill('豆米'); await T('pf-bd').fill('2026-03-28'); await T('pf-gender-girl').click(); await T('pf-submit').click(); await r.wait_for_timeout(2200)

    # ---------- 1. home 体温卡片 → 健康 · 病程记录 ----------
    await T('card-temp').click(); await r.wait_for_timeout(1200)
    check('home temp card → 健康 tab', await T('ill-tab').count()==1 and await T('sugg').count()==1)
    check('jumped to 病程记录 section (segbig in view)', in_view(await T('ht-ill').bounding_box()), await T('ht-ill').bounding_box())
    await shot('01-from-home-temp.png')
    await tab('今天'); await T('card-med').click(); await r.wait_for_timeout(1000)
    check('home med card → 健康', await T('ill-tab').count()==1)

    # ---------- 2. side-by-side with prototype ----------
    await r.evaluate("document.querySelectorAll('[data-testid=sugg]')[0]")  # noop
    await r.mouse.move(195,500); await r.mouse.wheel(0,-6000); await r.wait_for_timeout(600)
    a=await ctx.new_page(); await a.goto(PROTO); await a.wait_for_function('window.__ready'); await a.wait_for_timeout(1500)
    await a.evaluate("go('health')"); await a.wait_for_timeout(900)
    await a.add_style_tag(content=FZ); await r.add_style_tag(content=FZ); await a.wait_for_timeout(300)
    await a.screenshot(path=O+'proto-health.png'); await r.screenshot(path=O+'rn-health.png'); side('proto-health.png','rn-health.png','compare-health.png')
    for i,y in enumerate([700,1500,2300],1):
      await a.evaluate(f"document.querySelector('#p-health').scrollTop={y}"); await a.wait_for_timeout(300); await a.screenshot(path=O+f'proto-health-{i}.png')
      await r.mouse.wheel(0,-9000); await r.wait_for_timeout(200); await r.mouse.wheel(0,y); await r.wait_for_timeout(700); await r.screenshot(path=O+f'rn-health-{i}.png')
      side(f'proto-health-{i}.png',f'rn-health-{i}.png',f'compare-health-{i}.png')
    await a.evaluate("go('health');setHT('vax')"); await a.wait_for_timeout(500)
    await a.evaluate("document.querySelector('#p-health').scrollTop=document.querySelector('#h-ill').offsetTop-64"); await a.wait_for_timeout(300); await a.screenshot(path=O+'proto-health-vax.png')
    await T('ht-vax').click(); await r.wait_for_timeout(500); await into('ht-vax'); await r.mouse.wheel(0,250); await r.wait_for_timeout(500); await r.screenshot(path=O+'rn-health-vax.png')
    side('proto-health-vax.png','rn-health-vax.png','compare-health-vax.png')
    await a.close()
    await r.evaluate("document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('animation:none!important'))s.remove()})")
    await T('ht-ill').click(); await r.wait_for_timeout(400)
    await r.mouse.wheel(0,-9000); await r.wait_for_timeout(400)

    # ---------- 3. 团团建议 ----------
    t=await T('sugg').inner_text()
    check('suggestions: every card says 仅供参考', t.count('仅供参考')>=await r.locator('[data-testid^=sg-]:not([data-testid$=-add]):not([data-testid$=-no])').count(), t.count('仅供参考'))
    check('suggestions: plan vaccine card cites 国家免疫规划（参考）', '国家免疫规划（参考）' in t)
    check('suggestions: no dose / water amount wording', not re.search(r'\d+\s*(ml|毫升|mg|毫克)',t), t)
    await shot('02-suggestions.png')
    await T('sg-plan-add').click(); await r.wait_for_timeout(900)
    h=await health_store(); pr=[x for x in h['reminders'] if x['source']=='plan' and 'mmr-1' in (x.get('planKey') or '')]
    check('suggestion 加入提醒 → plan reminder created & confirmed', len(pr)==1 and pr[0]['confirmed'], pr)
    check('rem card lists 麻腮风', '麻腮风' in await T('rem-card').inner_text())
    await T('sg-nofever-no').click(); await r.wait_for_timeout(700)
    check('知道了 hides the card', await T('sg-nofever').count()==0)

    # ---------- 4. 新建用药提醒 → 点开 → 已喂 ----------
    n_med=len([x for x in await recs() if x['type']=='med'])
    await into('rem-new'); await T('rem-new').click(); await r.wait_for_timeout(800)
    check('reminder editor opens', await T('rem-sheet').is_visible())
    check('med reminder editor: no dose/interval suggestion, says 按医嘱', '不会建议剂量' in await T('rem-sheet').inner_text())
    await T('rem-title').fill('喂益生菌'); await T('rem-rep-daily').click()
    await shot('03-reminder-editor.png')
    await T('rem-save').click(); await r.wait_for_timeout(900)
    h=await health_store(); rem=[x for x in h['reminders'] if x['title']=='喂益生菌']
    check('reminder saved (daily, user time 11:30)', len(rem)==1 and rem[0]['repeat']=='daily' and datetime.datetime.fromisoformat(rem[0]['dueAt'].replace('Z','+00:00')).astimezone().strftime('%H:%M')=='11:30', rem)
    rid=rem[0]['id']
    await into(f'rem-{rid}'); await T(f'rem-{rid}').click(); await r.wait_for_timeout(800)
    check('tap med reminder → one-tap 已喂', await T('rem-fed').is_visible())
    await shot('04-reminder-fed.png')
    await T('rem-fed').click(); await r.wait_for_timeout(1000)
    rs=await recs(); meds=[x for x in rs if x['type']=='med']
    check('已喂 adds one med record (name from reminder, no dose)', len(meds)==n_med+1 and any(x['values'].get('name')=='益生菌' for x in meds), [x['values'] for x in meds][-2:])
    h=await health_store(); rem=[x for x in h['reminders'] if x['id']==rid][0]
    check('已喂 marks this occurrence done by 妈妈', rem['doneAt'] and rem['doneBy']=='妈妈', rem)
    check('daily reminder stays in 待办 for next time (明天)', '明天 11:30' in await T(f'rem-{rid}').inner_text(), await T(f'rem-{rid}').inner_text())

    # ---------- 5. 到点横幅（App 内 / Web 兜底）----------
    await into('rem-new'); await T('rem-new').click(); await r.wait_for_timeout(700)
    await T('rem-title').fill('喂维生素 AD')
    for _ in range(5): await T('rem-time-minus').click()   # 11:30 → 10:15，刚到点
    await T('rem-save').click(); await r.wait_for_timeout(1500)
    check('due reminder rings: 团团横幅 shows', await T('rbanner').is_visible())
    check('banner offers 已喂 for med reminder', await T('ring-fed').is_visible())
    await shot('05-ring-banner.png')
    await T('ring-later').click(); await r.wait_for_timeout(900)
    bb=await T('rbanner').bounding_box()
    check('10 分钟后 hides banner', bb is None or bb['y']+bb['height']<5, bb)
    pnow=await r.evaluate('Date.now()')
    await r.clock.set_system_time(datetime.datetime.fromtimestamp(pnow/1000+11*60)); await r.wait_for_timeout(32000)
    check('snoozed reminder rings again after 10 min', in_view(await T('rbanner').bounding_box()))
    n_med=len([x for x in await recs() if x['type']=='med'])
    await T('ring-fed').click(); await r.wait_for_timeout(1000)
    check('banner 已喂 → med record + reminder done', len([x for x in await recs() if x['type']=='med'])==n_med+1)
    await r.wait_for_timeout(1200)
    if in_view(await T('rbanner').bounding_box()):  # 10:30 的「喂维生素 D」接着到点
      check('next due reminder (喂维生素 D 10:30) rings too', '维生素 D' in await T('rbanner').inner_text())
      await T('ring-done').click(); await r.wait_for_timeout(900)
    h=await health_store(); vd=[x for x in h['reminders'] if x['title']=='喂维生素 D'][0]
    check('completed reminder records who completed (妈妈)', vd['doneBy']=='妈妈', vd)

    # ---------- 6. 病程：开始 → 首页记体温自动归入 ----------
    await into('ep-new'); await T('ep-new').click(); await r.wait_for_timeout(700)
    await T('ep-quick-发烧').click(); await shot('06-episode-new.png')
    await T('ep-save').click(); await r.wait_for_timeout(900)
    check('active episode shown (进行中)', '进行中 · 第 1 天' in await T('ill-tab').inner_text())
    await tab('今天'); n0=await count()
    await T('plus-temp').click(); await r.wait_for_timeout(700)
    for _ in range(16): await T('temp-plus').click()
    await T('rec-save').click(); await r.wait_for_timeout(2800)
    check('home: temp record added once', await count()==n0+1)
    await T('card-temp').click(); await r.wait_for_timeout(1200)
    tl=await T('ep-tl').inner_text()
    check('home temp auto-attached to active episode timeline', '体温 38.' in tl, tl[:120])
    check('active episode also lists today\'s earlier temp & meds', '益生菌' in tl and '36.9' in tl, tl[:200])
    check('no double entry: records store has the temp once', len([x for x in await recs() if x['type']=='temp' and x['values']['v']>=38 and x['time']>='2026-10-31'])==1)
    await r.mouse.wheel(0,-9000); await r.wait_for_timeout(500)
    t=await T('sugg').inner_text()
    check('≥38℃ → prominent 及时就医 card (仅供参考)', '及时就医' in t and await T('sg-fever').count()==1, t[:160])
    await shot('07-fever-suggestion.png')
    await into('curve-card'); await shot('08-episode-curve.png')
    await T('ep-visit').click(); await r.wait_for_timeout(700)
    await T('visit-title').fill('社区医院儿科'); await T('visit-note').fill('多喝水观察'); await T('visit-save').click(); await r.wait_for_timeout(900)
    check('visit added to episode timeline', '社区医院儿科' in await T('ep-tl').inner_text())

    # ---------- 7. 给医生看 ----------
    await T('ep-doctor').click(); await r.wait_for_timeout(1000)
    m=await T('memo').inner_text()
    check('doctor sheet: 体温 / 用药 / 症状? / 就诊 rows', all(k in m for k in ['体温','用药','就诊','过敏']), m[:200])
    check('doctor sheet: med times listed', re.search(r'\d\d:\d\d 益生菌',m) is not None, m)
    check('doctor sheet: 不含诊断 · 仅供参考 footer', '不含诊断' in m and '仅供参考' in m)
    await shot('09-doctor-sheet.png')
    await T('doctor-text').click(); await r.wait_for_timeout(700)
    clip=await r.evaluate('navigator.clipboard.readText()')
    check('share text → clipboard summary', '【体温' in clip and '不含诊断' in clip, clip[:80])
    async with r.expect_download() as dl: await T('doctor-img').click()
    d=await dl.value; await d.save_as(O+'10-doctor-summary-export.png')
    im=Image.open(O+'10-doctor-summary-export.png'); check('share image → PNG of the memo', im.width>300 and im.height>300, im.size)
    await T('doctor-close').click(); await r.wait_for_timeout(700)

    # ---------- 8. 康复 → 归档 → 浏览过往 ----------
    await into('ep-open'); await T('ep-open').click(); await r.wait_for_timeout(700)
    await T('ep-recover').click(); await r.wait_for_timeout(1000)
    t=await T('ill-tab').inner_text()
    check('recovered: no active episode, archived in 过往病程', '进行中' not in t and await T('past-list').count()==1, t[:120])
    h=await health_store(); ep=[e for e in h['episodes'] if e['title']=='发烧'][0]
    check('episode status recovered + end date', ep['status']=='recovered' and ep['endDate']=='2026-10-31', ep)
    await T(f"past-demo-ep1").click(); await r.wait_for_timeout(600)
    check('browse past episode (幼儿急疹 curve + timeline)', '退烧 · 前胸后背出疹' in await T('past-tl').inner_text())
    await into('past-list'); await shot('11-past-episodes.png')

    # ---------- 9. 疫苗 · 体检 · 过敏 ----------
    await into('ht-vax'); await T('ht-vax').click(); await r.wait_for_timeout(600)
    v=await T('vax-card').inner_text()
    check('vaccine list: given + 流感 自费 + pending (参考)', '已接种' in v and '流感疫苗 第 1 剂' in v and '参考' in v, v[:200])
    await T('vax-new').click(); await r.wait_for_timeout(700)
    await T('vax-name').fill('水痘疫苗 第 1 剂'); await T('vax-day-minus').click(); await T('vax-save').click(); await r.wait_for_timeout(900)
    check('vaccine record saved (name, date)', '水痘疫苗 第 1 剂' in await T('vax-card').inner_text() and any(x['name']=='水痘疫苗 第 1 剂' and x['date']=='2026-10-30' for x in (await health_store())['vaccines']))
    await into('allergy-new'); await T('allergy-new').click(); await r.wait_for_timeout(700)
    await T('allergy-name').fill('鸡蛋'); await T('allergy-note').fill('吃了起疹子'); await T('allergy-save').click(); await r.wait_for_timeout(900)
    check('allergy saved & shown in 就医要点', '鸡蛋' in await T('h-key').inner_text())
    await into('vax-card'); await shot('12-vax-check-allergy.png')
    await into('h-key'); await shot('13-key-points.png')

    # ---------- 10. 免疫规划：确认后才提醒 ----------
    await r.mouse.wheel(0,-9000); await r.wait_for_timeout(400)
    await into('plan-card'); pc=await T('plan-card').inner_text()
    check('plan items 待确认 cite source as 参考', '参考' in pc and '国家免疫规划' in pc, pc[:200])
    n_plan=len([x for x in (await health_store())['reminders'] if x['source']=='plan'])
    await shot('14-plan-confirm.png')
    await T('plan-ok-0').click(); await r.wait_for_timeout(900)
    check('confirm plan → reminder created', len([x for x in (await health_store())['reminders'] if x['source']=='plan'])==n_plan+1)

    # ---------- 11. 我的 → 提醒事项 ----------
    await tab('我的'); await shot('15-me-health-links.png')
    todo=(await T('me-rem').inner_text())
    check('我的 · 提醒事项 shows 待办 count', re.search(r'\d+ 项待办',todo) is not None, todo)
    await T('me-rem').click(); await r.wait_for_timeout(1200)
    check('提醒事项 → 健康 提醒 section in view', in_view(await T('rem-card').bounding_box()))

    # ---------- 12. reload persists ----------
    await r.goto(BASE+'/'); await r.wait_for_timeout(3000); await tab('健康')
    t=await body()
    check('reload: reminders / allergy / dismissed suggestion persisted', '喂益生菌' in t and '鸡蛋' in t and await T('sg-nofever').count()==0)
    await r.mouse.wheel(0,-9000); await shot('16-health-top-after.png')
    # night
    await tab('我的'); await T('night-toggle').scroll_into_view_if_needed(); await T('night-toggle').click(); await r.wait_for_timeout(700)
    await tab('健康'); await r.mouse.wheel(0,-9000); await shot('17-health-night.png')
    await tab('我的'); await T('night-toggle').click(); await r.wait_for_timeout(500)

    errs2=[e for e in errs if 'favicon' not in e]
    print('\nconsole/page errors:',errs2); check('no console errors', not errs2, errs2)
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    await b.close()
    sys.exit(1 if bad else 0)
asyncio.run(main())
