"""团子育儿本 · 首次使用流程 e2e（全部拦截 Supabase，不连真后端、不写线上库）：390x844，时钟固定 2026-10-31 10:20。

覆盖（docs/ONBOARDING-FLOW.md 的状态机）：
  A  欢迎 → 注册：空表单报错 / 未勾选同意 / 注册成功 → 验证邮件已发送 → 「我已验证」→ 登录页绿色提示
  A2 已注册过的邮箱再注册：和正常注册完全一样（验证邮件已发送），页面上不出现「已注册」
  B  登录：密码不对 → 红色提示；忘记密码 → 重置邮件已发送
  C  登录 → 选择 → 新建宝宝：表单校验（昵称 / 生日格式 / 生日晚于今天 / 「其他」称呼）
     → 空首页（记满 3 天卡 0/3、空时间线、团团引导、邀请提示卡、不显示示例句）→ 关掉提示卡
     → 第一条记录 →「第一条记好啦！」→ 5a sheet → 邀请家人 → 我的（账号区、没有清空数据）
     → 修改密码 → 注销账号：500 / 401 保持登录并提示「注销没成功，请稍后再试」，200 回欢迎页且本机数据清空
  D  登录 → 我有邀请码：不满 6 位 / 码不对 / 尝试太多次 / 成功 → 加入成功页 → 去看看豆米
  E  先看看示例：只读，0 个 Supabase 请求、localStorage 不新增键；点「开始记我家宝宝」→ 注册页
跑法：npm run test:web（或 python3 tools/run_web_tests.py e2e_onboarding.py）"""
import asyncio, datetime, json, sys
from playwright.async_api import async_playwright
import paths
import e2e_common as common

O = paths.sub('onboarding')
BASE = paths.BASE_URL
NOW = datetime.datetime(2026, 10, 31, 10, 20, 0)
EMAIL = 'new@test.local'
ok = []; bad = []


def check(name, cond, info=''):
    (ok if cond else bad).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(info) if info else ''))


def session(email=EMAIL, uid='u-new'):
    s = json.loads(json.dumps(common.SESSION))
    s['user']['id'] = uid; s['user']['email'] = email
    return s


def db_rows(baby_id, fam, n=None):
    out = []
    for i, r in enumerate(common._FIX['records'][:n], 1):
        out.append({'id': f'e2e-j{i}', 'baby_id': baby_id, 'family_id': fam, 'type': r['type'], 'started_at': r['time'],
                    'ended_at': r.get('endTime'), 'vals': r.get('values') or {}, 'note': r.get('note'), 'created_by_name': r['createdBy'],
                    'src': r['src'], 'created_at': r['createdAt'], 'updated_at': r['updatedAt'], 'deleted_at': None})
    return out


