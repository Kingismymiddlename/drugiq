"""Browser regression checks with synthetic local responses. No external API calls."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'atlas-public'
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True)
checks=[]
def check(name, predicate):
    assert predicate, name
    checks.append(name)


def run():
    with sync_playwright() as p:
        options={'headless':True, 'args':['--no-sandbox']}
        if os.path.exists('/usr/bin/chromium'): options['executable_path']='/usr/bin/chromium'
        browser=p.chromium.launch(**options)
        responses=[]
        status={'service':'DrugIQ Atlas','ready':True,'turnstile_site_key':'test-site-key','passwordless_browser_access':True}
        query={'status':'ok','scorer':'AVI','is_signed':False,'finite_score_count':2,'truncated':False,
               'input':{'assembly':'GRCh38','chromosome':'chr22','position':36201698,'reference':'A','alternate':'C','scorer':'AVI'},
               'rows':[{'observation_index':0,'track_index':0,'raw_score':0.0,'quantile':None,'gene':{'gene_name':'<script>window.pwned=true</script>'},'track':{'name':'Synthetic test track'}},
                       {'observation_index':0,'track_index':1,'raw_score':-0.6,'quantile':0.7,'gene':{'gene_name':'TEST'},'track':{'name':'Synthetic test track 2'}}],
               'provenance':{'provider':'SYNTHETIC TEST FIXTURE','retrieved_at':'2026-09-11T00:00:00Z'},'limitations':['Test data, not a real prediction.']}
        def route(req):
            url=req.request.url
            if url.startswith('https://drugiq.test/api/atlas_public'):
                if req.request.method=='GET': payload=status
                else:
                    data=req.request.post_data_json
                    check('turnstile proof sent with protected request', bool(data.get('turnstile_token')))
                    data={k:v for k,v in data.items() if k!='turnstile_token'}
                    responses.append(data)
                    payload={'scorers':[{'name':'AVI','is_signed':False}]} if data['action']=='scorers' else query
                req.fulfill(status=200,content_type='application/json',body=json.dumps(payload));return
            if url.startswith('https://challenges.cloudflare.com/turnstile/'):
                req.fulfill(status=200,content_type='text/javascript',body='window.turnstile={render:(el,o)=>{window.__ts=o;return 1},execute:()=>setTimeout(()=>window.__ts.callback("synthetic-turnstile-token"),0),remove:()=>{}};');return
            if url.startswith('https://drugiq.test'):
                path=url.split('https://drugiq.test',1)[1].split('#')[0].split('?')[0]
                if path=='/baseline.html': f=ROOT/'index.html'
                else: f=PUBLIC/('index.html' if path=='/' else path.lstrip('/'))
                if f.is_file():
                    mime='text/css' if f.suffix=='.css' else 'text/javascript' if f.suffix=='.js' else 'text/html'
                    req.fulfill(status=200,content_type=mime,body=f.read_text());return
            req.fulfill(status=404,body='Blocked external request in test')
        context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce',accept_downloads=True)
        context.route('**/*',route)
        def load(target, filename):
            html=filename.read_text().replace('<head>', '<head><base href="https://drugiq.test/">',1)
            html=re.sub(r'<script\b[^>]*src=[^>]*>[\s\S]*?</script>', '', html, flags=re.I)
            if filename.name=='variant-evidence.html':
                html=html.replace('<link rel="stylesheet" href="/assets/drugiq-theme.css">', '<style>'+ (PUBLIC/'assets/drugiq-theme.css').read_text()+'</style>')
                html=html.replace('</body>', '<script>'+ (ROOT/'assets/variant-evidence.js').read_text()+'</script></body>')
            target.set_content(html,wait_until='load')
        page=context.new_page()
        load(page,PUBLIC/'variant-evidence.html')
        page.wait_for_function("!document.getElementById('variant-fields').disabled")
        check('password field removed',page.locator('#research-token').count()==0)
        check('connect button removed',page.locator('#atlas-connect').count()==0)
        check('automatic protection message visible','no DrugIQ password is required' in page.locator('#atlas-status').inner_text())
        check('live scorer list populated from response',page.locator('#scorer').input_value()=='AVI')
        page.locator('#atlas-example').click()
        check('example preserves 1-based coordinate',page.locator('#position').input_value()=='36201698')
        page.locator('#research-consent').check()
        page.locator('#atlas-submit').click()
        page.locator('#atlas-results').wait_for(state='visible')
        check('only intended scientific fields reach provider facade',set(responses[-1])=={'action','assembly','chromosome','position','reference','alternate','scorer'})
        check('zero score displayed', '0.00000' in page.locator('#score-rows').inner_text())
        check('source annotations cannot execute HTML',page.evaluate('window.pwned === undefined'))
        check('verification token absent from exported result','turnstile' not in page.locator('#source-details').inner_text().lower())
        with page.expect_download() as info: page.locator('#atlas-export').click()
        download=info.value; content=json.loads(Path(download.path()).read_text());check('JSON export preserves source result',content==query)
        page.screenshot(path=str(REPORTS/'atlas-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        check('mobile page has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.screenshot(path=str(REPORTS/'atlas-mobile.png'),full_page=True)
        page.locator('#position').fill('1')
        check('changed input clears stale evidence',page.locator('#atlas-results').is_hidden())
        page.set_viewport_size({'width':1440,'height':1000})
        baseline=context.new_page();load(baseline,ROOT/'index.html');baseline.wait_for_timeout(700)
        candidate=context.new_page();load(candidate,PUBLIC/'index.html');candidate.wait_for_timeout(700)
        tools=['welcome','dossier','scisynth','targetscope','bindpredict','biosignal','repurposerx','trialmatch','alphamissense','molprofile','combinedrx','immuniq','pathogenrx']
        for tool in tools:
            for target in (baseline,candidate): target.evaluate('(id)=>go(id,true)',tool)
            original=baseline.locator('#content').inner_text();updated=candidate.locator('#content').inner_text()
            check('unchanged rendered tool: '+tool,original==updated)
            check('unchanged form IDs: '+tool,baseline.locator('#content input,#content select').evaluate_all('(els)=>els.map(e=>e.id)')==candidate.locator('#content input,#content select').evaluate_all('(els)=>els.map(e=>e.id)'))
        for target in (baseline,candidate):target.evaluate("go('dossier',true);applyDossierEx(0)")
        check('dossier example preserved',baseline.locator('#f-d-target').input_value()==candidate.locator('#f-d-target').input_value()=='KRAS')
        for target in (baseline,candidate):target.evaluate('toggleGuide()')
        check('guide mode preserved',baseline.evaluate('guide')==candidate.evaluate('guide'))
        for target in (baseline,candidate):target.evaluate('cbotToggle()')
        check('assistant opens in both versions',baseline.locator('#cbot-panel').evaluate("e=>e.classList.contains('open')") and candidate.locator('#cbot-panel').evaluate("e=>e.classList.contains('open')"))
        check('one link added without replacing tool navigation',candidate.locator('[data-atlas-nav]').count()==1)
        status['ready']=False
        page.close();page=context.new_page();load(page,PUBLIC/'variant-evidence.html');page.wait_for_timeout(300)
        check('unconfigured preview displays honest state','not configured' in page.locator('#atlas-status').inner_text())
        check('disabled API blocks UI',page.locator('#variant-fields').evaluate('(e)=>e.disabled'))
        browser.close()
    (REPORTS/'browser-checks.json').write_text(json.dumps({'passed':len(checks),'failed':0,'mode':'In-memory rendering; synthetic provider and Turnstile responses','checks':checks},indent=2))
    print(f'{len(checks)} browser checks passed. Live scientific APIs were NOT called.')

if __name__=='__main__':run()
