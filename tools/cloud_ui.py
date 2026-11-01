"""两个真实账号的界面联调（Supabase 项目 Baby）：A 登录→创建家庭→邀请；B 登录→输入邀请码加入→看到 A 的记录；
B 新记一条→A 的首页几秒内出现「爸爸记」；C 登录后看不到这个家庭；最后 A 走「注销账号」两步确认。
账号密码来自 .env.test（不进 git）。跑法：先 npm run build:web 并在 8090 端口提供 dist。"""
import asyncio, time, re
from playwright.async_api import async_playwright
from PIL import Image
O='/workspace/yijuji-app/shots/m2-cloud/'
env=dict(l.split('=',1) for l in open('/workspace/yijuji-app/.env.test').read().split('\n') if l)
ok=[];bad=[]
def check(name,cond,info=''):
  (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(info) if info else ''))
def side(a,b,o,labels=None):
  A=Image.open(O+a).convert('RGB');B=Image.open(O+b).convert('RGB')
  from PIL import ImageDraw, ImageFont
  c=Image.new('RGB',(A.width+B.width+40,max(A.height,B.height)+70),'white');c.paste(A,(0,70));c.paste(B,(A.width+40,70))
  if labels:
    d=ImageDraw.Draw(c); f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',30)
    d.text((20,18),labels[0],fill='#4A3A2E',font=f); d.text((A.width+60,18),labels[1],fill='#4A3A2E',font=f)
  c.save(O+o)