class Backend:
    """一个很小的「假 Supabase」：按场景状态回包，并记下所有请求。"""
    def __init__(self):
        self.signup = 'ok'          # ok | exists
        self.login = 'ok'           # ok | bad
        self.join = 'ok'            # ok | bad | rate
        self.delete_status = 200
        self.family = None          # None | 'new' | 'joined'
        self.baby = None
        self.me = '妈妈'
        self.rows = None            # 加入的家庭里有几条记录（None = 全部 fixture）
        self.email = EMAIL
        self.reqs = []              # (method, url, body, headers)

    def rpc_body(self, name):
        return [json.loads(b or '{}') for m, u, b, h in self.reqs if f'/rpc/{name}' in u]

    async def handler(self, route):
        req = route.request; url = req.url; m = req.method
        if 'supabase.co' not in url and '/functions/v1/' not in url:
            return await route.continue_()
        body = req.post_data
        self.reqs.append((m, url, body, await req.all_headers()))
        H = common.CORS
        if m == 'OPTIONS':
            return await route.fulfill(status=204, headers=H)

        async def J(obj, status=200):
            await route.fulfill(status=status, content_type='application/json', body=json.dumps(obj, ensure_ascii=False), headers=H)

        if '/functions/v1/delete-account' in url:
            st = self.delete_status
            return await J({'ok': True} if st == 200 else {'error': '注销没成功，请稍后再试'}, st)
        if '/auth/v1/signup' in url:
            if self.signup == 'exists':
                return await J({'code': 422, 'error_code': 'user_already_exists', 'msg': 'User already registered'}, 422)
            u = session(self.email)['user']; u['identities'] = [{'id': 'i1'}]
            return await J(u)
        if '/auth/v1/token' in url:
            if 'grant_type=password' in url and self.login == 'bad':
                return await J({'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'}, 400)
            return await J(session(self.email))
        if '/auth/v1/recover' in url or '/auth/v1/resend' in url:
            return await J({})
        if '/auth/v1/logout' in url:
            return await route.fulfill(status=204, headers=H)
        if '/auth/v1/user' in url:
            return await J(session(self.email)['user'])
        if '/rest/v1/family_members' in url:
            if 'user_id=eq' in url:
                if not self.family:
                    return await J([])
                return await J([{'family_id': 'fam-x', 'user_id': 'u-new', 'role': 'admin' if self.family == 'new' else 'member', 'display_name': self.me, 'families': {'name': '我们家' if self.family == 'new' else '豆米家'}}])
            if not self.family:
                return await J([])
            ms = [{'user_id': 'u-new', 'display_name': self.me, 'role': 'admin', 'joined_at': '2026-10-31T02:20:00Z'}]
            if self.family == 'joined':
                ms = [{'user_id': 'u-mama', 'display_name': '妈妈', 'role': 'admin', 'joined_at': '2026-10-01T00:00:00Z'},
                      {'user_id': 'u-nai', 'display_name': '奶奶', 'role': 'member', 'joined_at': '2026-10-02T00:00:00Z'},
                      {'user_id': 'u-new', 'display_name': self.me, 'role': 'member', 'joined_at': '2026-10-31T02:20:00Z'}]
            return await J(ms)
        if '/rest/v1/rpc/create_family_with_baby' in url:
            a = json.loads(body or '{}'); b = a.get('p_baby') or {}
            self.family = 'new'; self.me = a.get('p_display_name') or '妈妈'
            self.baby = {**b, 'family_id': 'fam-x'}
            return await J([{'family_id': 'fam-x', 'baby_id': b.get('id')}])
        if '/rest/v1/rpc/accept_invite' in url:
            a = json.loads(body or '{}')
            if self.join == 'rate':
                return await J({'code': '54000', 'message': 'too many attempts, try later', 'details': None, 'hint': None}, 400)
            if self.join == 'bad':
                return await J(None)
            self.family = 'joined'; self.me = a.get('p_display_name') or '爸爸'
            self.baby = dict(common.BABY_ROW, family_id='fam-x')
            return await J('fam-x')
        if '/rest/v1/rpc/create_invite' in url:
            return await J([{'code': '7K2QMB', 'expires_at': common._iso_in(hours=48)}])
        if '/rest/v1/rpc/' in url:
            return await J(None)
        if '/rest/v1/families' in url:
            return await J([{'name': '豆米家'}])
        if '/rest/v1/babies' in url:
            return await J([self.baby] if self.baby and m == 'GET' else ([] if m == 'GET' else {}))
        if '/rest/v1/records' in url:
            if m == 'GET':
                return await J(db_rows(self.baby['id'], 'fam-x', self.rows) if self.family == 'joined' and 'updated_at=gt' not in url else [])
            rows = json.loads(body or '[]')
            return await J(rows if isinstance(rows, list) else [rows], 201)
        if '/rest/v1/' in url:
            return await J([] if m == 'GET' else {})
        return await J({})


