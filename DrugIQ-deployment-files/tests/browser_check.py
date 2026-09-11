"""Optional visual/browser regression checks. Needs Python, Playwright, Pillow and Chromium.
Run local app on port 3000 and original source on port 3001 before executing.
Remote network requests are blocked: these tests do not validate live research services.
"""
import json
import os
import re
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True)
NEW = os.getenv('DRUGIQ_TEST_URL', 'http://127.0.0.1:3000')
OLD = os.getenv('DRUGIQ_BASELINE_URL', 'http://127.0.0.1:3001')
checks = []
MANIFEST = json.loads((ROOT / 'dist/site.json').read_text())
MEMORY = os.getenv('DRUGIQ_BROWSER_IN_MEMORY') == '1'

def in_memory_html(html):
    # Render exactly the built local asset contents without navigating the managed
    # browser to a URL. Real HTTP behavior is verified separately by verify.mjs.
    def replace_script(match):
        src = match.group(1)
        resource = MANIFEST['resources'].get(src)
        return '<script>' + resource['body'] + '</script>' if resource else ''
    html = re.sub(r'<script\b[^>]*src="([^"]+)"[^>]*>\s*</script>', replace_script, html)
    def replace_link(match):
        tag = match.group(0)
        href = re.search(r'href="([^"]+)"', tag)
        resource = MANIFEST['resources'].get(href.group(1)) if href else None
        if resource and resource['mime'].startswith('text/css'):
            import base64
            body = base64.b64decode(resource['body']).decode() if resource['encoding'] == 'base64' else resource['body']
            return '<style>' + body + '</style>'
        return tag
    return re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', replace_link, html)

def load(page, url):
    if not MEMORY:
        page.goto(url, wait_until='networkidle')
        return
    if url.startswith(OLD):
        html = (ROOT / 'source/index.html').read_text()
    else:
        from urllib.parse import urlparse
        path = urlparse(url).path or '/'
        html = MANIFEST['resources'][path]['html']
    page.set_content(in_memory_html(html), wait_until='networkidle')
    if url.endswith('#dossier'):
        page.evaluate("enterApp('dossier')")
        page.wait_for_timeout(650)

def check(name, condition, detail=None):
    checks.append({'name': name, 'pass': bool(condition), 'detail': detail})
    if not condition:
        print('FAIL:', name, detail)

def network(route):
    if route.request.url.startswith(('http://127.0.0.1:', 'data:', 'blob:')):
        route.continue_()
    else:
        route.abort()

