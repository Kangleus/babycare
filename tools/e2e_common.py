"""e2e 公共装置：用 Playwright 拦截 + localStorage 播种，造出「已登录 / 已有家庭 / 有宝宝 / 有 14 天记录」的状态。

为什么这么做（见 docs/ONBOARDING-FLOW.md 与检查点报告里的 D1 决策）：
- 正式版必须登录才能记录，而测试不应该连真后端、更不应该往线上库写测试数据
- 所以拦截 /auth/v1 与 /rest/v1：会话直接塞进 supabase 的存储键，家庭/宝宝用假数据返回
- 记录用 tools/fixtures/demo.json（由 tools/fixtures/gen_demo.mjs 从 buildDemo 生成，和 App 里同一份逻辑）

用法（每套测试开头）：
    from e2e_common import seed_context, login
    await seed_context(ctx)              # 播种会话 + 宝宝 + 记录 + 健康档案
    r = await ctx.new_page(); ...
    await login(r)                       # 打开 App 并等到首页就绪
"""
import json
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJECT_REF = 'wzfbdvlmkoeftvtnmiex'
# src/data/supabase.ts 里 createClient 指定了 storageKey: 'yj-auth'
SESSION_KEY = 'yj-auth'
USER_ID = 'u-e2e'
FAMILY_ID = 'fam-e2e'
BABY_ID = 'baby-e2e'

_FIX = json.loads((ROOT / 'tools' / 'fixtures' / 'demo.json').read_text(encoding='utf-8'))
DEF_CARDS = ['feed', 'sleep', 'diaper', 'water', 'med', 'temp']

BABY_ROW = {'id': BABY_ID, 'family_id': FAMILY_ID, 'name': '豆米', 'birthday': '2026-03-28',
            'gender': 'girl', 'avatar': 'baby', 'feeding': 'formula'}
MEMBER_ROW = {'family_id': FAMILY_ID, 'user_id': USER_ID, 'role': 'admin', 'display_name': '妈妈',
              'families': {'name': '我们家'}}
SESSION = {
    'access_token': 'e2e-access-token', 'token_type': 'bearer', 'expires_in': 3600,
    'expires_at': int(time.time()) + 3600, 'refresh_token': 'e2e-refresh-token',
    'user': {'id': USER_ID, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'e2e@test.local',
             'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'},
}


def _seed_records():
    """把 fixture 里的记录 id 改成非 demo-*（linkFamily 会把 demo-* 当演示数据丢掉）。"""
    out = []
    for i, r in enumerate(_FIX['records'], 1):
        rr = dict(r)
        rr['id'] = f'e2e-{i}'
        rr['babyId'] = BABY_ID
        out.append(rr)
    return out


def _seed_health():
    h = json.loads(json.dumps(_FIX['health']))
    for kind, items in h.items():
        for x in items:
            # demo-ep1 → e2e-ep1：后缀保持可预测，测试里能直接写 past-e2e-ep1
            x['id'] = x['id'].replace('demo-', 'e2e-', 1)
            x['babyId'] = BABY_ID
    return h


CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'content-range': '0-0/1',
}


def _iso_in(hours=0):
    import datetime as _dt
    return (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=hours)).isoformat().replace('+00:00', 'Z')


async def install_routes(ctx):
    """拦截 Supabase：家庭/宝宝返回假数据，其余一律空结果，绝不落到真后端。"""
    async def handler(route):
        url = route.request.url
        method = route.request.method
        if '/rest/v1/family_members' in url:
            body = [MEMBER_ROW]
        elif '/rest/v1/babies' in url:
            body = [BABY_ROW]
        elif '/rest/v1/records' in url:
            # 写入按「回显提交的行」处理：supabase upsert 会读返回值，回空对象会被当成失败重试
            if method == 'GET':
                body = []
            else:
                try:
                    body = json.loads(route.request.post_data or '[]')
                except Exception:
                    body = []
                if isinstance(body, dict):
                    body = [body]
                await route.fulfill(status=201, content_type='application/json', body=json.dumps(body), headers=CORS)
                return
        elif '/rest/v1/rpc/create_invite' in url:
            body = [{'code': '7K2QMB', 'expires_at': _iso_in(hours=48)}]
        elif '/rest/v1/rpc/bump_ai_usage' in url:
            body = {'used': 1, 'limit': 20}
        elif '/rest/v1/rpc/create_family' in url or '/rest/v1/rpc/create_family_with_baby' in url:
            body = [{'family_id': FAMILY_ID, 'baby_id': BABY_ID}]
        elif '/rest/v1/rpc/' in url:
            body = None
        elif '/rest/v1/' in url:
            body = [] if method == 'GET' else {}
        elif '/auth/v1/' in url:
            body = {}
        else:
            return await route.continue_()
        # 跨域请求必须带 CORS 头，否则浏览器按网络错误处理（supabase 会当成 offline）
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers=CORS)

    await ctx.route('**/*', handler)


async def seed_context(ctx, night=False):
    """在页面脚本之前写入会话 / 宝宝 / 记录 / 健康档案（每次导航都会执行）。"""
    data = {
        SESSION_KEY: SESSION,
        'yj:v1:baby': _FIX['baby'],
        'yj:v1:records': _seed_records(),
        'yj:v1:health': _seed_health(),
        'yj:v1:members': [{'id': 'local', 'name': '妈妈', 'role': 'admin', 'isLocal': True}],
        'yj:v1:settings': {'consentAt': '2026-10-31T02:20:00Z', 'onboarded': True, 'night': night,
                           'cards': DEF_CARDS, 'sample': 0, 'lvl': 3, 'xp': 37},
    }
    payload = json.dumps(data, ensure_ascii=False)
    # 只在第一次导航时播种：init script 每次导航都会执行，
    # 若不设标记，reload 后会把用户刚改的数据又覆盖成 fixture（reload 持久化用例会假失败）
    await ctx.add_init_script(f"""(() => {{
      try {{
        if (localStorage.getItem('__e2e_seeded')) return;
        const d = {payload};
        for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v));
        localStorage.setItem('__e2e_seeded', '1');
      }} catch (e) {{}}
    }})();""")


async def login(page, base_url, timeout=60000):
    """打开 App 并等到首页就绪（底部 Tab 出现 + 时间线有记录）。"""
    await page.goto(base_url, wait_until='domcontentloaded')
    await page.get_by_text('今天', exact=True).last.wait_for(state='visible', timeout=timeout)
    await page.get_by_test_id('tl-count').wait_for(state='visible', timeout=timeout)
    return page


def records_count():
    return len(_seed_records())
