"""改名「团子育儿本」截图确认：欢迎页标题、首页、我的（关于 + 底部版本行）、关于页、给医生看摘要页脚。"""
import asyncio
from playwright.async_api import async_playwright
O='/workspace/yijuji-app/shots/rename/'
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,timezone_id='Asia/Shanghai')
    r=await ctx.new_page(); T=r.get_by_test_id; errs=[]
    r.on('pageerror',lambda e:errs.append(str(e)))
    await r.goto('http://localhost:8090/'); await r.wait_for_timeout(2500)
    print('title:', await r.title())
    await r.screenshot(path=O+'01-welcome.png')
    # 标题是否单行：测欢迎标题高度
    h=await r.evaluate("""()=>{const el=[...document.querySelectorAll('div')].filter(d=>d.childElementCount===0&&d.textContent.trim()==='欢迎来到团子育儿本')[0];if(!el)return null;const b=el.getBoundingClientRect();const lh=parseFloat(getComputedStyle(el).lineHeight)||parseFloat(getComputedStyle(el).fontSize)*1.3;return {h:b.height,w:b.width,fs:getComputedStyle(el).fontSize,lines:Math.round(b.height/lh)}}""")
    print('welcome title box:', h)
    await T('ob-agree').click(); await T('ob-continue').click(); await r.wait_for_timeout(600)
    await T('pf-name').fill('豆米'); await T('pf-bd').fill('2026-03-28'); await T('pf-gender-girl').click(); await T('pf-submit').click(); await r.wait_for_timeout(2500)
    await r.screenshot(path=O+'02-home.png')
    await r.get_by_text('我的',exact=True).last.click(); await r.wait_for_timeout(900)
    await T('about').scroll_into_view_if_needed(); await r.wait_for_timeout(300); await r.screenshot(path=O+'03-me.png')
    await T('about').click(); await r.wait_for_timeout(900); await r.screenshot(path=O+'04-about.png')
    print('errors:', errs[:3])
    await b.close()
asyncio.run(main())
