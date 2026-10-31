import asyncio
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    r=await (await b.new_context()).new_page();await r.goto('http://localhost:8090/');await r.wait_for_timeout(3500)
    print(await r.evaluate("()=>[document.querySelectorAll('.t-body').length,document.querySelectorAll('[class*=t-]').length,(document.querySelector('svg g')||{}).outerHTML?.slice(0,300)]"));await b.close()
asyncio.run(main())
