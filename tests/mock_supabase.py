# In-memory stand-in for the Supabase endpoints the game uses (auth + dds_profiles/dds_saves/dds_creatures),
# installed on a Playwright browser context with route(). Lets tests sign in and sync without touching the
# real All Ashore project. (Real row-level security was tested against the real database separately.)
import json, re, time, uuid, urllib.parse

SUPA = 'https://fubiwzfddoboajjkvfph.supabase.co'

class MockSupabase:
    def __init__(self, users=None):
        self.users = users or {'tester@example.com': {'password': 'duckduck123', 'id': str(uuid.uuid4()), 'confirmed': True}}
        self.tokens = {}
        self.tables = {'dds_profiles': [], 'dds_saves': [], 'dds_creatures': []}
        self.calls = []
        self.fail = False      # simulate the server being unreachable

    # ---------- helpers ----------
    def _user_for(self, req):
        auth = req.headers.get('authorization', '')
        tok = auth.replace('Bearer ', '')
        return self.tokens.get(tok)

    def _session(self, email):
        u = self.users[email]
        tok = 'tok-' + uuid.uuid4().hex
        self.tokens[tok] = u['id']
        user = {'id': u['id'], 'aud': 'authenticated', 'role': 'authenticated', 'email': email, 'email_confirmed_at': '2026-01-01T00:00:00Z',
                'app_metadata': {'provider': 'email'}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}
        return {'access_token': tok, 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600,
                'refresh_token': 'r-' + uuid.uuid4().hex, 'user': user}

    def _own_profile_ids(self, uid):
        return {p['id'] for p in self.tables['dds_profiles'] if p['account_id'] == uid}

    def _visible(self, table, uid):
        rows = self.tables[table]
        if table == 'dds_profiles': return [r for r in rows if r['account_id'] == uid]
        ids = self._own_profile_ids(uid)
        return [r for r in rows if r['profile_id'] in ids]

    @staticmethod
    def _filters(qs):
        out = []
        for k, vs in qs.items():
            if k in ('select', 'order', 'on_conflict', 'limit', 'columns'): continue
            for v in vs: out.append((k, v))
        return out

    @staticmethod
    def _match(row, filters):
        for col, expr in filters:
            op, _, val = expr.partition('.')
            cell = row.get(col)
            if op == 'eq' and str(cell) != val: return False
            if op == 'is' and val == 'null' and cell is not None: return False
            if op == 'in':
                vals = [v.strip('"') for v in val.strip('()').split(',')]
                if str(cell) not in vals: return False
        return True

    # ---------- routing ----------
    def install(self, ctx):
        ctx.route(re.compile(r'^' + re.escape(SUPA) + r'/(auth|rest)/v1/.*'), self._handle)

    def _json(self, route, status, body, headers=None):
        route.fulfill(status=status, body=json.dumps(body) if body is not None else '', headers={
            'content-type': 'application/json', 'access-control-allow-origin': '*',
            'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', **(headers or {})})

    def _handle(self, route, request):
        url = urllib.parse.urlparse(request.url)
        qs = urllib.parse.parse_qs(url.query)
        path = url.path
        self.calls.append((request.method, path, url.query))
        if request.method == 'OPTIONS': return self._json(route, 200, None)
        if self.fail: return route.abort('internetdisconnected')
        body = request.post_data
        data = json.loads(body) if body else None

        # ---- auth ----
        if path == '/auth/v1/token':
            if qs.get('grant_type') == ['password']:
                u = self.users.get(data.get('email'))
                if not u or u['password'] != data.get('password'):
                    return self._json(route, 400, {'error': 'invalid_grant', 'error_description': 'Invalid login credentials', 'msg': 'Invalid login credentials', 'code': 'invalid_credentials'})
                return self._json(route, 200, self._session(data['email']))
            return self._json(route, 400, {'msg': 'unsupported'})
        if path == '/auth/v1/signup':
            if data['email'] in self.users: return self._json(route, 422, {'msg': 'User already registered', 'code': 'user_already_exists'})
            self.users[data['email']] = {'password': data['password'], 'id': str(uuid.uuid4()), 'confirmed': False}
            return self._json(route, 200, {'id': self.users[data['email']]['id'], 'email': data['email'], 'aud': 'authenticated', 'role': 'authenticated', 'identities': [{}]})
        if path == '/auth/v1/recover': return self._json(route, 200, {})
        if path == '/auth/v1/logout': return route.fulfill(status=204, headers={'access-control-allow-origin': '*'})
        if path == '/auth/v1/user':
            uid = self._user_for(request)
            if not uid: return self._json(route, 401, {'msg': 'not signed in'})
            email = next(e for e, u in self.users.items() if u['id'] == uid)
            return self._json(route, 200, self._session(email)['user'])

        # ---- rest ----
        m = re.match(r'^/rest/v1/(\w+)$', path)
        if not m or m.group(1) not in self.tables: return self._json(route, 404, {'message': 'no such table'})
        table = m.group(1)
        uid = self._user_for(request)
        if not uid: return self._json(route, 401, {'message': 'permission denied', 'code': '42501'})
        single = 'vnd.pgrst.object' in request.headers.get('accept', '')
        filters = self._filters(qs)

        if request.method == 'GET':
            rows = [r for r in self._visible(table, uid) if self._match(r, filters)]
            if 'order' in qs:
                col = qs['order'][0].split('.')[0]; rows = sorted(rows, key=lambda r: r.get(col) or '')
            if single:
                if len(rows) != 1: return self._json(route, 406, {'code': 'PGRST116', 'message': 'JSON object requested, multiple (or no) rows returned', 'details': f'{len(rows)} rows'})
                return self._json(route, 200, rows[0])
            return self._json(route, 200, rows)

        if request.method == 'POST':
            items = data if isinstance(data, list) else [data]
            pk = 'profile_id' if table == 'dds_saves' else 'id'
            out = []
            for it in items:
                if table == 'dds_profiles':
                    if it.get('account_id') != uid: return self._json(route, 403, {'message': 'new row violates row-level security policy', 'code': '42501'})
                    if len([p for p in self.tables[table] if p['account_id'] == uid]) >= 8: return self._json(route, 400, {'message': 'profile limit reached (8 per account)'})
                    it = {'id': str(uuid.uuid4()), 'is_kid': False, 'avatar': None, 'created_at': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()), 'archived_at': None, **it}
                elif it.get('profile_id') not in self._own_profile_ids(uid):
                    return self._json(route, 403, {'message': 'new row violates row-level security policy', 'code': '42501'})
                existing = next((r for r in self.tables[table] if r.get(pk) == it.get(pk)), None) if it.get(pk) else None
                if existing:
                    if 'resolution=merge-duplicates' not in request.headers.get('prefer', ''):
                        return self._json(route, 409, {'code': '23505', 'message': 'duplicate key'})
                    existing.update(it); out.append(existing)
                else:
                    self.tables[table].append(it); out.append(it)
            if 'return=representation' in request.headers.get('prefer', ''):
                return self._json(route, 201, out[0] if single else out)
            return route.fulfill(status=201, headers={'access-control-allow-origin': '*'})

        if request.method == 'PATCH':
            rows = [r for r in self._visible(table, uid) if self._match(r, filters)]
            for r in rows: r.update(data)
            return route.fulfill(status=204, headers={'access-control-allow-origin': '*'})

        return self._json(route, 405, {'message': 'method not allowed'})

    # ---------- test helpers ----------
    def creatures(self, alive=True):
        return [r for r in self.tables['dds_creatures'] if not alive or not r.get('released_at')]


