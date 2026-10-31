import asyncio
from playwright.async_api import async_playwright
JS='''()=>{const e=[...document.querySelectorAll('div')].find(e=>e.children.length==0&&e.textContent.trim()==='喂奶 3 次');const c=getComputedStyle(e);return [c.fontFamily,c.fontWeight,c.fontSize]}'''
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    r=await (await b.new_context()).new_page();await r.goto('http://localhost:8090/');await r.wait_for_timeout(3500)
    print(await r.evaluate(JS));await b.close()
asyncio.run(main())
