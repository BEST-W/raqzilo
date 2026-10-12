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