def login(pg, email='tester@example.com', password='duckduck123', profile='Tester', kid=False, wait_deck=True):
    """Sign in through the real UI; create/choose a profile; land on the Deck."""
    pg.wait_for_selector('#scr-auth:not([hidden]), #scr-profiles:not([hidden]), #scr-deck:not([hidden])', timeout=15000)
    if pg.is_visible('#scr-auth'):
        pg.fill('#auth-email', email); pg.fill('#auth-pass', password); pg.click('#auth-submit')
        pg.wait_for_selector('#scr-profiles:not([hidden]), #scr-deck:not([hidden])', timeout=15000)
    if pg.is_visible('#scr-profiles'):
        card = pg.locator('.pcard', has_text=profile)
        if card.count():
            card.first.click()
        else:
            if not pg.is_visible('#profiles-form'): pg.click('#profiles-add')
            pg.fill('#pf-name', profile)
            if kid: pg.check('#pf-kid')
            pg.click('#pf-submit')
            pg.wait_for_timeout(400)
            if pg.is_visible('#scr-profiles'):
                pg.locator('.pcard', has_text=profile).first.click()
    if wait_deck: pg.wait_for_selector('#scr-deck:not([hidden])', timeout=15000)
    pg.wait_for_timeout(300)
    if pg.is_visible('#sheet') and 'Bring your ducks' in pg.inner_text('#sheet'): pg.click('#sheet [data-act="no"]')
