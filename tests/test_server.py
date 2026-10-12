import hashlib,hmac,json,threading,time,unittest,urllib.parse,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
import server
from bot import Config,Store
from test_bot import FakeAPI
class ServerTests(unittest.TestCase):
 def setUp(self):
  self.old_config,self.old_store=server.config,server.store
  server.config=Config(token="test-http-key");server.store=Store(server.config,FakeAPI())
  self.http=ThreadingHTTPServer(("127.0.0.1",0),server.Handler);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start();self.base="http://127.0.0.1:"+str(self.http.server_address[1])
 def tearDown(self):
  self.http.shutdown();self.http.server_close();self.thread.join();server.config,server.store=self.old_config,self.old_store
 def post(self,path,body,headers=None):
  req=urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers={"Content-Type":"application/json",**(headers or {})})
  try:
   with urllib.request.urlopen(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as r:return r.code,json.load(r)
 def init(self):
  values={"auth_date":str(int(time.time())),"user":json.dumps({"id":123})};check="\n".join(k+"="+v for k,v in sorted(values.items()));key=hmac.new(b"WebAppData",server.config.token.encode(),hashlib.sha256).digest();values["hash"]=hmac.new(key,check.encode(),hashlib.sha256).hexdigest();return urllib.parse.urlencode(values)
 def test_health_discloses_demo_but_never_secret(self):
  with urllib.request.urlopen(self.base+"/health") as r:raw=r.read().decode();self.assertNotIn(server.config.token,raw);self.assertFalse(json.loads(raw)["payments_enabled"])
 def test_webhook_requires_secret(self):
  code,_=self.post("/telegram/webhook",{"update_id":1});self.assertEqual(code,403)
 def test_demo_delivery_requires_signed_telegram_identity(self):
  code,_=self.post("/api/demo-order",{"product_id":"wajha-folio","init_data":"invalid"});self.assertEqual(code,400);self.assertEqual(server.store.get_orders(123),[])
 def test_verified_demo_order_delivers_and_orders_are_user_scoped(self):
  body={"product_id":"wajha-folio","init_data":self.init()};code,result=self.post("/api/demo-order",body);self.assertEqual(code,200);self.assertFalse(result["order"]["paid"]);code,result=self.post("/api/my-orders",{"init_data":self.init()});self.assertEqual(code,200);self.assertEqual(len(result["orders"]),1)
 def test_unknown_product_does_not_deliver(self):
  code,_=self.post("/api/demo-order",{"product_id":"other","init_data":self.init()});self.assertEqual(code,400);self.assertEqual(server.store.get_orders(123),[])
 def test_static_route_cannot_read_project_or_environment_files(self):
  for path in ["/bot.py","/.env","/../README.md"]:
   with self.assertRaises(urllib.error.HTTPError) as err:urllib.request.urlopen(self.base+path)
   self.assertEqual(err.exception.code,404)