async def main():
  async with async_playwright() as pw:
    br=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    async def user(tag):
      ctx=await br.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
      r=await ctx.new_page(); errs=[]
      r.on('pageerror',lambda e:errs.append(f'{tag} PAGEERR {e}'))
      r.on('console',lambda m:errs.append(f'{tag} CONSOLE {m.text}') if m.type=='error' else None)
      r.on('response',lambda q:(errs.append(f'{tag} HTTP {q.status} {q.url[:110]}') if '/logout' not in q.url else None) if q.status>=400 else None)
      T=r.get_by_test_id
      async def shot(p): await r.wait_for_timeout(500); await r.screenshot(path=O+p)
      async def tab(t): await r.get_by_text(t,exact=True).last.click(); await r.wait_for_timeout(700)
      async def onboard(name):
        await r.goto('http://localhost:8090/'); await r.wait_for_timeout(2500)
        await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(600)
        await T('pf-name').fill(name); await T('pf-bd').fill('2026-03-28'); await T('pf-gender-girl').click()
        await T('pf-submit').click(); await r.wait_for_timeout(2000)
      async def login(email,shotname=None):
        await tab('我的'); await T('login').click(); await r.wait_for_timeout(800)
        await T('login-email').fill(email); await T('login-password').fill(env['YJ_IT_PASSWORD'])
        if shotname: await shot(shotname)
        await T('login-go').click(); await T('family-page').wait_for(timeout=15000); await r.wait_for_timeout(2500)
      return r,T,shot,tab,onboard,login,errs
    A,TA,shotA,tabA,obA,loginA,errA=await user('A')
    B,TB,shotB,tabB,obB,loginB,errB=await user('B')
    C,TC,shotC,tabC,obC,loginC,errC=await user('C')

    # ---- A：本地先用着（演示数据 + 1 条自己记的），然后登录、创建家庭 ----
    await obA('豆米')
    await TA('plus-feed').click(); await A.wait_for_timeout(700); await TA('rec-save').click(); await A.wait_for_timeout(3500)
    await loginA(env['YJ_IT_A'],'01-login.png')
    await shotA('02-family-setup.png')
    check('A: after login → no family yet', await TA('family-create').is_enabled())
    await TA('family-create').click(); await TA('family-ok').wait_for(timeout=15000); await shotA('03-family-created.png')
    await TA('family-done').click(); await A.wait_for_timeout(1500)
    await shotA('04-me-signed-in.png')
    check('A: member list shows 妈妈（我）', '妈妈（我）' in await A.locator('body').inner_text())
    await TA('invite').click(); await TA('invite-exp').wait_for(); await A.wait_for_timeout(2500)
    code=''.join([(await TA(f'invite-c{i}').inner_text()).strip() for i in range(6)])
    check('A: invite code is 6 chars + expiry shown', re.fullmatch(r'[A-Z0-9]{6}',code) is not None and '前有效' in await TA('invite-exp').inner_text(), code)
    check('A: share text contains code', code in await TA('invite-text').inner_text())
    await shotA('05-invite.png'); await TA('invite-ok').click(); await A.wait_for_timeout(600)

    # ---- B：登录 → 我有邀请码 → 加入 ----
    await obB('小宝')
    await loginB(env['YJ_IT_B'])
    await TB('family-join').click(); await TB('join-page').wait_for(); await B.wait_for_timeout(600)
    await TB('join-code').fill(code.lower()); await TB('rel-爸爸').click(); await shotB('06-join.png')
    await TB('join-go').click(); await B.wait_for_timeout(5000)
    await tabB('我的'); await B.wait_for_timeout(1500); await shotB('07-members-B.png')
    body=await B.locator('body').inner_text()
    check('B: members show 妈妈 + 爸爸（我）', '妈妈' in body and '爸爸（我）' in body)
    check('B: baby switched to family baby 豆米', '豆米' in body)
    await tabB('今天'); await B.wait_for_timeout(1000); await shotB('08-home-B-sees-A.png')
    hb=await B.locator('body').inner_text()
    check('B: sees A\'s record (妈妈记)', '妈妈记' in hb)
    check('B: demo records were not uploaded (no 奶奶记)', '奶奶记' not in hb)

    # ---- A 的成员列表刷新到 2 人 ----
    await tabA('今天'); await tabA('我的'); await A.wait_for_timeout(2500); await shotA('09-members-A.png')
    check('A: members now 妈妈（我）+ 爸爸', '爸爸' in await A.locator('body').inner_text())
    await tabA('今天'); await A.wait_for_timeout(800)

    # ---- B 记一条换尿布 → A 实时出现 ----
    await TB('plus-diaper').click(); await B.wait_for_timeout(700)
    t0=time.time(); await TB('rec-save').click()
    hit=None
    for _ in range(100):
      if await A.locator('[data-testid^="tl-"]').filter(has_text='爸爸记').count()>0: hit=time.time()-t0; break
      await A.wait_for_timeout(100)
    check('A: B\'s new record appears via realtime', hit is not None, f'{hit:.1f}s' if hit else 'timeout')
    await B.wait_for_timeout(2500)
    for r_ in (A,B): await r_.mouse.move(195,450); await r_.mouse.wheel(0,820); await r_.wait_for_timeout(700)
    await shotA('10-home-A-realtime.png'); await shotB('10-home-B.png')
    side('10-home-B.png','10-home-A-realtime.png','11-two-user-sync.png',(f'B 爸爸的手机：刚记一条换尿布',f'A 妈妈的手机：{hit:.1f} 秒后实时出现' if hit else 'A：未收到'))

    # ---- M4：健康提醒 / 病程同步给家人，显示谁完成 ----
    import json as _j
    await tabA('健康'); await TA('rem-new').scroll_into_view_if_needed(); await TA('rem-new').click(); await A.wait_for_timeout(700)
    await TA('rem-title').fill('复诊带上病历本'); await TA('rem-cat-visit').click(); await TA('rem-save').click(); await A.wait_for_timeout(1500)
    hA=_j.loads(await A.evaluate("localStorage.getItem('yj:v1:health')")); rid=[x for x in hA['reminders'] if x['title']=='复诊带上病历本'][0]['id']
    await tabB('健康'); hit=None; t0=time.time()
    for _ in range(120):
      if await TB(f'rem-{rid}').count()>0: hit=time.time()-t0; break
      await B.wait_for_timeout(100)
    check('B: sees A\'s new reminder', hit is not None, f'{hit:.1f}s' if hit else 'timeout')
    check('B: demo reminders of A were not uploaded', '喂维生素 D' not in await TB('rem-card').inner_text())
    await TB(f'rem-{rid}').scroll_into_view_if_needed(); await TB(f'rem-{rid}-box').click(); await B.wait_for_timeout(500)
    t0=time.time(); hit=None
    for _ in range(150):
      if '爸爸完成' in await TA('rem-card').inner_text(): hit=time.time()-t0; break
      await A.wait_for_timeout(100)
    check('A: sees reminder completed by 爸爸 (who completed)', hit is not None, f'{hit:.1f}s' if hit else 'timeout')
    await TA('rem-card').scroll_into_view_if_needed(); await TB('rem-card').scroll_into_view_if_needed()
    await shotA('../m4/cloud-A-reminder-done-by-B.png'); await shotB('../m4/cloud-B-completed.png')
    side('../m4/cloud-B-completed.png','../m4/cloud-A-reminder-done-by-B.png','../m4/cloud-reminder-sync.png',('B 爸爸：勾掉「复诊带上病历本」','A 妈妈：显示「爸爸完成」'))
    # B 开始一次病程 → A 看到进行中
    await TB('ht-ill').scroll_into_view_if_needed(); await TB('ep-new').scroll_into_view_if_needed(); await TB('ep-new').click(); await B.wait_for_timeout(600)
    await TB('ep-quick-咳嗽').click(); await TB('ep-save').click(); await B.wait_for_timeout(500)
    hit=None
    for _ in range(150):
      if await TA('ep-open').count()>0: hit=True; break
      await A.wait_for_timeout(100)
    check('A: sees B\'s new episode (进行中)', hit is not None and '咳嗽' in await TA('ill-tab').inner_text())
    await TA('ep-open').scroll_into_view_if_needed(); await shotA('../m4/cloud-A-sees-episode.png')
    await tabA('今天'); await tabB('今天')

    # ---- C：登录后看不到这个家庭；用过的邀请码也进不去 ----
    await obC('团子')
    await loginC(env['YJ_IT_C'])
    check('C: no family (cannot see A\'s family)', await TC('family-create').is_enabled())
    await TC('family-join').click(); await TC('join-page').wait_for(); await TC('join-code').fill(code); await TC('join-go').click(); await C.wait_for_timeout(2500)
    check('C: used invite code rejected', '被用过' in await TC('join-err').inner_text())
    await shotC('12-C-used-code.png')
    await TC('full-close').click(); await C.wait_for_timeout(500)
    check('C: home has no 妈妈记/爸爸记 from A\'s family', '爸爸记' not in await C.locator('body').inner_text())

    # ---- A：注销账号（两步确认） ----
    await tabA('我的'); await TA('delete-account').scroll_into_view_if_needed(); await TA('delete-account').click(); await A.wait_for_timeout(800)
    await shotA('13-delete-step1.png'); await TA('confirm-ok').click(); await A.wait_for_timeout(1200)
    await shotA('14-delete-step2.png'); await TA('confirm-ok').click(); await A.wait_for_timeout(5000)
    check('A: after delete account → back to onboarding', await TA('ob-consent').is_visible())
    await tabB('我的')
    # 成员列表靠实时推送/轮询刷新，最多等 12 秒（之前固定等 3 秒偶发偏早读到旧列表）
    gone=False
    for _ in range(24):
        await B.wait_for_timeout(500)
        body=await B.locator('body').inner_text()
        if '家庭成员' in body and '妈妈' not in body.split('家庭成员')[1].split('账号')[0]: gone=True; break
    check('B: family still exists, A gone (B only)', gone)
    await shotB('15-B-after-A-deleted.png')

    # 注销后账号已不存在，supabase-js 退出时调 /logout 会得到 403（库会忽略并清掉本地会话），这条浏览器日志是预期的
    errs=[e for e in errA+errB+errC if 'favicon' not in e and not (e.startswith('A CONSOLE') and 'status of 403' in e)]
    print('console/page errors:',errs)
    check('no console errors', not errs)
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    await br.close()
asyncio.run(main())
