"""Wajha Telegram store. Demo-only commerce; no money is charged."""
from __future__ import annotations
import dataclasses, hashlib, hmac, io, json, os, re, secrets, threading, time, urllib.parse, urllib.request
from collections import OrderedDict
from storage import Database

PRODUCT = {
    'id': 'wajha-folio', 'title': 'واجهة — قالب معرض أعمال',
    'description': 'قالب HTML عربي وإنجليزي لعرض المشاريع، مع محرر للنصوص والصور والمظهر وإزالة العناصر.',
    'features': ['عربي وإنجليزي', 'حتى 12 مشروعًا', 'محرر مع معاينة وتصدير', 'CV والجوال والبحث', 'إظهار العناصر وإزالتها'],
    'format': 'HTML + محرر', 'delivery': 'ملف ZIP عند تفعيل البيع',
    'payment_enabled': False, 'price_stars': None,
}
DEMO_FILE = ('Wajha Store — ملف تجربة التسليم\n\n'
    'وصل هذا الملف من بوت @WajhaStoreBot بعد طلب تجريبي مجاني.\n'
    'ليس هذا قالب الموقع الكامل، وليس إثباتًا لعملية دفع.\n'
    'القالب الكامل سيُسلّم عند تفعيل البيع وتحديد السعر.\n\n'
    'للمساعدة استخدم /support داخل البوت.\n').encode('utf-8')
SERVICE = {
    'id': 'telegram-bot-creation', 'title': 'إنشاء بوتات تلجرام',
    'description': 'إنشاء بوت تلجرام حسب فكرتك، مع تحديد الأوامر والأزرار وطريقة التفاعل قبل التنفيذ.',
    'kind': 'service', 'price_label': 'حسب متطلباتك',
    'payment_enabled': False, 'price_stars': None,
    'delivery': 'السعر ومدة التنفيذ يتحددان بعد مراجعة المتطلبات',
}
TERMS = 'المتجر في مرحلة التجربة. الطلبات الحالية مجانية وتجريبية، ولا تمنح ترخيص شراء للقالب. لا توجد مدفوعات مفعّلة. ستظهر شروط البيع والدعم والسعر قبل تفعيل الشراء.'

@dataclasses.dataclass
class Config:
    token: str = dataclasses.field(default='', repr=False)
    public_url: str = ''
    channel_username: str = ''
    support_username: str = ''
    owner_id: int = 0
    accept_service_requests: bool = False
    @property
    def webhook_secret(self):
        return hmac.new(self.token.encode(), b'wajha-webhook-v1', hashlib.sha256).hexdigest()

class TelegramAPI:
    def __init__(self, token): self._token = token
    def call(self, method, params=None, document=None):
        if not self._token: raise RuntimeError('Bot token is not configured')
        if document is None:
            body = json.dumps(params or {}, ensure_ascii=False).encode()
            headers = {'Content-Type': 'application/json'}
        else:
            boundary = 'wajha-' + secrets.token_hex(12)
            chunks = []
            for key, value in (params or {}).items():
                chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
            filename, data = document
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n'.encode() + data + b'\r\n')
            chunks.append(f'--{boundary}--\r\n'.encode()); body = b''.join(chunks)
            headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary}
        req = urllib.request.Request('https://api.telegram.org/bot' + self._token + '/' + method, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=35) as response: result = json.load(response)
        except Exception: raise RuntimeError('Telegram request failed: ' + method) from None
        if not result.get('ok'): raise RuntimeError('Telegram rejected: ' + method)
        return result.get('result')

