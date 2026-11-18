# Collects training photos for the life-ring recognizer from Wikimedia Commons (thumbnails only).
#   python3 tools/ringmodel/fetch_data.py <out_dir>
# Writes <out_dir>/pos/*.jpg (real life rings) and <out_dir>/neg/*.jpg (look-alikes + ordinary ship scenes),
# plus sources.csv (file title, page URL, label) for attribution. Photos are NOT committed to the repo.
import json, os, re, subprocess, sys, time, urllib.parse, hashlib, csv

OUT = sys.argv[1] if len(sys.argv) > 1 else 'ringdata'
UA = 'duck-test-script/1.0'
API = 'https://commons.wikimedia.org/w/api.php'
THUMB_W = 320

CACHE_DIR = os.path.join(OUT, '_api_cache')
_last = [0.0]
def api(params):
    # Polite: one request per second, cache every answer, back off hard on 429 (Wikimedia rate limits).
    params = {**params, 'format': 'json', 'maxlag': 5}
    url = API + '?' + urllib.parse.urlencode(params)
    os.makedirs(CACHE_DIR, exist_ok=True)
    cpath = os.path.join(CACHE_DIR, hashlib.md5(url.encode()).hexdigest() + '.json')
    if os.path.exists(cpath):
        return json.load(open(cpath))
    for attempt in range(6):
        wait = 3.0 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        r = subprocess.run(['curl', '-s', '--max-time', '40', '-A', UA, '-w', '\n%{http_code}', url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition('\n')
        if code == '200' and body.strip().startswith('{'):
            d = json.loads(body)
            if 'error' not in d:
                json.dump(d, open(cpath, 'w'))
                return d
        pause = 60 * (attempt + 1) if code == '429' else 5
        print(f'  api {code}, waiting {pause}s', flush=True)
        time.sleep(pause)
    return {}

POS_ROOT = 'Category:Lifebuoys'
POS_SKIP = re.compile(r'in art|portrait|Horseshoe|Holmes|signs|museum|stamps|logos|heraldry|drawings|icons', re.I)
POS_SEARCH = ['lifebuoy ship', 'life ring ship deck', 'life buoy railing', 'lifebuoy pier', 'ring buoy', 'lifebuoy harbour']
NEG_SEARCH = {
    # look-alikes (hard negatives)
    'doughnut': 40, 'bagel': 30, 'tyre': 40, 'swim ring inflatable': 40, "ship's wheel": 40, 'boat fender': 40,
    'navigation buoy': 40, 'coiled rope deck': 40, 'life jacket': 30, 'wreath': 25, 'steering wheel': 25, 'hula hoop': 15,
    'red white striped': 25, 'traffic cone': 15, 'round mirror': 15, 'clock wall': 20,
    # ordinary places on a ship / in port
    'cruise ship deck': 50, 'cruise ship interior': 50, 'ship railing sea': 40, 'swimming pool deck chairs': 40,
    'restaurant interior': 40, 'buffet food': 30, 'hotel lobby': 30, 'theatre stage': 30, 'harbour quay': 40,
    'lifeboat davit': 40, 'ship funnel': 30, 'beach': 40, 'bar counter': 30, 'corridor': 25, 'staircase': 25,
}
EXCLUDE_NEG = ' -lifebuoy -lifebuoys -"life ring" -"life buoy" -"ring buoy" -rettungsring -bouée'

def files_in_category(cat, depth, seen_cats, out):
    if depth < 0 or cat in seen_cats: return
    seen_cats.add(cat)
    cont = {}
    while True:
        d = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmlimit': 500, 'cmtype': 'file|subcat', **cont})
        for m in d.get('query', {}).get('categorymembers', []):
            if m['ns'] == 6: out.add(m['title'])
            elif m['ns'] == 14 and not POS_SKIP.search(m['title']): files_in_category(m['title'], depth - 1, seen_cats, out)
        if 'continue' in d: cont = d['continue']
        else: break

def search_files(q, limit):
    d = api({'action': 'query', 'list': 'search', 'srsearch': q, 'srnamespace': 6, 'srlimit': min(limit * 2, 100)})
    return [x['title'] for x in d.get('query', {}).get('search', [])]

def thumbs(titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        d = api({'action': 'query', 'titles': '|'.join(titles[i:i + 40]), 'prop': 'imageinfo', 'iiprop': 'url|mime', 'iiurlwidth': THUMB_W})
        for p in d.get('query', {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [{}])[0]
            if ii.get('mime') in ('image/jpeg', 'image/png') and ii.get('thumburl'):
                out[p['title']] = (ii['thumburl'].split('?')[0], ii.get('descriptionurl', ''))
    return out

def download(items, folder, label, writer):
    os.makedirs(folder, exist_ok=True)
    n = 0
    for title, (url, page) in items.items():
        name = hashlib.md5(title.encode()).hexdigest()[:12] + '.jpg'
        path = os.path.join(folder, name)
        if not os.path.exists(path):
            for attempt in range(4):
                r = subprocess.run(['curl', '-sL', '--max-time', '40', '-A', UA, '-o', path, '-w', '%{http_code}', url], capture_output=True, text=True)
                time.sleep(0.6)
                if r.stdout == '429': print('  image 429, waiting', 60 * (attempt + 1), flush=True); time.sleep(60 * (attempt + 1)); continue
                break
            if r.stdout != '200' or not os.path.exists(path) or os.path.getsize(path) < 2000:
                if os.path.exists(path): os.remove(path)
                continue
        writer.writerow([title, page, label, name]); n += 1
    return n

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    pos = set()
    files_in_category(POS_ROOT, 2, set(), pos)
    for q in POS_SEARCH: pos.update(search_files(q, 50))
    pos = {t for t in pos if not re.search(r'horseshoe|sign|logo|icon|svg|stamp|drawing|painting', t, re.I)}
    print('positive candidates:', len(pos), flush=True)
    neg = set()
    for q, k in NEG_SEARCH.items():
        got = [t for t in search_files(q + EXCLUDE_NEG, k) if t not in pos][:k]
        neg.update(got); print(f'  neg "{q}": {len(got)}', flush=True)
    print('negative candidates:', len(neg))
    with open(os.path.join(OUT, 'sources.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['title', 'page', 'label', 'file'])
        print('pos downloaded:', download(thumbs(pos), os.path.join(OUT, 'pos'), 'pos', w))
        print('neg downloaded:', download(thumbs(neg), os.path.join(OUT, 'neg'), 'neg', w))
