import asyncio
from playwright.async_api import async_playwright
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
KEYS=['编辑首页卡片','首页 · 6 张','睡眠','选中第','全部类型','尿尿','便便','恢复默认','已在首页的类型再点一下，会和选中的那张换位置']
JS='''(keys)=>{const out={};const all=[...document.querySelectorAll('body *')].filter(e=>e.tagName!=='SCRIPT');
for(const k of keys){let best=null;for(const el of all){const t=(el.textContent||'').trim();if(t===k||(k==='选中第'&&t.startsWith(k)&&t.length<20)){if(!best||el.getBoundingClientRect().width<best.getBoundingClientRect().width)best=el}}
let e=best,chain=[];for(let i=0;e&&i<3;i++,e=e.parentElement){const r=e.getBoundingClientRect();chain.push([r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10).join(','))}
out[k]=chain.join(' | ')}
const sh=document.querySelector('.sheet');if(sh){const r=sh.getBoundingClientRect();out.sheet=[r.y,r.height]}
return out}'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844})
    a=await ctx.new_page();await a.goto(PROTO);await a.wait_for_function('window.__ready');await a.wait_for_timeout(1500)
    await a.locator('.editc').first.click();await a.wait_for_timeout(1500)
    r=await ctx.new_page();await r.goto(BASE+'/');await r.wait_for_timeout(3500)
    await r.get_by_text('编辑卡片',exact=True).click();await r.wait_for_timeout(1500)
    A=await a.evaluate(JS,KEYS);R=await r.evaluate(JS,KEYS)
    for k in A:print(k[:8],'\n  P',A[k],'\n  R',R.get(k))
    await b.close()
asyncio.run(main())
