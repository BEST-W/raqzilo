import hmac,json,os,threading,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from bot import Config,Store,TelegramAPI,PRODUCT,validate_init_data
ROOT=Path(__file__).resolve().parent
config=Config(token=os.environ.get('BOT_TOKEN',''),public_url=os.environ.get('PUBLIC_URL','').rstrip('/'),channel_username=os.environ.get('CHANNEL_USERNAME','').lstrip('@'),support_username=os.environ.get('SUPPORT_USERNAME','').lstrip('@'))
store=Store(config,TelegramAPI(config.token))
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def output(self,status,data,kind='application/json; charset=utf-8'):
        body=json.dumps(data,ensure_ascii=False).encode() if isinstance(data,(dict,list)) else data
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path=='/health':return self.output(200,{'ok':True,'mode':'demo','payments_enabled':False,'bot_configured':bool(config.token)})
        if path=='/api/catalog':return self.output(200,{'mode':'demo','products':[PRODUCT]})
        if path in ('/','/index.html'):return self.output(200,(ROOT/'public/index.html').read_bytes(),'text/html; charset=utf-8')
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
            if path not in ('/api/demo-order','/api/my-orders'):return self.output(404,{'error':'Not found'})
            if not config.token:return self.output(503,{'error':'Bot is not configured'})
            user=validate_init_data(body.get('init_data',''),config.token)
            if path=='/api/my-orders':return self.output(200,{'orders':store.get_orders(user),'mode':'demo','temporary_history':True})
            if body.get('product_id')!=PRODUCT['id']:return self.output(400,{'error':'Unknown product'})
            return self.output(200,{'order':store.deliver_demo(user),'mode':'demo'})
        except (ValueError,TypeError,KeyError):return self.output(400,{'error':'Invalid or expired Telegram authorization'})
        except Exception:return self.output(502,{'error':'Delivery temporarily unavailable; try the bot again'})

def main():
    port=int(os.environ.get('PORT','10000'))
    if os.environ.get('AUTO_CONFIGURE_WEBHOOK')=='true' and config.token and config.public_url:
        if not config.public_url.startswith('https://'):raise SystemExit('PUBLIC_URL must use HTTPS')
        store.api.call('setWebhook',{'url':config.public_url+'/telegram/webhook','secret_token':config.webhook_secret,'allowed_updates':['message','callback_query','pre_checkout_query']})
        store.api.call('setChatMenuButton',{'menu_button':{'type':'web_app','text':'المتجر','web_app':{'url':config.public_url}}})
    print(json.dumps({'server_ready':True,'mode':'demo','payments_enabled':False}),flush=True)
    ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
if __name__=='__main__':main()
