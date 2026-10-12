import json, tempfile, unittest
from pathlib import Path
import test_server
import server
from storage import Database

class RequestTests(unittest.TestCase):
 post = test_server.ServerTests.post
 init = test_server.ServerTests.init
 def setUp(self):
  test_server.ServerTests.setUp(self);server.config.owner_id=123;server.config.accept_service_requests=True
  self.temp=tempfile.TemporaryDirectory();self.path=str(Path(self.temp.name)/'store.sqlite3');server.store.database=Database(self.path)
 def tearDown(self):
  server.store.database.db.close();self.temp.cleanup();test_server.ServerTests.tearDown(self)
 def submit(self,key='request-key-123456'):
  return self.post('/api/service-request',{'init_data':self.init(),'request_key':key,'brief':{'name':'بوت متجر','kind':'متجر','idea':'عرض المنتجات واستقبال الطلبات'}})
 def test_service_is_durable_and_retry_is_idempotent(self):
  code,r=self.submit();self.assertEqual(code,201);ident=r['order']['id'];self.assertEqual(self.submit()[1]['order']['id'],ident)
  server.store.database.db.close();server.store.database=Database(self.path)
  code,r=self.post('/api/my-orders',{'init_data':self.init()});self.assertEqual(r['orders'][0]['id'],ident);self.assertFalse(r['temporary_history']);self.assertEqual(server.store.database.orders(999),[])
 def test_invalid_brief_and_unsigned_request_are_rejected(self):
  for brief in ({}, {'name':'x','kind':'x','idea':'x'*1201}):
   code,_=self.post('/api/service-request',{'init_data':self.init(),'request_key':'request-key-123456','brief':brief});self.assertEqual(code,400)
  code,_=self.post('/api/service-request',{'init_data':'bad'});self.assertEqual(code,400);self.assertEqual(server.store.database.orders(),[])
 def test_owner_required_for_requests_and_admin(self):
  server.config.owner_id=0;self.assertEqual(self.submit()[0],503)
  self.assertEqual(self.post('/api/admin/state',{'init_data':self.init()})[0],403)
  server.config.owner_id=999;self.assertEqual(self.post('/api/admin/state',{'init_data':self.init()})[0],403)
 def test_owner_can_review_request_and_customer_sees_status(self):
  ident=self.submit()[1]['order']['id']
  code,r=self.post('/api/admin/state',{'init_data':self.init()});self.assertEqual(code,200);self.assertEqual(r['orders'][0]['brief']['name'],'بوت متجر')
  code,_=self.post('/api/admin/order',{'init_data':self.init(),'id':ident,'status':'reviewing'});self.assertEqual(code,200)
  self.assertEqual(self.post('/api/my-orders',{'init_data':self.init()})[1]['orders'][0]['status'],'reviewing')
 def test_catalog_edits_persist_but_cannot_enable_payment(self):
  products=json.loads(json.dumps(server.DEFAULT_PRODUCTS));products[1].update(title='قالب جديد',price_stars=100,payment_enabled=True,image_url='https://example.org/cover.png',options=['Power BI'])
  code,_=self.post('/api/admin/products',{'init_data':self.init(),'products':products});self.assertEqual(code,200)
  server.store.database.db.close();server.store.database=Database(self.path)
  self.assertEqual(server.catalog()[1]['title'],'قالب جديد');self.assertFalse(server.catalog()[1]['payment_enabled'])
 def test_unsafe_image_and_invalid_settings_rejected(self):
  products=json.loads(json.dumps(server.DEFAULT_PRODUCTS));products[1]['image_url']='javascript:alert(1)'
  self.assertEqual(self.post('/api/admin/products',{'init_data':self.init(),'products':products})[0],400)
  self.assertEqual(self.post('/api/admin/settings',{'init_data':self.init(),'settings':{'accent':'red;'}})[0],400)
 def test_database_is_never_public(self):
  import urllib.request,urllib.error
  for path in ('/data/store.sqlite3','/storage.py','/public/admin.html'):
   with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(self.base+path)
   self.assertEqual(e.exception.code,404)

 def test_preview_cannot_accept_customer_requests(self):
  server.config.accept_service_requests=False
  self.assertEqual(self.submit()[0],503)
  self.assertEqual(server.store.database.orders(),[])

 def agent_request(self,key='agent-request-123456'):
  return self.post('/api/service-request',{'init_data':self.init(),'product_id':'ai-agent-building','request_key':key,'brief':{'name':'مساعد المعرفة','kind':'الإجابة من ملفات','idea':'الإجابة عن أسئلة العملاء من ملفات الشركة'}})
 def test_agent_receipt_retains_service_identity_after_restart(self):
  code,result=self.agent_request();self.assertEqual(code,201)
  order=result['order'];self.assertEqual(order['product_id'],'ai-agent-building');self.assertEqual(order['title'],'بناء وكلاء الذكاء الاصطناعي')
  server.store.database.db.close();server.store.database=Database(self.path)
  self.assertEqual(self.agent_request()[1]['order']['id'],order['id'])
  self.assertEqual(self.post('/api/my-orders',{'init_data':self.init()})[1]['orders'][0]['product_id'],'ai-agent-building')
  self.assertFalse(order['paid'])
 def test_request_key_cannot_be_reused_for_another_service(self):
  body={'init_data':self.init(),'request_key':'same-key-12345678','brief':{'name':'مشروع','kind':'مساعد','idea':'الرد على الأسئلة'}}
  self.assertEqual(self.post('/api/service-request',body)[0],201)
  self.assertEqual(self.post('/api/service-request',{**body,'product_id':'ai-agent-building'})[0],400)
  self.assertEqual(len(server.store.database.orders()),1)
 def test_hidden_or_unknown_services_cannot_accept_requests(self):
  products=json.loads(json.dumps(server.catalog()))
  next(p for p in products if p['id']=='ai-agent-building')['visible']=False
  self.assertEqual(self.post('/api/admin/products',{'init_data':self.init(),'products':products})[0],200)
  self.assertEqual(self.agent_request()[0],409)
  self.assertEqual(self.post('/api/service-request',{'init_data':self.init(),'product_id':'unknown'})[0],400)
  self.assertEqual(server.store.database.orders(),[])
 def test_agent_catalog_upgrade_keeps_owner_edits_and_does_not_restore_hidden_service(self):
  products=json.loads(json.dumps(server.DEFAULT_PRODUCTS[:2]));products[0]['title']='خدمة مخصصة باسمي'
  server.store.database.put('products',products)
  updated=server.catalog();self.assertEqual(updated[0]['title'],'خدمة مخصصة باسمي')
  self.assertEqual(sum(p['id']=='ai-agent-building' for p in updated),1)
  next(p for p in updated if p['id']=='ai-agent-building')['visible']=False
  server.store.database.put('products',updated)
  server.store.database.db.close();server.store.database=Database(self.path)
  self.assertFalse(next(p for p in server.catalog() if p['id']=='ai-agent-building')['visible'])
  server.store.database.put('products',products)
  self.assertEqual(server.catalog(),products)
 def test_customer_cannot_read_or_change_owner_settings_catalog_or_orders(self):
  order=self.submit()[1]['order'];server.config.owner_id=999
  bodies={'state':{},'products':{'products':server.DEFAULT_PRODUCTS},'settings':{'settings':{}},'order':{'id':order['id'],'status':'completed'}}
  for endpoint,body in bodies.items():
   self.assertEqual(self.post('/api/admin/'+endpoint,{**body,'init_data':self.init()})[0],403)
   self.assertEqual(self.post('/api/admin/'+endpoint,{**body,'init_data':'unsigned'})[0],400)
  self.assertEqual(server.store.database.orders()[0]['status'],'submitted')
 def test_agent_service_obeys_preview_gate_and_cannot_use_demo_delivery(self):
  server.config.accept_service_requests=False
  self.assertEqual(self.agent_request()[0],503)
  self.assertEqual(self.post('/api/demo-order',{'init_data':self.init(),'product_id':'ai-agent-building'})[0],400)
  self.assertEqual(server.store.database.orders(),[])
  self.assertFalse(any(c[0] in ('sendInvoice','sendDocument') for c in server.store.api.calls))
