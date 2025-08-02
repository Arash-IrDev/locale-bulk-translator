# Ollama Integration Summary

## تغییرات انجام شده

### 1. اضافه کردن Ollama Provider
- **فایل جدید**: `src/providers/ollama-provider.ts`
- **ویژگی‌ها**:
  - پشتیبانی کامل از API سازگار با OpenAI
  - تنظیمات بهینه برای ترجمه (temperature: 0.1)
  - Timeout مناسب برای مدل‌های محلی (2 دقیقه)
  - Prompt های بهینه‌سازی شده برای ترجمه JSON

### 2. به‌روزرسانی LLMService
- **فایل**: `src/llmService.ts`
- **تغییرات**:
  - اضافه کردن import برای OllamaProvider
  - اضافه کردن case 'ollama' در switch statement

### 3. به‌روزرسانی ModelConfigurator
- **فایل**: `src/modelConfigurator.ts`
- **تغییرات**:
  - اضافه کردن 'ollama' به لیست provider ها

### 4. مستندات
- **فایل جدید**: `OLLAMA_SETUP.md` - راهنمای کامل نصب و راه‌اندازی
- **به‌روزرسانی**: `README.md` - اضافه کردن بخش AI Providers
- **فایل تست**: `test-ollama.js` - تست اتصال و ترجمه

## نحوه استفاده

### مرحله 1: نصب Ollama
```bash
# نصب Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# راه‌اندازی سرویس
ollama serve

# دانلود مدل
ollama pull gemma3:4b
```

### مرحله 2: تنظیمات در VS Code
1. باز کردن Command Palette: `Cmd+Shift+P`
2. انتخاب: `I18n Nexus: Configure AI Model`
3. انتخاب Provider: `ollama`
4. تنظیم Model: `gemma3:4b`
5. تنظیم API URL: `http://localhost:11434/v1/chat/completions`
6. API Key: خالی بگذارید

### مرحله 3: استفاده
- انتخاب فایل JSON برای ترجمه
- انتخاب زبان هدف
- شروع ترجمه با مدل محلی

## مدل‌های پیشنهادی

### مدل‌های کوچک (سریع)
- `gemma2:2b` - سریع و کارآمد
- `llama2:7b` - تعادل خوب
- `mistral:7b` - کیفیت بالا

### مدل‌های متوسط
- `gemma3:4b` - کیفیت خوب و سرعت مناسب ⭐
- `llama2:13b` - کیفیت بالاتر
- `mistral:7b-instruct` - بهینه‌سازی شده

### مدل‌های بزرگ (کیفیت بالا)
- `llama2:70b` - بهترین کیفیت (نیاز به RAM بالا)
- `codellama:34b` - مناسب برای کد و متن

## مزایای استفاده از Ollama

1. **حریم خصوصی**: تمام پردازش محلی انجام می‌شود
2. **هزینه**: بدون هزینه API
3. **سرعت**: بدون محدودیت rate limit
4. **انعطاف‌پذیری**: امکان استفاده از مدل‌های مختلف
5. **آفلاین**: کار بدون اینترنت

## عیب‌یابی

### مشکل: اتصال برقرار نمی‌شود
```bash
# بررسی وضعیت
ollama list

# راه‌اندازی مجدد
ollama serve
```

### مشکل: مدل پیدا نمی‌شود
```bash
# دانلود مجدد
ollama pull gemma3:4b
```

### مشکل: خطای حافظه
- استفاده از مدل کوچک‌تر
- استفاده از نسخه quantized: `gemma3:4b-q4_K_M`

## تست عملکرد

برای تست اتصال و عملکرد:
```bash
node test-ollama.js
```

این اسکریپت:
- اتصال به Ollama را تست می‌کند
- یک ترجمه نمونه انجام می‌دهد
- راهنمای تنظیمات را نمایش می‌دهد 