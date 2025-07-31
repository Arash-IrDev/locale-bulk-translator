# 🧪 راهنمای تست عملی i18n Nexus Extension

## 🚀 مرحله 1: اجرای Extension در Development Mode

### روش 1: از طریق VS Code GUI (توصیه شده)
1. پروژه `locale-bulk-translator` را در VS Code باز کنید
2. `F5` را فشار دهید یا از منو: `Run -> Start Debugging`
3. یک پنجره جدید VS Code باز می‌شود که extension شما در آن فعال است
4. اگر خطای API Key مشاهده کردید، نگران نباشید - extension فعال شده اما نیاز به تنظیم API Key دارد

### روش 2: از طریق Command Palette
1. در VS Code: `Cmd+Shift+P`
2. تایپ کنید: `Extensions: Install Extension from Location...`
3. پوشه پروژه را انتخاب کنید

## 📁 مرحله 2: آماده‌سازی پروژه تست

### پروژه تست آماده شده:
```
test-project/
├── package.json
└── messages/
    ├── zh-CN.json  (فایل پایه - چینی)
    └── en.json     (فایل هدف - انگلیسی)
```

### مراحل:
1. پروژه `test-project` را در پنجره Development Host باز کنید
2. فایل `messages/zh-CN.json` را باز کنید
3. این فایل به عنوان فایل پایه برای ترجمه استفاده می‌شود

## ⚙️ مرحله 3: تنظیمات Extension

### تنظیم API Key (ضروری):
1. `Cmd+Shift+P` → "i18n Nexus: Configure AI Model"
2. LLM Provider را انتخاب کنید (OpenAI, Gemini, Claude, یا OpenAI-Compatible)
3. API Key خود را وارد کنید
4. مدل مورد نظر را انتخاب کنید (مثل GPT-3.5-turbo)
5. API URL را وارد کنید (برای OpenAI معمولاً خالی بگذارید)

### تنظیم زبان‌ها:
1. `Cmd+Shift+P` → "Show i18n Nexus Configuration"
2. در Output Channel تنظیمات را بررسی کنید
3. زبان‌های هدف را در VS Code Settings تنظیم کنید:
   - `Cmd+,` → جستجوی "i18nNexus"
   - بخش "Target Languages" را تنظیم کنید

## 🎯 مرحله 4: تست عملی

### تست 1: ترجمه فایل کامل
1. `Cmd+Shift+P` → "i18n Nexus: Translate Files"
2. منتظر بمانید تا ترجمه کامل شود
3. فایل‌های جدید در پوشه `messages/` ایجاد می‌شوند

### تست 2: ترجمه فایل فعلی
1. فایل `zh-CN.json` را باز کنید
2. `Cmd+Shift+P` → "i18n Nexus: Translate Current File"
3. فقط فایل باز شده ترجمه می‌شود

### تست 3: بررسی Diff View
1. پس از ترجمه، diff view نمایش داده می‌شود
2. تغییرات را بررسی کنید
3. "Apply Changes" یا "Cancel" را انتخاب کنید

## 📊 مرحله 5: بررسی نتایج

### فایل‌های تولید شده:
- `messages/en.json` - ترجمه انگلیسی
- `messages/es.json` - ترجمه اسپانیایی (اگر فعال باشد)
- `messages/ja.json` - ترجمه ژاپنی (اگر فعال باشد)

### بررسی کیفیت ترجمه:
1. فایل‌های ترجمه شده را باز کنید
2. کیفیت ترجمه را بررسی کنید
3. ساختار JSON حفظ شده باشد

## 🐛 مرحله 6: Debugging

### بررسی Logs:
1. `Cmd+Shift+P` → "Show i18n Nexus Configuration"
2. Output Channel را بررسی کنید
3. خطاها و پیام‌های debug را مشاهده کنید

### تست Error Handling:
1. API Key اشتباه وارد کنید
2. فایل‌های نامعتبر تست کنید
3. اتصال اینترنت را قطع کنید

### رفع مشکلات رایج:
- **خطای "command not found"**: extension را دوباره compile کنید (`npm run compile`)
- **خطای API Key**: از طریق "i18n Nexus: Configure AI Model" تنظیم کنید
- **خطای فعال‌سازی**: extension در حالت محدود فعال شده، API Key را تنظیم کنید

## 📝 مرحله 7: تست‌های پیشرفته

### تست فایل‌های بزرگ:
1. فایل‌های locale با 1000+ کلید ایجاد کنید
2. عملکرد extension را بررسی کنید
3. زمان ترجمه را اندازه‌گیری کنید

### تست زبان‌های مختلف:
1. زبان‌های مختلف را در تنظیمات فعال کنید
2. کیفیت ترجمه برای هر زبان را بررسی کنید

### تست Performance:
1. فایل‌های متعدد را همزمان ترجمه کنید
2. مصرف حافظه و CPU را بررسی کنید

## ✅ چک‌لیست تست

- [ ] Extension در Development Host فعال می‌شود
- [ ] Command ها در Command Palette نمایش داده می‌شوند
- [ ] API Key درست تنظیم می‌شود
- [ ] فایل‌های locale شناسایی می‌شوند
- [ ] ترجمه با موفقیت انجام می‌شود
- [ ] فایل‌های جدید ایجاد می‌شوند
- [ ] Diff view نمایش داده می‌شود
- [ ] کیفیت ترجمه قابل قبول است
- [ ] Error handling درست کار می‌کند
- [ ] Logs درست نمایش داده می‌شوند

## 🔧 عیب‌یابی و رفع مشکلات

### مشکلات رایج و راه‌حل‌ها:

#### 1. خطای "command not found"
**مشکل**: دستورات extension در Command Palette نمایش داده نمی‌شوند
**راه‌حل**: 
- `npm run compile` را اجرا کنید
- VS Code را restart کنید
- extension را دوباره فعال کنید

#### 2. خطای "Invalid or missing OpenAI API key"
**مشکل**: extension فعال نمی‌شود
**راه‌حل**:
- extension در حالت محدود فعال شده
- از طریق "i18n Nexus: Configure AI Model" API Key را تنظیم کنید

#### 3. خطای ترجمه
**مشکل**: ترجمه انجام نمی‌شود
**راه‌حل**:
- API Key را بررسی کنید
- اتصال اینترنت را بررسی کنید
- مدل LLM را بررسی کنید

#### 4. فایل‌های ترجمه ایجاد نمی‌شوند
**مشکل**: پس از ترجمه، فایل‌های جدید ایجاد نمی‌شوند
**راه‌حل**:
- مسیر `messages` را بررسی کنید
- مجوزهای فایل را بررسی کنید
- تنظیمات زبان‌های هدف را بررسی کنید

## 🎉 موفقیت!

اگر همه موارد چک‌لیست را پشت سر گذاشتید، extension شما آماده انتشار است! 