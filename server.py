import hmac,json,os,re,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from bot import Config,Store,TelegramAPI,PRODUCT,SERVICE,AGENT_SERVICE,SERVICES,validate_init_data
from storage import Database
ROOT=Path(__file__).resolve().parent
config=Config(token=os.environ.get('BOT_TOKEN',''),public_url=os.environ.get('PUBLIC_URL','').rstrip('/'),channel_username=os.environ.get('CHANNEL_USERNAME','').lstrip('@'),support_username=os.environ.get('SUPPORT_USERNAME','').lstrip('@'),owner_id=int(os.environ.get('OWNER_TELEGRAM_ID','0')),accept_service_requests=os.environ.get('ACCEPT_SERVICE_REQUESTS','false')=='true')
store=Store(config,TelegramAPI(config.token),Database(str(Path(os.environ.get('DATA_DIR',str(ROOT/'data')))/'store.sqlite3')))
DEFAULT_PRODUCTS=[{**SERVICE,'category':'services','cover':'bot','service':True,'demo':False,'visible':True,'subtitle':'Custom Telegram Bots','meta':'خدمة مخصصة · حسب فكرتك'}, {**PRODUCT,'category':'web','cover':'folio','demo':True,'visible':True,'subtitle':'Wajha Folio','meta':'HTML · محرر مرفق'}, AGENT_SERVICE]
DEFAULT_SETTINGS={'accent':'#b998d7','background':'#0b090f','support_username':config.support_username,'channel_username':config.channel_username,'phone':'','email':'','service_fields':['name','kind','idea']}
def catalog(): return store.database.ensure_product(AGENT_SERVICE,DEFAULT_PRODUCTS)
def settings(): return store.database.get('settings',DEFAULT_SETTINGS)
def validate_products(items):
    if not isinstance(items,list) or not 1<=len(items)<=50: raise ValueError('Invalid products')
    ids=set()
    for p in items:
        if not isinstance(p,dict): raise ValueError('Invalid product')
        ident=p.get('id','')
        if not isinstance(ident,str) or not re.fullmatch('[a-z0-9-]{1,64}',ident) or ident in ids: raise ValueError('Invalid product ID')
        ids.add(ident)
        for key in ('title','description','subtitle','meta','price_label','delivery'):
            if key in p and (not isinstance(p[key],str) or len(p[key])>2000): raise ValueError('Invalid '+key)
        if not p.get('title'): raise ValueError('Title required')
        if p.get('category') not in ('services','web','files'): raise ValueError('Invalid category')
        if p.get('cover','folio') not in ('bot','agents','folio','cv','shop','landing'): raise ValueError('Invalid cover')
        image=p.get('image_url','')
        if not isinstance(image,str) or len(image)>2000 or (image and (urllib.parse.urlsplit(image).scheme!='https' or not urllib.parse.urlsplit(image).hostname)): raise ValueError('Image must use HTTPS')
        for field in ('features','options'):
            values=p.get(field,[])
            if not isinstance(values,list) or len(values)>30 or any(not isinstance(v,str) or len(v)>200 for v in values): raise ValueError('Invalid '+field)
        for field in ('visible','demo','service'):
            if field in p and type(p[field]) is not bool: raise ValueError('Invalid '+field)
        if p.get('demo') and ident!='wajha-folio': raise ValueError('Only Folio has a demo')
        if p.get('service') and ident not in SERVICES: raise ValueError('Unsupported service')
        price=p.get('price_stars')
        if price is not None and (type(price) is not int or not 1<=price<=1000000): raise ValueError('Invalid draft price')
        p['payment_enabled']=False
    if not {'wajha-folio','telegram-bot-creation'}<=ids: raise ValueError('Keep existing offerings; use visibility to hide them')
    return items