async def new_ctx(b, be, night=False, seed_session=False, still=False):
    # still=True：系统「减少动态效果」（视觉对比用，JS 驱动的动画也停下来）
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, reduced_motion='reduce' if still else 'no-preference')
    await ctx.route('**/*', be.handler)
    init = {'yj:v1:settings': {'consentAt': None, 'onboarded': False, 'night': night, 'cards': common.DEF_CARDS, 'sample': 0, 'lvl': 1, 'xp': 0}}
    if seed_session:
        init[common.SESSION_KEY] = session()
    payload = json.dumps(init, ensure_ascii=False)
    await ctx.add_init_script(f"""(() => {{ try {{ if (localStorage.getItem('__e2e_seeded')) return;
      const d = {payload}; for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v));
      localStorage.setItem('__e2e_seeded', '1'); }} catch (e) {{}} }})();""")
    return ctx


async def page(ctx, errs):
    r = await ctx.new_page()
    r.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    # 4xx/5xx 是用例故意返回的（登录失败 / 注销失败），浏览器会打「Failed to load resource」，不算错
    r.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await r.clock.set_system_time(NOW)
    return r


async def body(r):
    return await r.locator('body').inner_text()


async def toast_has(r, t, ms=3000):
    try:
        await r.get_by_text(t).first.wait_for(state='visible', timeout=ms); return True
    except Exception:
        return False


async def login_flow(r, T, email=EMAIL):
    await r.goto(BASE + '/', wait_until='domcontentloaded')
    await T('ob-welcome').wait_for(state='visible', timeout=60000)
    await T('ob-start').click(); await r.wait_for_timeout(500)
    await T('ob-mode-in').click(); await r.wait_for_timeout(300)
    await T('ob-email').fill(email); await T('ob-pw').fill('secret-123')
    await T('ob-submit').click()