def go_workspace(page, tool):
    page.evaluate('(id) => enterApp(id)', tool)
    page.wait_for_function("document.body.classList.contains('app-active') && !document.getElementById('veil').classList.contains('show')")
    page.wait_for_timeout(400)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce', device_scale_factor=1)
    ctx.route('**/*', network)
    old = ctx.new_page()
    new = ctx.new_page()
    errors = []
    new.on('pageerror', lambda err: errors.append(str(err)))
    load(old, OLD + '/')
    load(new, NEW + '/')
    new.wait_for_selector('.dx-hero')
    old.wait_for_timeout(400)
    new.wait_for_timeout(400)
    old.locator('.dx-hero').screenshot(path=str(REPORTS / 'ui-baseline-hero.png'), animations='disabled')
    new.locator('.dx-hero').screenshot(path=str(REPORTS / 'ui-updated-hero.png'), animations='disabled')
    a = Image.open(REPORTS / 'ui-baseline-hero.png').convert('RGB')
    b = Image.open(REPORTS / 'ui-updated-hero.png').convert('RGB')
    same_size = a.size == b.size
    if same_size:
        diff = ImageChops.difference(a, b)
        changed = sum(1 for pixel in diff.getdata() if max(pixel) > 2)
        total = a.width * a.height
    else:
        changed, total = 1, 1
    check('Desktop hero matches original visual design', same_size and changed / total < 0.0005, {'changedPixels': changed, 'totalPixels': total, 'sameSize': same_size})
    check('Trust links are visible and real', all(new.locator('.dx-footer a[href="' + path + '"]').count() == 1 for path in ['/about', '/contact', '/privacy', '/docs']))
    for stage, count in [('target', 3), ('hit', 4), ('lead', 1), ('clinical', 3), ('all', 11)]:
        new.locator('.dx-filter[onclick*="\'' + stage + '\'"]').click()
        check('Stage filter ' + stage, new.locator('#dx-tool-grid a.dx-tool:visible').count() == count)
    new.locator('a[href="/tools/dossier"]').first.click()
    new.wait_for_function("document.body.classList.contains('app-active') && !!document.getElementById('f-d-target')")
    new.wait_for_timeout(650)
    check('Primary CTA still opens original dossier form', new.locator('#f-d-target').count() == 1)
    new.locator('#runbtn').click()
    check('Dossier required-field validation unchanged', 'Please fill in target, compound, and indication.' in new.locator('#out').inner_text())
    new.evaluate('applyDossierEx(0)')
    check('Dossier examples still populate inputs', new.locator('#f-d-target').input_value() == 'KRAS' and new.locator('#f-d-compound').input_value() == 'Sotorasib')
    new.evaluate('document.getElementById("gDisease").value = ""')
    go_workspace(old, 'dossier')
    new.evaluate("go('dossier')")
    new.wait_for_timeout(400)
    old.mouse.move(0, 0); new.mouse.move(0, 0)
    old.evaluate('document.activeElement.blur()'); new.evaluate('document.activeElement.blur()')
    old.wait_for_timeout(200); new.wait_for_timeout(200)
    old.locator('#content').screenshot(path=str(REPORTS / 'ui-baseline-workspace.png'), animations='disabled')
    new.locator('#content').screenshot(path=str(REPORTS / 'ui-updated-workspace.png'), animations='disabled')
    a = Image.open(REPORTS / 'ui-baseline-workspace.png').convert('RGB')
    b = Image.open(REPORTS / 'ui-updated-workspace.png').convert('RGB')
    same = a.size == b.size
    extrema = ImageChops.difference(a, b).getextrema() if same else [(0,255)]
    maximum = max(x[1] for x in extrema)
    check('Dossier workspace visual matches within antialiasing tolerance', same and maximum <= 2, {'maximumChannelDifference': maximum, 'tolerance': 2})
    for tool in new.evaluate('Object.keys(T)'):
        new.evaluate('(id)=>go(id)', tool)
        new.wait_for_timeout(90)
        check('Existing form ' + tool, new.locator('#runbtn').count() == 1 and new.locator('.fin').count() >= 1)
        new.evaluate('()=>{const chip=document.querySelector(".chip"); if(chip) applyEx(chip);} ')
        check('Example population ' + tool, bool(new.locator('.fin').first.input_value()))
    new.evaluate("go('scisynth')")
    new.evaluate('toggleGuide()')
    check('Guide Mode still works', new.locator('body').evaluate('(e)=>e.classList.contains("guide")'))
    new.evaluate('cbotToggle()')
    check('Assistant still opens', new.locator('#cbot-panel').evaluate('(e)=>e.classList.contains("open")'))
    new.evaluate('cbotToggle()')
    new.evaluate("go('targetscope'); doHandoff('bindpredict','target','KRAS')")
    new.wait_for_timeout(220)
    check('Cross-tool handoff still works', new.locator('#f-target').input_value() == 'KRAS')
    check('No new runtime JavaScript errors', not errors, errors)
    ctx.close()

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', device_scale_factor=1)
    mobile.route('**/*', network)
    page = mobile.new_page()
    load(page, NEW + '/')
    check('Mobile homepage does not overflow horizontally', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.locator('.dx-footer').scroll_into_view_if_needed()
    check('Footer trust links fit mobile width', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.screenshot(path=str(REPORTS / 'ui-mobile-footer.png'))
    page.close(); page = mobile.new_page(); load(page, NEW + '/#dossier')
    page.wait_for_selector('#f-d-target')
    page.locator('#ux-app-menu').click()
    check('Mobile workspace navigation is preserved', page.locator('body').evaluate('(e)=>e.classList.contains("ux-drawer-open")'))
    page.keyboard.press('Escape')
    check('Mobile navigation closes by keyboard', not page.locator('body').evaluate('(e)=>e.classList.contains("ux-drawer-open")'))
    page.close(); page = mobile.new_page(); load(page, NEW + '/docs')
    check('Documentation fits a mobile viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    page.screenshot(path=str(REPORTS / 'ui-docs-mobile.png'))
    mobile.close()

    nojs = browser.new_context(java_script_enabled=False, viewport={'width': 1440, 'height': 1000})
    nojs.route('**/*', network)
    page = nojs.new_page()
    load(page, NEW + '/')
    text = page.locator('#landing-view').inner_text()
    check('Meaningful homepage content visible with JavaScript disabled', len(text) > 500, {'characters': len(text)})
    check('No-JS homepage has exactly one H1', page.locator('h1').count() == 1)
    check('No-JS hero is visible', page.locator('.dx-hero').is_visible())
    link = page.locator('#landing-view a[href="/tools/scisynth"]').first
    target = link.get_attribute('href')
    if MEMORY:
        load(page, NEW + target)
    else:
        link.click()
    check('No-JS tool link targets real readable documentation', target == '/tools/scisynth' and page.locator('h1').inner_text().startswith('DrugIQ SciSynth'))
    page.screenshot(path=str(REPORTS / 'ui-no-js-tool.png'))
    nojs.close()
    browser.close()

report = {'environment': ('In-memory Chromium rendering of source and built assets; HTTP tested separately; external requests blocked' if MEMORY else 'Local Chromium; external requests blocked; reduced-motion comparison'), 'checks': len(checks), 'passed': sum(c['pass'] for c in checks), 'failed': sum(not c['pass'] for c in checks), 'results': checks}
(REPORTS / 'browser-checks.json').write_text(json.dumps(report, indent=2))
print(json.dumps({k: report[k] for k in ['environment', 'checks', 'passed', 'failed']}, indent=2))
raise SystemExit(1 if report['failed'] else 0)
