# راهنمای تنظیمات Provider ها

## تغییرات جدید

حالا extension از یک سیستم تنظیمات پیش‌فرض استفاده می‌کند که:

### ✅ مزایای جدید:
- **تنظیمات خودکار**: URL ها و مدل‌های پیش‌فرض به صورت خودکار تنظیم می‌شوند
- **رابط کاربری بهتر**: توضیحات هر provider نمایش داده می‌شود
- **امنیت بیشتر**: API Key فقط برای provider هایی که نیاز دارند درخواست می‌شود
- **سادگی**: کاربر فقط provider و model را انتخاب می‌کند

## Provider های پشتیبانی شده

### 🤖 OpenAI
- **URL پیش‌فرض**: `https://api.openai.com/v1`
- **مدل پیش‌فرض**: `gpt-4o-mini`
- **نیاز به API Key**: ✅ بله
- **مدل‌های موجود**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo

### 🌟 Gemini
- **URL پیش‌فرض**: `https://generativelanguage.googleapis.com/v1beta`
- **مدل پیش‌فرض**: `gemini-1.5-flash`
- **نیاز به API Key**: ✅ بله
- **مدل‌های موجود**: gemini-1.5-flash, gemini-1.5-pro, gemini-pro

### 🧠 Claude
- **URL پیش‌فرض**: `https://api.anthropic.com/v1`
- **مدل پیش‌فرض**: `claude-3-5-sonnet-20241022`
- **نیاز به API Key**: ✅ بله
- **مدل‌های موجود**: claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, claude-3-sonnet, claude-3-haiku

### 🔧 OpenAI Compatible
- **URL پیش‌فرض**: `https://api.openai.com/v1`
- **مدل پیش‌فرض**: `gpt-4o`
- **نیاز به API Key**: ✅ بله
- **مدل‌های موجود**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo

### 🏠 Ollama (Local)
- **URL پیش‌فرض**: `http://localhost:11434/v1`
- **مدل پیش‌فرض**: `gemma3:4b`
- **نیاز به API Key**: ❌ خیر
- **مدل‌های موجود**: gemma3:4b, gemma2:2b, llama2:7b, llama2:13b, llama2:70b, mistral:7b, mistral:7b-instruct, codellama:34b

## نحوه تنظیمات

### مرحله 1: باز کردن تنظیمات
1. **Command Palette**: `Cmd+Shift+P` (macOS) یا `Ctrl+Shift+P` (Windows/Linux)
2. **انتخاب**: `I18n Nexus: Configure AI Model`

### مرحله 2: انتخاب Provider
- لیست provider ها با توضیحات نمایش داده می‌شود
- provider فعلی با `(current)` مشخص شده است

### مرحله 3: تنظیمات خودکار
- **API URL**: به صورت خودکار تنظیم می‌شود
- **Model**: مدل پیش‌فرض پیشنهاد می‌شود
- **API Key**: فقط برای provider هایی که نیاز دارند درخواست می‌شود

## مثال تنظیمات Ollama

### قبل (مشکل‌دار):
```json
{
  "llmProvider": "ollama",
  "llmModel": "gemma3:4b",
  "llmApiUrl": "https://api.openai.com/v1/responses", // ❌ اشتباه
  "llmApiKey": "sk-..." // ❌ غیرضروری
}
```

### بعد (صحیح):
```json
{
  "llmProvider": "ollama",
  "llmModel": "gemma3:4b",
  "llmApiUrl": "http://localhost:11434/v1", // ✅ صحیح
  "llmApiKey": "" // ✅ خالی
}
```

## عیب‌یابی

### مشکل: تنظیمات قدیمی
اگر تنظیمات قدیمی دارید:
1. **Reset تنظیمات**: Command Palette → `I18n Nexus: Configure AI Model`
2. **انتخاب مجدد provider**: provider مورد نظر را انتخاب کنید
3. **تنظیمات خودکار**: URL و API Key به صورت خودکار تنظیم می‌شود

### مشکل: Ollama کار نمی‌کند
1. **بررسی Ollama**: `ollama list`
2. **راه‌اندازی**: `ollama serve`
3. **دانلود مدل**: `ollama pull gemma3:4b`

### مشکل: API Key
- **OpenAI/Gemini/Claude**: API Key الزامی است
- **Ollama**: API Key نیاز نیست (خالی بگذارید)

## نکات مهم

### ✅ بهترین روش:
1. **Provider انتخاب کنید**: بر اساس نیاز خود
2. **Model انتخاب کنید**: از لیست پیشنهادی
3. **API Key وارد کنید**: فقط اگر نیاز است
4. **تست کنید**: با یک فایل کوچک

### ❌ اشتباهات رایج:
- تغییر دستی URL ها
- وارد کردن API Key برای Ollama
- استفاده از مدل‌های نامعتبر

## تست نهایی

پس از تنظیمات:
1. **انتخاب فایل JSON**
2. **انتخاب زبان هدف**
3. **شروع ترجمه**
4. **بررسی نتیجه**

اگر همه چیز درست کار کند، ترجمه شروع می‌شود! 🎉 