import asyncio
from playwright.async_api import async_playwright
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    r=await (await b.new_context(viewport={'width':390,'height':844})).new_page();await r.goto(BASE+'/');await r.wait_for_timeout(3500)
    print(await r.evaluate("""()=>{const d=[...document.querySelectorAll('div')].filter(e=>{const r=e.getBoundingClientRect();return r.width===3&&r.height===3});if(!d.length)return 'none';let e=d[0],o=[];for(let i=0;i<4;i++,e=e.parentElement){const r=e.getBoundingClientRect();o.push([r.x,r.y,r.width,r.height,getComputedStyle(e).backgroundColor].join(','))}return d.length+' '+o.join(' | ')}"""));await b.close()
asyncio.run(main())
