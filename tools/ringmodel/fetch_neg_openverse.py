# "Not a life ring" photos from Openverse (openly licensed images, mostly Flickr) — Wikimedia throttles anonymous use.
#   python3 tools/ringmodel/fetch_neg_openverse.py <out_dir>     → <out_dir>/neg/*.jpg  + neg_sources.csv
import csv, hashlib, json, os, re, subprocess, sys, time, urllib.parse

OUT = sys.argv[1]
UA = 'duck-test-script/1.0'
API = 'https://api.openverse.org/v1/images/'
LIFE = re.compile(r'life ?(buoy|ring|preserver|saver)|lifebuoy|rettungsring|bou[ée]e', re.I)
QUERIES = {
    # look-alikes (hard negatives)
    'doughnut': 40, 'bagel': 30, 'tire': 40, 'pool float': 40, 'inflatable ring': 30, 'ship wheel': 40, 'boat fender': 40,
    'buoy': 30, 'coiled rope': 40, 'life jacket': 30, 'wreath': 25, 'steering wheel': 25, 'hula hoop': 20,
    'striped umbrella': 25, 'traffic cone': 15, 'round mirror': 15, 'wall clock': 20, 'frisbee': 15, 'target archery': 15,
    # ordinary places on a ship / in port
    'cruise ship deck': 60, 'cruise ship interior': 50, 'ship railing': 40, 'pool deck': 40, 'restaurant interior': 40,
    'buffet': 30, 'hotel lobby': 30, 'theater stage': 30, 'harbor': 40, 'lifeboat': 40, 'ship funnel': 30, 'beach': 40,
    'bar counter': 30, 'hallway': 25, 'staircase': 25, 'deck chairs': 30, 'cabin': 20, 'casino': 20,
}

def get(url):
    for attempt in range(4):
        r = subprocess.run(['curl', '-s', '--max-time', '40', '-A', UA, '-w', '\n%{http_code}', url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition('\n')
        if code == '200': return json.loads(body)
        print('  openverse', code, 'waiting', 10 * (attempt + 1), flush=True); time.sleep(10 * (attempt + 1))
    return {}

os.makedirs(os.path.join(OUT, 'neg'), exist_ok=True)
seen, total = set(), 0
with open(os.path.join(OUT, 'neg_sources.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['title', 'page', 'license', 'creator', 'file'])
    for q, want in QUERIES.items():
        got, page = 0, 1
        while got < want and page <= 3:
            d = get(API + '?' + urllib.parse.urlencode({'q': q, 'page_size': 20, 'page': page, 'mature': 'false'}))
            time.sleep(2)
            res = d.get('results', [])
            if not res: break
            for r in res:
                if got >= want: break
                text = ' '.join([r.get('title') or ''] + [t.get('name', '') for t in (r.get('tags') or [])])
                if r['id'] in seen or LIFE.search(text): continue
                seen.add(r['id'])
                name = hashlib.md5(r['id'].encode()).hexdigest()[:12] + '.jpg'
                path = os.path.join(OUT, 'neg', name)
                x = subprocess.run(['curl', '-sL', '--max-time', '30', '-A', UA, '-o', path, '-w', '%{http_code}', r['thumbnail']], capture_output=True, text=True)
                if x.stdout != '200' or not os.path.exists(path) or os.path.getsize(path) < 2000:
                    if os.path.exists(path): os.remove(path)
                    continue
                w.writerow([r.get('title'), r.get('foreign_landing_url'), r.get('license'), r.get('creator'), name])
                got += 1; total += 1
                time.sleep(0.3)
            page += 1
        print(f'  "{q}": {got}', flush=True)
print('negatives downloaded:', total)