class Store:
    def __init__(self, config, api, database=None):
        self.config, self.api = config, api
        self.database = database or Database(':memory:')
        self.orders, self.seen = OrderedDict(), OrderedDict()
        self.lock = threading.RLock()
    def keyboard(self):
        rows = [[{'text': 'المنتجات', 'callback_data': 'catalog'}, {'text': 'تجربة طلب مجاني', 'callback_data': 'demo'}]]
        rows.append([{'text': 'إنشاء بوتات تلجرام', 'callback_data': 'createbot'}])
        if self.config.public_url:
            rows.append([{'text': 'فتح المتجر', 'web_app': {'url': self.config.public_url}}])
        else: rows.append([{'text': 'واجهة المتجر', 'callback_data': 'shop'}])
        rows.append([{'text': 'طلباتي', 'callback_data': 'orders'}, {'text': 'المساعدة', 'callback_data': 'support'}])
        if self.config.channel_username:
            rows.append([{'text': 'قناة المتجر', 'url': 'https://t.me/' + self.config.channel_username}])
        return {'inline_keyboard': rows}
    def send(self, chat_id, text, keyboard=None):
        params = {'chat_id': chat_id, 'text': text}
        if keyboard: params['reply_markup'] = keyboard
        return self.api.call('sendMessage', params)
    def show_product(self, chat_id):
        product = next((p for p in self.database.get('products',[PRODUCT]) if p['id']==PRODUCT['id']),PRODUCT)
        text = product['title'] + '\n\n' + product.get('description','') + '\n\n' + '\n'.join('• ' + x for x in product.get('features',[])) + '\n\nالسعر لم يُحدد بعد. يمكنك تجربة الطلب وتسليم ملف تجريبي مجانًا.'
        self.send(chat_id, text, {'inline_keyboard': [[{'text': 'تجربة الطلب والتسليم', 'callback_data': 'demo'}], [{'text': 'شروط التجربة', 'callback_data': 'terms'}], [{'text': 'القائمة الرئيسية', 'callback_data': 'start'}]]})
    def demo_prompt(self, chat_id):
        self.send(chat_id, 'طلب تجريبي مجاني\n\nسيصلك ملف صغير لاختبار التسليم داخل تيليجرام. لن تُخصم أموال أو نجوم، والملف لا يحتوي القالب المدفوع الكامل.', {'inline_keyboard': [[{'text': 'تأكيد التجربة واستلام الملف', 'callback_data': 'demo_confirm'}], [{'text': 'رجوع', 'callback_data': 'start'}]]})
    def deliver_demo(self, user_id):
        # The custom bot service never uses this free file delivery path.
        order_id = 'DEMO-' + secrets.token_hex(4).upper()
        self.api.call('sendDocument', {'chat_id': user_id, 'caption': 'تسليم تجريبي مجاني — ' + order_id}, document=('Wajha-Demo-Delivery.txt', DEMO_FILE))
        order = {'id': order_id, 'status': 'demo_delivered', 'title': 'تجربة تسليم ملف', 'created_at': int(time.time()), 'paid': False}
        with self.lock:
            previous = self.orders.get(user_id, [])
            self.orders[user_id] = (previous + [order])[-5:]
            self.orders.move_to_end(user_id)
            while len(self.orders) > 500: self.orders.popitem(last=False)
        self.database.add(user_id, order)
        self.send(user_id, 'وصل ملف التجربة. هذا طلب تجريبي مجاني، وليس عملية شراء.', self.keyboard())
        return order
    def show_service(self, chat_id):
        self.send(chat_id, SERVICE['title'] + '\n\n' + SERVICE['description'] + '\n\nأمثلة: عرض المنتجات، استقبال الطلبات، والردود الجاهزة والأسئلة الشائعة.\n\nالسعر: حسب متطلباتك.\nمدة التنفيذ تُحدد بعد مراجعة الفكرة. افتح المتجر لإرسال المتطلبات والحصول على رقم الطلب.', self.keyboard())
    def get_orders(self, user_id):
        return self.database.orders(user_id)[:5]
    def handle(self, update):
        if 'pre_checkout_query' in update:
            self.api.call('answerPreCheckoutQuery', {'pre_checkout_query_id': update['pre_checkout_query']['id'], 'ok': False, 'error_message': 'الشراء والدفع غير مفعّلين في نسخة التجربة.'})
            return
        ident = update.get('update_id')
        with self.lock:
            if ident is not None and ident in self.seen: return
        callback = update.get('callback_query')
        message = update.get('message') or (callback or {}).get('message') or {}
        chat = message.get('chat', {})
        if chat.get('type') != 'private': return
        user_id = (callback or {}).get('from', message.get('from', {})).get('id')
        if not isinstance(user_id, int) or user_id != chat.get('id'): return
        if callback:
            self.api.call('answerCallbackQuery', {'callback_query_id': callback['id']})
            command = callback.get('data', '')
        else:
            text = message.get('text', '')
            command = text.split(' ', 1)[0].split('@')[0].lstrip('/')
            if command == 'start' and ' ' in text:
                payload = text.split(' ', 1)[1]
                if payload in ('demo','catalog','shop','orders','support','terms','paysupport','createbot'): command = payload
        if message.get('successful_payment'):
            self.send(user_id, 'وصل إشعار دفع غير متوقع. تواصل مع دعم المتجر عبر /paysupport لمراجعته. لا توجد مبيعات مفعلة في هذه النسخة.')
        elif command in ('start', 'help'):
            self.send(user_id, 'أهلًا بك في Wajha | Template Store\n\nتصفّح المنتج أو جرّب الطلب والتسليم مجانًا. المتجر في مرحلة التجربة والدفع غير مفعّل.', self.keyboard())
        elif command in ('catalog', 'product:wajha-folio'): self.show_product(user_id)
        elif command in ('createbot', 'service:telegram-bot-creation'): self.show_service(user_id)
        elif command == 'demo': self.demo_prompt(user_id)
        elif command == 'demo_confirm': self.deliver_demo(user_id)
        elif command == 'orders':
            orders = self.get_orders(user_id)
            self.send(user_id, 'آخر الطلبات:\n' + '\n'.join(x['id'] + ' — ' + x['status'] for x in orders) if orders else 'لا توجد طلبات مدفوعة. يمكن إرسال طلب خدمة من المتجر أو تجربة التسليم من /demo.', self.keyboard())
        elif command == 'terms': self.send(user_id, TERMS, self.keyboard())
        elif command in ('support', 'paysupport'):
            text = 'المتجر تجريبي والدفع غير مفعّل. زر /demo يختبر تسليم ملف. دعم مشتريات المتجر يكون من صاحب المتجر، وليس دعم تيليجرام.'
            if self.config.support_username: text += '\nللتواصل: https://t.me/' + self.config.support_username
            else: text += '\nحساب الدعم المباشر سيُربط قبل تفعيل البيع.'
            self.send(user_id, text, self.keyboard())
        elif command == 'admin' and user_id == self.config.owner_id and self.config.public_url:
            self.send(user_id, 'لوحة إدارة واجهة', {'inline_keyboard': [[{'text':'إدارة المتجر','web_app':{'url':self.config.public_url+'/admin'}}]]})
        elif command == 'shop':
            self.send(user_id, 'واجهة المتجر جاهزة للمعاينة. رابط فتحها داخل تيليجرام سيُضاف بعد تحديد حساب الاستضافة ونشر التشغيل المستمر.', self.keyboard())
        else: self.send(user_id, 'استخدم الأزرار أو أرسل /start لعرض المتجر.', self.keyboard())
        with self.lock:
            if ident is not None:
                self.seen[ident] = True
                while len(self.seen) > 500: self.seen.popitem(last=False)

def validate_init_data(raw, token, now=None):
    if not raw or len(raw) > 16384: raise ValueError('Telegram authorization required')
    pairs = urllib.parse.parse_qsl(raw, keep_blank_values=True)
    values = dict(pairs)
    if len(values) != len(pairs): raise ValueError('Repeated authorization field')
    received = values.pop('hash', '')
    if not re.fullmatch('[a-fA-F0-9]{64}', received): raise ValueError('Invalid authorization')
    check = '\n'.join(k + '=' + v for k, v in sorted(values.items()))
    key = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    expected = hmac.new(key, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(received.lower(), expected): raise ValueError('Invalid authorization')
    when = int(values.get('auth_date', '0')); current = int(time.time() if now is None else now)
    if when > current + 30 or current - when > 3600: raise ValueError('Expired authorization')
    user = json.loads(values.get('user', '{}'))
    if type(user.get('id')) is not int or user['id'] <= 0: raise ValueError('Invalid user')
    return user['id']
