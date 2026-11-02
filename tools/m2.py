import asyncio
from playwright.async_api import async_playwright
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
Q=[('下次喂奶约 10:45–11:15','28px'),('喂奶 3 次','24px'),('喝水 1 次','24px'),('编辑卡片','9999px'),('下一顿预测','9999px'),('换尿布 · 尿尿','20px')]
JS='''([k,rad])=>{const all=[...document.querySelectorAll('body *')];let best=null;
for(const el of all){if((el.textContent||'').trim()===k&&el.children.length<=3){if(!best||el.getBoundingClientRect().width<best.getBoundingClientRect().width)best=el}}
let e=best;while(e&&!(getComputedStyle(e).borderTopLeftRadius===rad||(rad==='9999px'&&parseFloat(getComputedStyle(e).borderTopLeftRadius)>=99)))e=e.parentElement;
if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)}'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844})
    a=await ctx.new_page();await a.goto(PROTO);await a.wait_for_function('window.__ready');await a.wait_for_timeout(1500)
    r=await ctx.new_page();await r.goto(BASE+'/');await r.wait_for_timeout(3500)
    for q in Q:print(q[0],await a.evaluate(JS,list(q)),await r.evaluate(JS,list(q)))
    await b.close()
asyncio.run(main())
