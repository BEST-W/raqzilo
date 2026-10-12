"""Private SQLite storage. Keep DATA_DIR on a persistent volume, outside public/."""
import json, os, re, secrets, sqlite3, threading, time
from pathlib import Path

class Database:
    def __init__(self, path):
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        if path != ':memory:': os.chmod(path,0o600)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, request_key TEXT, data TEXT NOT NULL, UNIQUE(user_id, request_key));
        CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, data TEXT NOT NULL);
        ''')
        self.db.commit()
    def get(self, key, default):
        with self.lock:
            row = self.db.execute('SELECT data FROM config WHERE key=?', (key,)).fetchone()
            return json.loads(row[0]) if row else default
    def put(self, key, value):
        with self.lock, self.db:
            self.db.execute('INSERT OR REPLACE INTO config VALUES (?,?)', (key,json.dumps(value,ensure_ascii=False)))
    def orders(self, user=None):
        with self.lock:
            sql = 'SELECT data FROM orders'
            rows = self.db.execute(sql + (' WHERE user_id=?' if user is not None else '') + ' ORDER BY rowid DESC', () if user is None else (user,)).fetchall()
            return [json.loads(r[0]) for r in rows]
    def add(self, user, order, key=None):
        with self.lock, self.db:
            if key:
                row=self.db.execute('SELECT data FROM orders WHERE user_id=? AND request_key=?',(user,key)).fetchone()
                if row:
                    existing=json.loads(row[0])
                    if existing.get('brief') != order.get('brief'): raise ValueError('Request key reused for another brief')
                    return existing
            order={**order,'user_id':user}
            self.db.execute('INSERT INTO orders VALUES (?,?,?,?)',(order['id'],user,key,json.dumps(order,ensure_ascii=False)))
            return order
    def service(self, user, brief, key):
        if not isinstance(brief,dict) or not isinstance(key,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{16,80}',key): raise ValueError('Invalid request key')
        limits={'name':80,'kind':80,'idea':1200}
        clean={}
        for field,limit in limits.items():
            value=brief.get(field)
            if not isinstance(value,str) or not 1<=len(value.strip())<=limit: raise ValueError('Invalid brief: '+field)
            clean[field]=value.strip()
        return self.add(user,{'id':'REQ-'+secrets.token_hex(8).upper(),'title':'إنشاء بوتات تلجرام','status':'submitted','created_at':int(time.time()),'paid':False,'brief':clean},key)
    def status(self, ident, status):
        if status not in ('submitted','reviewing','awaiting_customer','completed','cancelled'): raise ValueError('Invalid status')
        with self.lock, self.db:
            row=self.db.execute('SELECT data FROM orders WHERE id=?',(ident,)).fetchone()
            if not row: raise ValueError('Unknown order')
            order=json.loads(row[0])
            if 'brief' not in order: raise ValueError('Demo delivery status cannot be edited')
            order['status']=status
            self.db.execute('UPDATE orders SET data=? WHERE id=?',(json.dumps(order,ensure_ascii=False),ident))
            return order
