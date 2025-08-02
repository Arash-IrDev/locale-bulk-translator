# راهنمای لاگ‌های بهبود یافته

## سیستم لاگینگ جدید

### 🎛️ سطوح لاگینگ (Log Levels)

سیستم جدید شامل 5 سطح لاگینگ است:

1. **ERROR** (❌): خطاهای بحرانی - همیشه نمایش داده می‌شود
2. **WARN** (⚠️): هشدارها - همیشه نمایش داده می‌شود  
3. **INFO** (ℹ️): اطلاعات مهم - پیش‌فرض
4. **DEBUG** (🔍): جزئیات - برای عیب‌یابی
5. **TRACE** (🔬): جزئیات بسیار دقیق - برای توسعه

### 📂 دسته‌بندی لاگ‌ها (Log Categories)

لاگ‌ها به دسته‌های مختلف تقسیم می‌شوند:

- **SYSTEM**: لاگ‌های سیستمی (پیش‌فرض فعال)
- **TRANSLATION**: لاگ‌های ترجمه (پیش‌فرض فعال)
- **STRUCTURES**: ساختارهای ترجمه (پیش‌فرض فعال)
- **PROVIDER**: لاگ‌های provider ها (پیش‌فرض غیرفعال)
- **UI**: لاگ‌های رابط کاربری

### 🎮 دستورات کنترل لاگینگ

#### 1. تنظیم سطح لاگینگ
```
Command Palette → i18n Nexus: Set Log Level
```
انتخاب از: ERROR, WARN, INFO, DEBUG, TRACE

#### 2. فعال/غیرفعال کردن لاگ‌های Provider
```
Command Palette → i18n Nexus: Toggle Provider Logs
```

#### 3. فعال/غیرفعال کردن لاگ‌های ساختار
```
Command Palette → i18n Nexus: Toggle Structure Logs
```

#### 4. فعال/غیرفعال کردن Debug (Legacy)
```
Command Palette → i18n Nexus: Toggle Debug Output
```

## تغییرات جدید در لاگ‌ها

### 🔍 لاگ‌های OllamaProvider

#### قبل از ترجمه:
```
ℹ️  INFO[TRANSLATION] Starting translation to fa
🔍 DEBUG[PROVIDER] Input content structure: 15 keys
🔍 DEBUG[PROVIDER] Input content keys: admin.user-admin-page, admin.user-list-page, admin.users-list...
```

#### در حین API Call:
```
🔍 DEBUG[PROVIDER] Calling API
🔍 DEBUG[PROVIDER] API URL: http://localhost:11434/v1/chat/completions
🔍 DEBUG[PROVIDER] Model: gemma3:4b
🔍 DEBUG[PROVIDER] Request Body: { ... }
```

#### پس از دریافت پاسخ:
```
🔍 DEBUG[PROVIDER] API call successful
🔍 DEBUG[PROVIDER] Response Status: 200
🔍 DEBUG[PROVIDER] Raw response length: 2048 characters
🔍 DEBUG[PROVIDER] Raw response preview: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
```

#### در حین Parsing:
```
🔍 DEBUG[PROVIDER] Parsing response
🔍 DEBUG[PROVIDER] Response starts with: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
🔍 DEBUG[PROVIDER] Found JSON match, length: 2048
🔍 DEBUG[PROVIDER] JSON preview: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
```

#### پس از ترجمه:
```
🔍 DEBUG[PROVIDER] Parsed response structure: 15 keys
ℹ️  INFO[TRANSLATION] Translation to fa completed successfully
```

### 🔍 لاگ‌های StreamingTranslationManager

#### قبل از ترجمه هر Chunk:
```
ℹ️  INFO[TRANSLATION] Processing chunk chunk_1 (1/7)
🔍 DEBUG[TRANSLATION] Chunk chunk_1 structure: 3 keys
🔍 DEBUG[TRANSLATION] Chunk chunk_1 sample keys: admin.user-admin-page, admin.user-list-page, admin.users-list
🔍 DEBUG[TRANSLATION] Chunk chunk_1 sample values: صفحه مدیریت کاربران, لیست کاربران, کاربران
```

#### پس از ترجمه هر Chunk:
```
🔍 DEBUG[TRANSLATION] LLM service returned result for chunk chunk_1
🔍 DEBUG[TRANSLATION] Chunk chunk_1 translated structure: 3 keys
🔍 DEBUG[TRANSLATION] Chunk chunk_1 translated sample: admin.user-admin-page, admin.user-list-page
```

#### ساختارهای ترجمه (پس از ترجمه هر Chunk):
```
================================================================================
🔄 TRANSLATION STRUCTURES FOR CHUNK_1
================================================================================
📄 ORIGINAL DATA STRUCTURE (15 keys):
------------------------------------------------------------
{
  "admin.user-admin-page": "User Administration Page",
  "admin.user-list-page": "User List Page",
  "admin.users-list": "Users List",
  ...
}

📤 INPUT TO LLM (3 keys):
------------------------------------------------------------
{
  "admin.user-admin-page": "User Administration Page",
  "admin.user-list-page": "User List Page",
  "admin.users-list": "Users List"
}

📥 LLM RESPONSE (3 keys):
------------------------------------------------------------
{
  "admin": {
    "user-admin-page": "صفحه مدیریت کاربران",
    "user-list-page": "صفحه لیست کاربران",
    "users-list": "لیست کاربران"
  }
}

📋 FINAL EXTRACTED STRUCTURE (3 keys):
------------------------------------------------------------
{
  "admin.user-admin-page": "صفحه مدیریت کاربران",
  "admin.user-list-page": "صفحه لیست کاربران",
  "admin.users-list": "لیست کاربران"
}

📊 STRUCTURE COMPARISON SUMMARY:
------------------------------------------------------------
Original keys: admin.user-admin-page, admin.user-list-page, admin.users-list, ...
Input keys: admin.user-admin-page, admin.user-list-page, admin.users-list
Response keys: admin
Final keys: admin.user-admin-page, admin.user-list-page, admin.users-list
================================================================================
```

