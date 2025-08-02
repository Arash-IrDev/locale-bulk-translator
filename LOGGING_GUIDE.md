# راهنمای لاگ‌های بهبود یافته

## تغییرات جدید در لاگ‌ها

### 🔍 لاگ‌های OllamaProvider

#### قبل از ترجمه:
```
Ollama: Starting translation to fa
Ollama: Input content structure: 15 keys
Ollama: Input content keys: admin.user-admin-page, admin.user-list-page, admin.users-list...
```

#### در حین API Call:
```
Ollama: Calling API
Ollama: API URL: http://localhost:11434/v1/chat/completions
Ollama: Model: gemma3:4b
Ollama: Request Body: { ... }
```

#### پس از دریافت پاسخ:
```
Ollama: API call successful
Ollama: Response Status: 200
Ollama: Raw response length: 2048 characters
Ollama: Raw response preview: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
```

#### در حین Parsing:
```
Ollama: Parsing response
Ollama: Response starts with: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
Ollama: Found JSON match, length: 2048
Ollama: JSON preview: {"admin":{"user-admin-page":{"title":"صفحه مدیریت کاربران"...
```

#### پس از ترجمه:
```
Ollama: Parsed response structure: 15 keys
Ollama: Translation to fa completed successfully
```

### 🔍 لاگ‌های StreamingTranslationManager

#### قبل از ترجمه هر Chunk:
```
Translating chunk chunk_1 (1/7)
Chunk chunk_1 structure: 3 keys
Chunk chunk_1 sample keys: admin.user-admin-page, admin.user-list-page, admin.users-list
Chunk chunk_1 sample values: صفحه مدیریت کاربران, لیست کاربران, کاربران
```

#### پس از ترجمه هر Chunk:
```
LLM service returned result for chunk chunk_1
Chunk chunk_1 translated structure: 3 keys
Chunk chunk_1 translated sample: admin.user-admin-page, admin.user-list-page
```

#### در صورت خطا:
```
Error in translateChunk for chunk_5: Error: Failed to parse Ollama response as JSON
Chunk chunk_5 content that failed: {"admin":{"user-admin-page":{"title":"User Administration Page"...
```

## نحوه استفاده از لاگ‌ها

### 1. تشخیص مشکلات ساختار
لاگ‌ها نشان می‌دهند:
- **تعداد کلیدها**: چند کلید در هر chunk وجود دارد
- **نمونه کلیدها**: اولین چند کلید برای تشخیص ساختار
- **نمونه مقادیر**: نوع و محتوای مقادیر

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
Ollama: Starting translation to fa
Ollama: Input content structure: 5 keys
Ollama: Input content keys: welcome, login, logout, save, cancel
Ollama: Raw response length: 156 characters
Ollama: Raw response preview: {"welcome":"خوش آمدید","login":"ورود","logout":"خروج"...
Ollama: Found JSON match, length: 156
Ollama: Parsed response structure: 5 keys
Ollama: Translation to fa completed successfully
```

### ❌ ترجمه ناموفق:
```
Ollama: Starting translation to fa
Ollama: Input content structure: 5 keys
Ollama: Raw response length: 2048 characters
Ollama: Raw response preview: I've analyzed the JSON content and here's what I found...
Ollama: No JSON match found, trying to parse entire response
Ollama: Failed to parse response as JSON
Ollama: Response type: string
Ollama: Response length: 2048
Ollama: Raw response: I've analyzed the JSON content and here's what I found...
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
Translating chunk chunk_1 (1/7)
Chunk chunk_1 structure: 3 keys
Chunk chunk_1 sample keys: welcome, login, logout
Chunk chunk_1 sample values: Welcome to our application, Please login to continue, Logout

Ollama: Starting translation to fa
Ollama: Input content structure: 3 keys
Ollama: Input content keys: welcome, login, logout
Ollama: Raw response length: 89 characters
Ollama: Raw response preview: {"welcome":"به برنامه ما خوش آمدید","login":"لطفاً برای ادامه ورود نمایید"...
Ollama: Found JSON match, length: 89
Ollama: Parsed response structure: 3 keys
Ollama: Translation to fa completed successfully

LLM service returned result for chunk chunk_1
Chunk chunk_1 translated structure: 3 keys
Chunk chunk_1 translated sample: welcome, login, logout
=== پایان ترجمه موفق ===
```

این لاگ‌ها به شما کمک می‌کنند تا دقیقاً ببینید چه اتفاقی می‌افتد و مشکلات را سریع‌تر پیدا کنید! 🎯 