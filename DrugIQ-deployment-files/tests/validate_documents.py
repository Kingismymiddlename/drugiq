"""Independent local structure checks. Requires bs4 and jsonschema, not network access."""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parents[1]
m = json.loads((root / 'dist/site.json').read_text())
checks = []
def check(name, value, detail=None):
    checks.append({'name': name, 'pass': bool(value), 'detail': detail})

schema = json.loads(m['resources']['/openapi.json']['body'])['components']['schemas']['ResearchTool']
Draft202012Validator.check_schema(schema)
v = Draft202012Validator(schema, format_checker=FormatChecker())
for tool in m['catalog']['tools']:
    check('Catalog JSON Schema ' + tool['id'], not list(v.iter_errors(tool)))
xml = ET.fromstring(m['resources']['/sitemap.xml']['body'])
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
check('Sitemap parses as XML with correct namespace', xml.tag == '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
check('Sitemap has all canonical pages', len(xml.findall('s:url', ns)) == len(m['pages']))
known = set(m['resources']) | set(m['aliases']) | {'/api/catalog', '/.well-known/mcp'} | {'/api/catalog/' + x['id'] for x in m['catalog']['tools']}
for path in m['pages']:
    soup = BeautifulSoup(m['resources'][path]['html'], 'html.parser')
    for link in soup.find_all(['a', 'link', 'script']):
        target = link.get('href') or link.get('src')
        if not target or target.startswith(('#', 'mailto:', 'data:')):
            continue
        parsed = urlparse(target)
        if parsed.netloc and parsed.netloc != urlparse(m['config']['url']).netloc:
            continue
        destination = parsed.path or '/'
        check('Internal reference ' + path + ' -> ' + target, destination in known)
    check('One canonical on ' + path, len(soup.find_all('link', rel='canonical')) == 1)
    check('One H1 on ' + path, len(soup.find_all('h1')) == 1)
    for script in soup.find_all('script', type='application/ld+json'):
        data = json.loads(script.string)
        check('Valid JSON-LD ' + path, data.get('@context') == 'https://schema.org')
llms = m['resources']['/llms.txt']['body']
for label, url in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', llms):
    check('llms.txt link ' + label, urlparse(url).path in known)
raw = BeautifulSoup(m['resources']['/']['html'], 'html.parser')
landing_chars = len(raw.select_one('#landing-view').get_text(' ', strip=True))
check('Homepage raw landing text exceeds 500 characters', landing_chars >= 500, {'characters': landing_chars})
report = {'checks': len(checks), 'passed': sum(x['pass'] for x in checks), 'failed': sum(not x['pass'] for x in checks), 'homepageRawLandingCharacters': landing_chars, 'results': checks}
(root / 'reports/document-validation.json').write_text(json.dumps(report, indent=2))
print(json.dumps({k: report[k] for k in ['checks','passed','failed','homepageRawLandingCharacters']}, indent=2))
if report['failed']:
    print(json.dumps([c for c in checks if not c['pass']], indent=2))
raise SystemExit(1 if report['failed'] else 0)
