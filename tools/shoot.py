import asyncio
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import paths
BASE = paths.BASE_URL
PROTO = paths.require_proto()
OUT = paths.O
def side(a,b,o):
  A=Image.open(OUT+a).convert('RGB');B=Image.open(OUT+b).convert('RGB')
  c=Image.new('RGB',(A.width*2+20,A.height),'white');c.paste(A,(0,0));c.paste(B,(A.width+20,0));c.save(OUT+o)
  d=ImageChops.difference(A,B).convert('L');px=sum(1 for v in d.getdata() if v>40)
  print(o,'differing px (>40):',px,f'{px/(A.width*A.height)*100:.2f}%')
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=paths.CHROME,args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    a=await ctx.new_page();await a.goto(PROTO);await a.wait_for_function('window.__ready');await a.wait_for_timeout(1800)
    r=await ctx.new_page();errs=[];r.on('pageerror',lambda e:errs.append(str(e)))
    await r.goto(BASE+'/');await r.wait_for_timeout(4000)
    FZ='*,*:before,*:after{animation:none!important;transition:none!important}'
    await a.add_style_tag(content=FZ);await r.add_style_tag(content=FZ);await a.wait_for_timeout(300)
    await a.screenshot(path=OUT+'proto-home.png');await r.screenshot(path=OUT+'rn-home.png');side('proto-home.png','rn-home.png','compare-home.png')
    for n,l in [('health','健康'),('ai','问团子'),('me','我的')]:
      await a.locator('.tabbar .tab',has_text=l).first.click();await a.wait_for_timeout(1200)
      await r.get_by_text(l,exact=True).last.click();await r.wait_for_timeout(1200)
      await a.screenshot(path=OUT+f'proto-{n}.png');await r.screenshot(path=OUT+f'rn-{n}.png');side(f'proto-{n}.png',f'rn-{n}.png',f'compare-{n}.png')
    # night + editor (RN)
    await r.get_by_text('今天',exact=True).last.click();await r.wait_for_timeout(800)
    await a.locator('.tabbar .tab',has_text='今天').first.click();await a.wait_for_timeout(800)
    await a.locator('.editc').first.click();await a.wait_for_timeout(1200)
    await r.get_by_text('编辑卡片',exact=True).click();await r.wait_for_timeout(1200)
    await a.screenshot(path=OUT+'proto-editor.png');await r.screenshot(path=OUT+'rn-editor.png');side('proto-editor.png','rn-editor.png','compare-editor.png')
    print('errs',errs)
    await b.close()
asyncio.run(main())
