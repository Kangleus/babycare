import asyncio
from playwright.async_api import async_playwright
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
JS='''()=>{const all=[...document.querySelectorAll('body *')];const c=all.filter(e=>e.tagName!=='SCRIPT'&&(e.textContent||'').trim().includes('早上好呀')&&(e.textContent||'').includes('多醒')).sort((a,b)=>a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0];
const out=[];const walk=(e,d)=>{const r=e.getBoundingClientRect();out.push(' '.repeat(d)+e.tagName+' '+[r.y,r.height].map(v=>Math.round(v*10)/10).join(',')+' '+(e.children.length?'':(e.textContent||'').slice(0,12)));for(const ch of e.children)if(ch.tagName!=='svg'&&ch.tagName!=='g')walk(ch,d+1)};walk(c,0);return out.join('\\n')}'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844})
    a=await ctx.new_page();await a.goto(PROTO);await a.wait_for_function('window.__ready');await a.wait_for_timeout(1500)
    r=await ctx.new_page();await r.goto(BASE+'/');await r.wait_for_timeout(3500)
    print(await a.evaluate(JS));print('----');print(await r.evaluate(JS))
    await b.close()
asyncio.run(main())
