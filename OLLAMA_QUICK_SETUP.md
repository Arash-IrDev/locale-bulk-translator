# راهنمای سریع تنظیمات Ollama

## مشکل فعلی
در حال حاضر تنظیمات Ollama درست نیست. مشکل این است که:
- API URL هنوز به OpenAI اشاره می‌کند
- API Key ارسال می‌شود (که برای Ollama نیاز نیست)

## راه حل سریع

### مرحله 1: تنظیمات صحیح در VS Code
1. **باز کردن Command Palette**: `Cmd+Shift+P`
2. **انتخاب**: `I18n Nexus: Configure AI Model`
3. **انتخاب Provider**: `ollama`
4. **تنظیم Model**: `gemma3:4b`
5. **تنظیم API URL**: `http://localhost:11434/v1/chat/completions` ⚠️ **مهم**
6. **API Key**: خالی بگذارید ⚠️ **مهم**

### مرحله 2: بررسی تنظیمات
پس از تنظیمات، configuration باید این شکل باشد:
```json
{
  "llmProvider": "ollama",
  "llmModel": "gemma3:4b",
  "llmApiUrl": "http://localhost:11434/v1/chat/completions",
  "llmApiKey": ""
}
```

### مرحله 3: تست اتصال
```bash
# تست اتصال به Ollama
curl -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma3:4b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## عیب‌یابی

### اگر هنوز خطای 401 می‌گیرید:
1. **بررسی Ollama**: `ollama list`
2. **راه‌اندازی مجدد**: `ollama serve`
3. **بررسی مدل**: `ollama pull gemma3:4b`

### اگر اتصال برقرار نمی‌شود:
1. **بررسی پورت**: `lsof -i :11434`
2. **راه‌اندازی Ollama**: `ollama serve`
3. **تست ساده**: `curl http://localhost:11434/api/tags`

## نکات مهم
- ✅ API URL باید `http://localhost:11434/v1/chat/completions` باشد
- ✅ API Key باید خالی باشد
- ✅ Ollama باید در حال اجرا باشد
- ✅ مدل gemma3:4b باید نصب شده باشد

## تست نهایی
پس از تنظیمات صحیح، می‌توانید از extension برای ترجمه استفاده کنید:
1. انتخاب فایل JSON
2. انتخاب زبان هدف (مثل فارسی)
3. شروع ترجمه 