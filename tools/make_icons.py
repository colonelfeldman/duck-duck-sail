# Renders icons/icon-192.png and icon-512.png from the Cruise Duck art. Run: python3 tools/make_icons.py
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
art = (root / 'js/art.js').read_text()
html = f"""<html><body style="margin:0"><div id=i style="width:512px;height:512px;display:grid;place-items:center;
background:radial-gradient(circle at 50% 40%,#5CC4FF,#0B4F8A)"><div id=d style="width:330px;height:380px"></div></div>
<script>{art}; document.getElementById('d').innerHTML = ART.duckSVG(1,false);
document.querySelector('#d svg').style.cssText='width:100%;height:100%';
document.querySelectorAll('.eye-s,.eye-h').forEach(e=>e.remove());</script></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for size in (512, 192):
        pg = b.new_page(viewport={'width': 512, 'height': 512}, device_scale_factor=size / 512)
        pg.set_content(html)
        pg.locator('#i').screenshot(path=str(root / f'icons/icon-{size}.png'))
    b.close()
print('icons written')
