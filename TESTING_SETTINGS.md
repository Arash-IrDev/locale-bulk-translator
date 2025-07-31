# راهنمای تست تنظیمات i18n Nexus Extension

## تغییرات اعمال شده

### 1. زبان مبدا (Base Language)
- زبان مبدا از `zh-CN` به `en` (انگلیسی) تغییر یافت
- زبان فارسی (`fa`) به گزینه‌های زبان مبدا اضافه شد

### 2. زبان‌های مقصد (Target Languages)
- زبان فارسی (`fa`) به گزینه‌های زبان مقصد اضافه شد
- زبان فارسی به صورت پیش‌فرض فعال است

## محل ذخیره تنظیمات

### در VS Code
تنظیمات extension در VS Code در مکان‌های زیر ذخیره می‌شوند:

1. **تنظیمات Workspace** (پیشنهادی برای تست):
   ```
   test-project/.vscode/settings.json
   ```

2. **تنظیمات User** (سراسری):
   - macOS: `~/Library/Application Support/Code/User/settings.json`
   - Windows: `%APPDATA%\Code\User\settings.json`
   - Linux: `~/.config/Code/User/settings.json`

3. **تنظیمات Extension** (تنظیمات پیش‌فرض):
   ```
   package.json (بخش contributes.configuration)
   ```

## نحوه تست تنظیمات

### 1. تست در حالت Debug
1. پروژه را در VS Code باز کنید
2. روی `F5` کلیک کنید تا extension در حالت debug اجرا شود
3. در پنجره جدید VS Code که باز می‌شود:
   - پوشه `test-project` را باز کنید
   - تنظیمات extension در فایل `test-project/.vscode/settings.json` اعمال می‌شود

### 2. مشاهده تنظیمات فعلی
1. در VS Code جدید، Command Palette را باز کنید (`Cmd+Shift+P` در macOS)
2. دستور `i18n Nexus: Show Configuration` را اجرا کنید
3. تنظیمات فعلی در Output Channel نمایش داده می‌شود

### 3. تغییر تنظیمات
1. در VS Code جدید، Command Palette را باز کنید
2. دستور `Preferences: Open Settings (JSON)` را اجرا کنید
3. تنظیمات i18n Nexus را اضافه یا تغییر دهید:

```json
{
  "i18nNexus.baseLanguage": "en",
  "i18nNexus.targetLanguages": {
    "en": true,
    "fa": true,
    "zh-CN": false,
    "es": false,
    "fr": false,
    "de": false,
    "ja": false,
    "ko": false,
    "ar": false,
    "pt": false,
    "ru": false,
    "zh-TW": false
  },
  "i18nNexus.llmProvider": "openai",
  "i18nNexus.llmApiKey": "your-api-key-here"
}
```

### 4. تست ترجمه
1. API Key معتبر OpenAI را در تنظیمات وارد کنید
2. Command Palette را باز کنید
3. دستور `i18n Nexus: Translate Files` را اجرا کنید
4. فایل‌های ترجمه در پوشه `messages` ایجاد/به‌روزرسانی می‌شوند

## فایل‌های نمونه

در پوشه `test-project/messages/` فایل‌های نمونه زیر ایجاد شده‌اند:
- `en.json`: فایل زبان انگلیسی (زبان مبدا)
- `fa.json`: فایل زبان فارسی (زبان مقصد)

## نکات مهم

1. **تنظیمات Workspace**: تنظیمات در `test-project/.vscode/settings.json` فقط برای این پروژه اعمال می‌شود
2. **تنظیمات User**: تنظیمات در فایل settings.json کاربر برای همه پروژه‌ها اعمال می‌شود
3. **اولویت**: تنظیمات Workspace بر تنظیمات User اولویت دارد
4. **Debug Output**: برای مشاهده لاگ‌های extension، دستور `i18n Nexus: Toggle Debug Output` را اجرا کنید

## دستورات مفید

- `i18n Nexus: Show Configuration`: نمایش تنظیمات فعلی
- `i18n Nexus: Configure AI Model`: تنظیم مدل AI
- `i18n Nexus: Translate Files`: ترجمه فایل‌ها
- `i18n Nexus: Toggle Debug Output`: فعال/غیرفعال کردن خروجی debug 