#### در صورت خطا:
```
❌ ERROR[TRANSLATION] Error in translateChunk for chunk_5: Error: Failed to parse Ollama response as JSON
❌ ERROR[TRANSLATION] Chunk chunk_5 content that failed: {"admin":{"user-admin-page":{"title":"User Administration Page"...
```

## نحوه استفاده از لاگ‌ها

### 1. تشخیص مشکلات ساختار
لاگ‌ها نشان می‌دهند:
- **ساختار داده اصلی**: داده‌های اولیه از فایل مبدا قبل از هر گونه تغییر
- **تعداد کلیدها**: چند کلید در هر chunk وجود دارد
- **نمونه کلیدها**: اولین چند کلید برای تشخیص ساختار
- **نمونه مقادیر**: نوع و محتوای مقادیر
- **مقایسه ساختارها**: مقایسه بین داده اصلی، ورودی LLM، پاسخ LLM و ساختار نهایی

### 2. تشخیص مشکلات ترجمه
لاگ‌ها نشان می‌دهند:
- **طول پاسخ**: آیا پاسخ خیلی کوتاه یا خیلی طولانی است
- **پیش‌نمایش پاسخ**: آیا پاسخ JSON است یا متن
- **ساختار پاسخ**: آیا تعداد کلیدها درست است

### 3. تشخیص مشکلات Parsing
لاگ‌ها نشان می‌دهند:
- **شروع پاسخ**: آیا پاسخ با JSON شروع می‌شود
- **یافتن JSON**: آیا JSON در پاسخ پیدا شده
- **طول JSON**: اندازه بخش JSON یافت شده

## مثال لاگ‌های موفق

### ✅ ترجمه موفق:
```
ℹ️  INFO[TRANSLATION] Starting translation to fa
🔍 DEBUG[PROVIDER] Input content structure: 5 keys
🔍 DEBUG[PROVIDER] Input content keys: welcome, login, logout, save, cancel
🔍 DEBUG[PROVIDER] Raw response length: 156 characters
🔍 DEBUG[PROVIDER] Raw response preview: {"welcome":"خوش آمدید","login":"ورود","logout":"خروج"...
🔍 DEBUG[PROVIDER] Found JSON match, length: 156
🔍 DEBUG[PROVIDER] Parsed response structure: 5 keys
ℹ️  INFO[TRANSLATION] Translation to fa completed successfully
```

### ❌ ترجمه ناموفق:
```
ℹ️  INFO[TRANSLATION] Starting translation to fa
🔍 DEBUG[PROVIDER] Input content structure: 5 keys
🔍 DEBUG[PROVIDER] Raw response length: 2048 characters
🔍 DEBUG[PROVIDER] Raw response preview: I've analyzed the JSON content and here's what I found...
🔍 DEBUG[PROVIDER] No JSON match found, trying to parse entire response
❌ ERROR[PROVIDER] Failed to parse response as JSON
🔍 DEBUG[PROVIDER] Response type: string
🔍 DEBUG[PROVIDER] Response length: 2048
🔍 DEBUG[PROVIDER] Raw response: I've analyzed the JSON content and here's what I found...
```

## نکات مهم

### 🔧 عیب‌یابی با لاگ‌ها:
1. **اگر تعداد کلیدها متفاوت است**: مشکل در ترجمه
2. **اگر پاسخ JSON نیست**: مشکل در prompt
3. **اگر parsing شکست می‌خورد**: مشکل در پاسخ مدل

### 📊 آمار لاگ‌ها:
- **Input tokens**: تعداد توکن‌های ورودی
- **Output tokens**: تعداد توکن‌های خروجی
- **Chunk size**: اندازه هر chunk
- **Success rate**: درصد موفقیت

### 🎯 بهینه‌سازی:
- **Chunk size**: اگر خیلی بزرگ است، کاهش دهید
- **Temperature**: اگر پاسخ‌ها نامنظم است، کاهش دهید
- **Prompt**: اگر JSON نمی‌دهد، بهبود دهید

## مثال کامل لاگ

```
=== شروع ترجمه ===
ℹ️  INFO[TRANSLATION] Processing chunk chunk_1 (1/7)
🔍 DEBUG[TRANSLATION] Chunk chunk_1 structure: 3 keys
🔍 DEBUG[TRANSLATION] Chunk chunk_1 sample keys: welcome, login, logout
🔍 DEBUG[TRANSLATION] Chunk chunk_1 sample values: Welcome to our application, Please login to continue, Logout
```

## تنظیمات پیشنهادی

### 🚀 برای استفاده عادی:
- **Log Level**: INFO
- **Categories**: SYSTEM, TRANSLATION, STRUCTURES

### 🔍 برای عیب‌یابی:
- **Log Level**: DEBUG
- **Categories**: همه دسته‌ها

### 🛠️ برای توسعه:
- **Log Level**: TRACE
- **Categories**: همه دسته‌ها 