def validate_settings(value):
    if not isinstance(value,dict) or set(value)-set(DEFAULT_SETTINGS): raise ValueError('Invalid settings')
    merged={**DEFAULT_SETTINGS,**value}
    for key in ('accent','background'):
        if not isinstance(merged[key],str) or not re.fullmatch('#[a-fA-F0-9]{6}',merged[key]): raise ValueError('Invalid color')
    for key in ('support_username','channel_username'):
        if not isinstance(merged[key],str) or not re.fullmatch('[A-Za-z0-9_]{0,32}',merged[key]): raise ValueError('Invalid username')
    for key in ('phone','email'):
        if not isinstance(merged[key],str) or len(merged[key])>120: raise ValueError('Invalid contact')
    if merged['service_fields']!=['name','kind','idea']: raise ValueError('Required brief fields cannot be removed')
    return merged

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def output(self,status,data,kind='application/json; charset=utf-8'):
        body=json.dumps(data,ensure_ascii=False).encode() if isinstance(data,(dict,list)) else data
        self.send_response(status)
        for k,v in {'Content-Type':kind,'Content-Length':str(len(body)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'self'"}.items(): self.send_header(k,v)
        self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path=='/health':return self.output(200,{'ok':True,'mode':'demo','payments_enabled':False,'bot_configured':bool(config.token),'service_requests_enabled':config.accept_service_requests})
        if path=='/api/catalog':return self.output(200,{'mode':'demo','products':[p for p in catalog() if p.get('visible',True)],'settings':settings(),'service_requests_enabled':config.accept_service_requests})
        if path in ('/','/index.html','/admin'):
            name='admin.html' if path=='/admin' else 'index.html'
            return self.output(200,(ROOT/'public'/name).read_bytes(),'text/html; charset=utf-8')
        return self.output(404,{'error':'Not found'})
    def do_POST(self):
        path=urllib.parse.urlsplit(self.path).path
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>128000:return self.output(413,{'error':'Invalid request size'})
            if path=='/telegram/webhook':
                given=self.headers.get('X-Telegram-Bot-Api-Secret-Token','')
                if not config.token or not hmac.compare_digest(given,config.webhook_secret):return self.output(403,{'error':'Forbidden'})
                body=json.loads(self.rfile.read(size));store.handle(body);return self.output(200,{'ok':True})
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict): raise ValueError('Invalid body')
            if path not in ('/api/demo-order','/api/my-orders','/api/service-request','/api/admin/state','/api/admin/products','/api/admin/settings','/api/admin/order'):return self.output(404,{'error':'Not found'})
            if not config.token:return self.output(503,{'error':'Bot is not configured'})
            user=validate_init_data(body.get('init_data',''),config.token)
            if path.startswith('/api/admin/'):
                if not config.owner_id or user!=config.owner_id:return self.output(403,{'error':'Owner authorization required'})
                if path=='/api/admin/state':return self.output(200,{'products':catalog(),'settings':settings(),'orders':store.database.orders()})
                if path=='/api/admin/products':store.database.put('products',validate_products(body.get('products')))
                if path=='/api/admin/settings':store.database.put('settings',validate_settings(body.get('settings')))
                if path=='/api/admin/order':return self.output(200,{'order':store.database.status(body.get('id'),body.get('status'))})
                return self.output(200,{'ok':True})
            if path=='/api/my-orders':return self.output(200,{'orders':store.get_orders(user),'mode':'demo','temporary_history':False})
            if path=='/api/service-request':
                if not config.accept_service_requests:return self.output(503,{'error':'Service requests are closed until persistent hosting is verified'})
                if not config.owner_id:return self.output(503,{'error':'Merchant account is not configured'})
                product_id=body.get('product_id',SERVICE['id'])
                if not isinstance(product_id,str) or product_id not in SERVICES:return self.output(400,{'error':'Unknown service'})
                service=next((p for p in catalog() if p['id']==product_id and p.get('visible',True) and p.get('service')),None)
                if service is None:return self.output(409,{'error':'Service unavailable'})
                order=store.database.service(user,body.get('brief'),body.get('request_key'),product_id,service['title'])
                return self.output(201,{'order':order,'confirmation':'تم حفظ طلبك في لوحة صاحب المتجر. السعر والمدة بعد مراجعة المتطلبات.'})
            if body.get('product_id')!=PRODUCT['id']:return self.output(400,{'error':'Unknown product'})
            if not any(p['id']==PRODUCT['id'] and p.get('visible',True) and p.get('demo') for p in catalog()):return self.output(409,{'error':'Demo unavailable'})
            return self.output(200,{'order':store.deliver_demo(user),'mode':'demo'})
        except (ValueError,TypeError,KeyError,AttributeError):return self.output(400,{'error':'Invalid input or expired Telegram authorization'})
        except Exception:return self.output(502,{'error':'Operation temporarily unavailable; saved requests can be checked in order history'})

def main():
    port=int(os.environ.get('PORT','10000'))
    catalog()
    if os.environ.get('AUTO_CONFIGURE_WEBHOOK')=='true' and config.token and config.public_url:
        parsed=urllib.parse.urlsplit(config.public_url)
        if parsed.scheme!='https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:raise SystemExit('PUBLIC_URL must be an HTTPS origin')
        store.api.call('setWebhook',{'url':config.public_url+'/telegram/webhook','secret_token':config.webhook_secret,'allowed_updates':['message','callback_query','pre_checkout_query']})
        store.api.call('setChatMenuButton',{'menu_button':{'type':'web_app','text':'المتجر','web_app':{'url':config.public_url}}})
    http=ThreadingHTTPServer(('0.0.0.0',port),Handler)
    print(json.dumps({'server_ready':True,'mode':'demo','payments_enabled':False}),flush=True)
    http.serve_forever()
if __name__=='__main__':main()
