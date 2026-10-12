import hashlib,hmac,json,time,unittest,urllib.parse
from bot import Config,Store,DEMO_FILE,PRODUCT,validate_init_data
class FakeAPI:
    def __init__(self):self.calls=[]
    def call(self,method,params=None,document=None):self.calls.append((method,params or {},document));return True
class StoreTests(unittest.TestCase):
    def setUp(self):self.api=FakeAPI();self.store=Store(Config(token='test-key'),self.api)
    def message(self,text,ident=1):return {'update_id':ident,'message':{'chat':{'id':123,'type':'private'},'from':{'id':123},'text':text}}
    def callback(self,data,ident=2):return {'update_id':ident,'callback_query':{'id':'cb','from':{'id':123},'data':data,'message':{'chat':{'id':123,'type':'private'}}}}
    def test_start_menu_has_catalog_and_demo(self):
        self.store.handle(self.message('/start'));msg=self.api.calls[-1][1];self.assertIn('الدفع غير مفعّل',msg['text']);self.assertIn('catalog',json.dumps(msg['reply_markup']));self.assertIn('demo',json.dumps(msg['reply_markup']))
    def test_catalog_discloses_inactive_price(self):
        self.store.handle(self.message('/catalog'));self.assertIn('السعر لم يُحدد',self.api.calls[-1][1]['text']);self.assertFalse(PRODUCT['payment_enabled']);self.assertIsNone(PRODUCT['price_stars'])
    def test_demo_requires_confirmation(self):
        self.store.handle(self.message('/demo'));self.assertFalse(any(x[0]=='sendDocument' for x in self.api.calls));self.assertIn('demo_confirm',json.dumps(self.api.calls[-1][1]))
    def test_callback_delivers_only_demo_document_and_records_free_order(self):
        self.store.handle(self.callback('demo_confirm'));methods=[x[0] for x in self.api.calls];self.assertEqual(methods[0],'answerCallbackQuery');self.assertIn('sendDocument',methods);doc=next(x for x in self.api.calls if x[0]=='sendDocument');self.assertEqual(doc[2][1],DEMO_FILE);self.assertNotIn('.zip',doc[2][0]);self.assertFalse(self.store.get_orders(123)[0]['paid'])
    def test_duplicate_update_does_not_redeliver(self):
        update=self.callback('demo_confirm');self.store.handle(update);self.store.handle(update);self.assertEqual(sum(x[0]=='sendDocument' for x in self.api.calls),1)
    def test_precheckout_always_rejects_paid_purchases(self):
        self.store.handle({'pre_checkout_query':{'id':'pending'}});self.assertEqual(self.api.calls[-1][0],'answerPreCheckoutQuery');self.assertFalse(self.api.calls[-1][1]['ok']);self.assertFalse(any(x[0]=='sendInvoice' for x in self.api.calls))
    def test_deep_links_route_orders_support_demo(self):
        for i,command in enumerate(('orders','support','demo'),10):
            self.store.handle(self.message('/start '+command,i));self.assertTrue(self.api.calls[-1][1]['text'])
        self.assertIn('تأكيد التجربة',json.dumps(self.api.calls[-1][1],ensure_ascii=False))
    def test_group_updates_do_not_send_messages(self):
        update=self.message('/demo');update['message']['chat']['type']='group';self.store.handle(update);self.assertEqual(self.api.calls,[])
    def test_web_app_button_requires_configured_public_origin(self):
        self.assertNotIn('web_app',json.dumps(self.store.keyboard()));self.store.config.public_url='https://example.com';self.assertIn('web_app',json.dumps(self.store.keyboard()))
    def test_agent_service_command_and_deep_link_do_not_deliver_or_charge(self):
        for i,text in enumerate(('/agents','/start agents'),30):
            self.store.handle(self.message(text,i))
            message=self.api.calls[-1][1]['text']
            self.assertIn('بناء وكلاء الذكاء الاصطناعي',message)
            self.assertIn('حسب متطلبات المشروع',message)
            self.assertIn('غير مفعّلين',message)
        self.assertFalse(any(c[0] in ('sendDocument','sendInvoice') for c in self.api.calls))
    def test_admin_entry_is_only_sent_to_the_owner(self):
        self.store.config.public_url='https://example.com'
        self.store.config.owner_id=999
        self.store.handle(self.message('/admin',40))
        self.assertNotIn('/admin',json.dumps(self.api.calls[-1][1]))
        self.store.config.owner_id=123
        self.store.handle(self.message('/admin',41))
        self.assertIn('https://example.com/admin',json.dumps(self.api.calls[-1][1]))
    def signed(self,values,token='test-key'):
        check='\n'.join(k+'='+v for k,v in sorted(values.items()));key=hmac.new(b'WebAppData',token.encode(),hashlib.sha256).digest();digest=hmac.new(key,check.encode(),hashlib.sha256).hexdigest();return urllib.parse.urlencode({**values,'hash':digest})
    def test_init_data_valid_signature_identifies_user(self):
        raw=self.signed({'auth_date':'1000','user':json.dumps({'id':123})});self.assertEqual(validate_init_data(raw,'test-key',now=1001),123)
    def test_init_data_wrong_signature_is_rejected(self):
        raw=self.signed({'auth_date':'1000','user':json.dumps({'id':123})},token='other');self.assertRaises(ValueError,validate_init_data,raw,'test-key',1001)
    def test_init_data_expired_and_missing_user_are_rejected(self):
        raw=self.signed({'auth_date':'1000','user':json.dumps({'id':123})});self.assertRaises(ValueError,validate_init_data,raw,'test-key',5000);raw=self.signed({'auth_date':'1000','user':'{}'});self.assertRaises(ValueError,validate_init_data,raw,'test-key',1001)
    def test_init_data_duplicate_fields_are_rejected(self):
        raw=self.signed({'auth_date':'1000','user':json.dumps({'id':123})})+'&auth_date=1000';self.assertRaises(ValueError,validate_init_data,raw,'test-key',1001)
    def test_history_is_per_user_and_bounded(self):
        for _ in range(7):self.store.deliver_demo(123)
        self.assertEqual(len(self.store.get_orders(123)),5);self.assertEqual(self.store.get_orders(999),[])
if __name__=='__main__':unittest.main()
