import asyncio,json
from playwright.async_api import async_playwright
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
KEYS=['豆米','团团 Lv.3','下一顿预测','下次喂奶约 10:45–11:15','今天','编辑卡片','喂奶 3 次','喝水 1 次','今日时间线','睡觉 · 1h15m','按住说话','健康','换一句']
JS='''(keys)=>{const out={};const all=[...document.querySelectorAll('body *')];
for(const k of keys){let best=null;for(const el of all){if(el.children.length>3)continue;const t=(el.textContent||'').trim();if(t===k){const r=el.getBoundingClientRect();if(r.width>0&&(!best||r.width*r.height<best.width*best.height))best=r}}
out[k]=best?[Math.round(best.x),Math.round(best.y),Math.round(best.width),Math.round(best.height)]:null}return out}'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844})
    a=await ctx.new_page();await a.goto(PROTO);await a.wait_for_function('window.__ready');await a.wait_for_timeout(1500)
    r=await ctx.new_page();await r.goto(BASE+'/');await r.wait_for_timeout(3500)
    A=await a.evaluate(JS,KEYS);R=await r.evaluate(JS,KEYS)
    for k in KEYS:print(f'{k:24s} proto={A[k]} rn={R[k]}')
    await b.close()
asyncio.run(main())