async def main():
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=paths.CHROME, args=['--no-sandbox'])

        # ---------- A 注册 ----------
        be = Backend(); ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await r.goto(BASE + '/', wait_until='domcontentloaded'); await T('ob-welcome').wait_for(state='visible', timeout=60000)
        await r.screenshot(path=O + '01-welcome.png')
        await T('ob-start').click(); await r.wait_for_timeout(600)
        check('A 开始使用 → 注册页', await T('ob-auth').is_visible())
        await T('ob-submit').click(); await r.wait_for_timeout(400)
        check('A 空表单：先填一下邮箱 / 密码', '先填一下邮箱' in await body(r))
        await T('ob-email').fill('bad-mail'); await T('ob-pw').fill('123'); await T('ob-submit').click(); await r.wait_for_timeout(400)
        bb = await body(r)
        check('A 格式错：邮箱格式 / 密码至少 6 位', '邮箱格式不对' in bb and '密码至少 6 位' in bb)
        await T('ob-email').fill(EMAIL); await T('ob-pw').fill('secret-123'); await T('ob-submit').click()
        check('A 未勾选同意 → 提示', await toast_has(r, '请先勾选同意'))
        n0 = len([x for x in be.reqs if '/signup' in x[1]])
        check('A 未勾选同意时不发注册请求', n0 == 0, n0)
        await T('ob-agree').click(); await T('ob-submit').click()
        await T('ob-verify').wait_for(state='visible', timeout=8000)
        check('A 注册成功 → 验证邮件已发送（显示邮箱）', EMAIL in await body(r))
        await r.screenshot(path=O + '02-verify.png')
        sb = json.loads([x for x in be.reqs if '/signup' in x[1]][0][2])
        check('A 注册带同意记录（consent_at / policy_version）', 'consent_at' in (sb.get('data') or {}) and 'policy_version' in (sb.get('data') or {}))
        await T('ob-verified').click(); await r.wait_for_timeout(600)
        check('A 我已验证 → 登录页 + 绿色提示', '验证好了就登录吧' in await body(r) and await T('ob-email').input_value() == EMAIL)
        await ctx.close()

        # ---------- A2 已注册邮箱 ----------
        be = Backend(); be.signup = 'exists'; ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await r.goto(BASE + '/', wait_until='domcontentloaded'); await T('ob-welcome').wait_for(state='visible', timeout=60000)
        await T('ob-start').click(); await r.wait_for_timeout(500)
        await T('ob-email').fill('used@test.local'); await T('ob-pw').fill('secret-123'); await T('ob-agree').click(); await T('ob-submit').click()
        await T('ob-verify').wait_for(state='visible', timeout=8000)
        bb = await body(r)
        check('A2 已注册邮箱 → 同样显示验证邮件已发送', 'used@test.local' in bb)
        check('A2 页面上没有「已注册」字样（防枚举）', '已注册' not in bb and '已经注册' not in bb, bb[:80])
        await ctx.close()

        # ---------- B 登录失败 / 忘记密码 ----------
        be = Backend(); be.login = 'bad'; ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await login_flow(r, T); await r.wait_for_timeout(1200)
        check('B 密码不对 → 红色提示', await T('ob-auth-banner').is_visible() and '邮箱或密码不对' in await T('ob-auth-banner').inner_text())
        await r.screenshot(path=O + '03-login-err.png')
        await T('ob-forgot').click(); await r.wait_for_timeout(600)
        check('B 忘记密码页带上邮箱', await T('ob-forgot-email').input_value() == EMAIL)
        await T('ob-forgot-send').click(); await T('ob-forgot-sent').wait_for(state='visible', timeout=8000)
        check('B 重置邮件已发送', '重置邮件已发送' in await body(r) and any('/recover' in x[1] for x in be.reqs))
        await T('ob-back-login').click(); await r.wait_for_timeout(500)
        check('B 回到登录', await T('ob-auth').is_visible())
        await ctx.close()

        # ---------- C 新建宝宝 → 空首页 → 第一条 → 我的 → 注销 ----------
        be = Backend(); ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await login_flow(r, T)
        await T('ob-choose').wait_for(state='visible', timeout=10000)
        bb = await body(r)
        check('C 登录 → 选择页（已登录 邮箱）', f'已登录 {EMAIL}' in bb and '新建宝宝' in bb and '我有邀请码' in bb)
        await r.screenshot(path=O + '04-choose.png')
        await T('ob-choose-new').click(); await T('ob-profile').wait_for(state='visible', timeout=5000)
        check('C 宝宝资料是空表单', await T('pf-name').input_value() == '' and await T('pf-bd').input_value() == '')
        await r.screenshot(path=O + '05-profile.png')
        await T('pf-submit').click(); await r.wait_for_timeout(400)
        check('C 校验：给宝宝起个昵称吧', '给宝宝起个昵称吧' in await body(r))
        await T('pf-name').fill('糯米'); await T('pf-bd').fill('20991201'); await T('pf-submit').click(); await r.wait_for_timeout(400)
        check('C 生日自动补成 YYYY-MM-DD', await T('pf-bd').input_value() == '2099-12-01')
        check('C 校验：生日不能晚于今天', '生日不能晚于今天' in await body(r))
        await T('pf-bd').fill('2026-13-40'); await T('pf-submit').click(); await r.wait_for_timeout(400)
        check('C 校验：生日格式', '生日格式像 2026-03-28 这样' in await body(r))
        await T('pf-bd').fill('2026-09-12'); await r.wait_for_timeout(200)
        check('C 生日后显示「今天 1 个月 19 天」', '今天 1 个月 19 天' in await body(r))
        await T('pf-gender-boy').click(); await T('pf-av-sprout').click(); await T('pf-feed-bm').click()
        await T('pf-role-其他').click(); await T('pf-submit').click(); await r.wait_for_timeout(400)
        check('C 校验：填一下家人怎么称呼你', '填一下家人怎么称呼你' in await body(r))
        await T('pf-role-other').fill('姑姑'); await r.wait_for_timeout(200)
        check('C 「其他」→ 记录会显示「姑姑记」', '姑姑记' in await body(r))
        await T('pf-submit').click()
        await T('pred-fresh').wait_for(state='visible', timeout=10000)
        rb = be.rpc_body('create_family_with_baby')
        check('C 一个 RPC 建家庭 + 宝宝（我们家 / 姑姑 / 糯米）', len(rb) == 1 and rb[0]['p_name'] == '我们家' and rb[0]['p_display_name'] == '姑姑'
              and rb[0]['p_baby']['name'] == '糯米' and rb[0]['p_baby']['birthday'] == '2026-09-12' and rb[0]['p_baby']['feeding'] == 'bm', rb)
        check('C 欢迎 toast', await toast_has(r, '欢迎！糯米的家建好啦'))
        await r.wait_for_timeout(2500)
        bb = await body(r)
        check('C 空首页：记满 3 天卡 0/3 天', '团团就会算' in bb and '0/3 天' in bb)
        check('C 空首页：时间线空状态 + 0 条记录', await T('tl-empty').is_visible() and (await T('tl-count').inner_text()).startswith('0'))
        check('C 空首页：团团引导指向麦克风', await T('coach').is_visible() and await T('mic-ripple').count() == 1)
        check('C 空首页：引导时不显示示例句', await T('sample-pill').count() == 0)
        check('C 空首页：问候语是自我介绍', '我是团团' in await T('greet').inner_text())
        check('C 空首页：邀请家人提示卡', await T('nudge').is_visible())
        check('C 空首页：没有带上旧记录（records 未上传）', not any('/rest/v1/records' in x[1] and x[0] == 'POST' for x in be.reqs))
        await r.screenshot(path=O + '06-home-empty.png')
        await T('nudge-x').click()
        check('C 关掉提示卡 → toast', await toast_has(r, '之后可以在「我的 › 邀请家人」里邀请'))
        check('C 提示卡消失', await T('nudge').count() == 0)
        # 第一条记录
        await T('plus-feed').click(); await T('rec-save').wait_for(state='visible', timeout=5000)
        await T('rec-save').click()
        check('C 第一条 → 「第一条记好啦！」', await toast_has(r, '第一条记好啦！', 2000))
        check('C 第一条之后提示「记满 3 天…」', await toast_has(r, '记满 3 天，团团就能预测下一顿啦', 4000))
        await T('first-sheet').wait_for(state='visible', timeout=4000)
        bb = await body(r)
        check('C 5a sheet：第一条记录完成！', '第一条记录完成！' in bb and '糯米的成长日记开始啦' in bb and '记满 3 天 · 解锁作息预测' in bb)
        check('C 第一条时不弹「预测已刷新」', '预测已刷新' not in bb)
        await r.screenshot(path=O + '07-first-record.png')
        await T('first-invite').click(); await T('invite-c5').wait_for(state='visible', timeout=5000); await r.wait_for_timeout(500)
        code = ''.join([await T(f'invite-c{i}').inner_text() for i in range(6)])
        check('C 5a → 邀请家人 → 6 位邀请码', code == '7K2QMB', code)
        await T('invite-ok').click(); await r.wait_for_timeout(700)
        check('C 引导消失 / 1 条记录 / 记得真棒', await T('coach').count() == 0 and (await T('tl-count').inner_text()).startswith('1') and '记得真棒' in await T('greet').inner_text())
        check('C 1 天记录：预测卡 1/3 天', '1/3 天' in await body(r))
        await r.reload(); await T('tl-count').wait_for(state='visible', timeout=30000); await r.wait_for_timeout(800)
        check('C 刷新后不再弹 5a / 引导', await T('first-sheet').count() == 0 and await T('coach').count() == 0)
        # 我的
        await r.get_by_text('我的', exact=True).last.click(); await r.wait_for_timeout(900)
        bb = await body(r)
        check('C 我的：没有清空全部数据 / 重置演示数据', '清空全部数据' not in bb and '重置演示数据' not in bb)
        check('C 我的：账号区（邮箱 / 修改密码 / 退出登录 / 注销账号）', EMAIL in bb and all(t in bb for t in ['修改密码', '退出登录', '注销账号', '邮箱登录 · 已验证']))
        check('C 我的：家庭成员显示「姑姑（我）」', '姑姑（我）' in bb)
        check('C 我的：默认喂养 瓶喂母乳', '默认喂养：瓶喂母乳' in bb)
        await r.screenshot(path=O + '08-me.png')
        await T('change-pw').click(); await T('ob-setpw').wait_for(state='visible', timeout=5000)
        await T('ob-pw-new').fill('newpass1'); await T('ob-pw-new2').fill('newpass2'); await T('ob-pw-save').click(); await r.wait_for_timeout(300)
        check('C 修改密码：两次不一样', '两次输入的不一样' in await body(r))
        await T('ob-pw-new2').fill('newpass1'); await T('ob-pw-save').click()
        check('C 修改密码 → 密码改好啦', await toast_has(r, '密码改好啦'))
        check('C 修改密码调用 updateUser', any('/auth/v1/user' in x[1] and x[0] == 'PUT' for x in be.reqs))
        await r.wait_for_timeout(600)

        async def ask_delete():
            await T('delete-account').scroll_into_view_if_needed(); await T('delete-account').click(); await r.wait_for_timeout(700)
            t1 = await body(r)
            await T('confirm-ok').click(); await r.wait_for_timeout(900)
            t2 = await body(r)
            return t1, t2
        for st in (500, 401):
            be.delete_status = st
            t1, t2 = await ask_delete()
            if st == 500:
                check('C 注销第 1 步文案', '会删除你的账号；如果家里只有你一个人，宝宝和所有记录也会一起删除；如果还有其他家人，记录保留给他们' in t1)
                check('C 注销第 2 步：真的要注销吗？', '真的要注销吗？' in t2 and '确认注销' in t2)
                await r.screenshot(path=O + '09-delete-confirm.png')
            await T('confirm-ok').click()
            check(f'C 注销 {st} → 提示「注销没成功，请稍后再试」', await toast_has(r, '注销没成功，请稍后再试'))
            await r.wait_for_timeout(800)
            check(f'C 注销 {st} → 仍然登录在「我的」', await T('account').is_visible() and await T('ob-welcome').count() == 0)
        be.delete_status = 200
        await ask_delete(); await T('confirm-ok').click()
        await T('ob-welcome').wait_for(state='visible', timeout=8000)
        check('C 注销 200 → 回欢迎页 + 提示', await toast_has(r, '账号已注销，数据已删除'))
        dl = [x for x in be.reqs if '/functions/v1/delete-account' in x[1] and x[0] == 'POST']
        check('C 注销请求：POST + Bearer + {"confirm":"DELETE"}', len(dl) == 3 and all(json.loads(x[2]) == {'confirm': 'DELETE'} and x[3].get('authorization', '').startswith('Bearer ') for x in dl), len(dl))
        await r.wait_for_timeout(800)
        ls = await r.evaluate("() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))")
        check('C 注销后本机数据清空（宝宝 / 记录 / 会话）', not ls.get('yj:v1:baby') and ls.get('yj:v1:records') in (None, '[]') and not ls.get(common.SESSION_KEY), [k for k in ls])
        await r.reload(); await r.wait_for_timeout(2500)
        check('C 注销 + 刷新仍在欢迎页', await T('ob-welcome').is_visible())
        await ctx.close()

        # ---------- D 加入家庭 ----------
        be = Backend(); ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await login_flow(r, T)
        await T('ob-choose-join').wait_for(state='visible', timeout=10000); await T('ob-choose-join').click()
        await T('ob-join').wait_for(state='visible', timeout=5000)
        await r.screenshot(path=O + '10-join.png')
        await T('ob-code-in').fill('7k2'); await r.wait_for_timeout(200)
        check('D 输入自动转大写', await T('ob-code-0').inner_text() == '7' and await T('ob-code-1').inner_text() == 'K')
        await T('ob-join-go').click(); await r.wait_for_timeout(400)
        check('D 不满 6 位 → 邀请码是 6 位字母和数字', '邀请码是 6 位字母和数字' in await body(r))
        check('D 不满 6 位不发请求', not be.rpc_body('accept_invite'))
        be.join = 'bad'; await T('ob-code-in').fill('AAAAAA'); await T('ob-join-go').click(); await r.wait_for_timeout(1200)
        check('D 码不对 → 红色提示', await T('ob-join-err').is_visible() and '邀请码不对，或者已经过期 / 被用过了' in await body(r))
        await r.screenshot(path=O + '11-join-err.png')
        be.join = 'rate'; await T('ob-join-go').click(); await r.wait_for_timeout(1200)
        check('D 太多次 → 请一小时后再试', '尝试太多次了，请一小时后再试' in await body(r))
        be.join = 'ok'; await T('ob-code-in').fill('7K2QMB'); await T('ob-join-role-奶奶').click(); await T('ob-join-go').click()
        await T('ob-join-ok').wait_for(state='visible', timeout=10000); await r.wait_for_timeout(1500)
        bb = await body(r)
        check('D 加入成功：欢迎加入「豆米家」', '欢迎加入「豆米家」！' in bb)
        check('D 加入成功：宝宝信息 + 记录数', '女宝 · 7 个月 3 天 · 已有 304 条记录' in bb, (await T('ob-join-ok-sub').inner_text()))
        check('D 加入成功：家里的人', all(t in bb for t in ['妈妈 · 管理员', '奶奶（我）· 可记录']))
        ab = be.rpc_body('accept_invite')[-1]
        check('D accept_invite 参数（7K2QMB / 奶奶）', ab == {'p_code': '7K2QMB', 'p_display_name': '奶奶'}, ab)
        await r.screenshot(path=O + '12-join-ok.png')
        await T('ob-join-ok-go').click(); await T('tl-count').wait_for(state='visible', timeout=10000)
        check('D 去看看豆米 → 首页 + toast', await toast_has(r, '家人的记录已经同步过来啦'))
        check('D 加入的家庭有记录：正常预测、无引导', await T('pred').is_visible() and await T('coach').count() == 0)
        await ctx.close()

        # ---------- E 示例模式 ----------
        be = Backend(); ctx = await new_ctx(b, be); r = await page(ctx, errs); T = r.get_by_test_id
        await r.goto(BASE + '/', wait_until='domcontentloaded'); await T('ob-welcome').wait_for(state='visible', timeout=60000)
        await r.wait_for_timeout(1500)
        keys0 = set(await r.evaluate('() => Object.keys(localStorage)'))
        n0 = len(be.reqs)
        await T('ob-demo').click(); await T('demo-banner').wait_for(state='visible', timeout=8000); await r.wait_for_timeout(800)
        await T('plus-feed').click(); await r.wait_for_timeout(600)
        check('E 示例：点 + 不打开记录面板', await T('rec-save').count() == 0)
        check('E 示例：没有团团引导 / 示例句', await T('coach').count() == 0 and await T('sample-pill').count() == 0)
        for tname in ['健康', '问团子', '我的']:
            await r.get_by_text(tname, exact=True).last.click(); await r.wait_for_timeout(700)
        bb = await body(r)
        check('E 示例：我的 = 开始记我家宝宝', '开始记我家宝宝' in bb and '示例模式 · 所有数据为虚构演示数据，不会保存' in bb)
        await r.screenshot(path=O + '13-demo-me.png')
        keys1 = set(await r.evaluate('() => Object.keys(localStorage)'))
        check('E 示例：0 个 Supabase 请求', len(be.reqs) == n0, [x[1] for x in be.reqs[n0:]][:5])
        check('E 示例：localStorage 没有新增键', keys1 <= keys0, sorted(keys1 - keys0))
        await T('demo-cta').click(); await r.wait_for_timeout(800)
        check('E 示例 → 开始记我家宝宝 → 注册页', await T('ob-auth').is_visible() or await T('ob-welcome').is_visible())
        await ctx.close()

        await b.close()
    print('\nconsole/page errors:', errs); check('no console errors', not errs, errs)
    print(f'\n{len(ok)} passed, {len(bad)} failed', bad)
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    asyncio.run(main())
