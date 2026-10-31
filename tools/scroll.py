import asyncio,sys
from playwright.async_api import async_playwright
from PIL import Image
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    a=await ctx.new_page();await a.goto('file:///workspace/yijuji-prototype/index.html');await a.wait_for_function('window.__ready');await a.wait_for_timeout(1500)
    r=await ctx.new_page();await r.goto('http://localhost:8090/');await r.wait_for_timeout(3500)
    for i,dy in enumerate([600,1200,1800]):
      for pg in (a,r):
        await pg.mouse.move(195,500);await pg.mouse.wheel(0,600);await pg.wait_for_timeout(900)
      await a.screenshot(path=f'shots/proto-scroll{i}.png');await r.screenshot(path=f'shots/rn-scroll{i}.png')
      A=Image.open(f'shots/proto-scroll{i}.png');R=Image.open(f'shots/rn-scroll{i}.png')
      c=Image.new('RGB',(A.width*2+20,A.height),'white');c.paste(A,(0,0));c.paste(R,(A.width+20,0));c.save(f'shots/compare-scroll{i}.png')
    await b.close()
asyncio.run(main())
