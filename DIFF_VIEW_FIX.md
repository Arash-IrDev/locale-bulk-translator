# Diff View Fix - نمایش صحیح تغییرات ترجمه شده

## مشکل اصلی

در diff view، محتوای اشتباهی نمایش داده می‌شد:

1. **محتوای نادرست**: به جای نمایش پاسخ ترجمه شده از LLM، محتوای فایل مبدا (انگلیسی) نمایش داده می‌شد
2. **ساختار تودرتو**: JSON در diff view دچار تکرار و تودرتو شدن می‌شد
3. **نمایش نادرست تغییرات**: تغییرات به درستی به عنوان جایگزین تشخیص داده نمی‌شدند

## راه‌حل پیاده‌سازی شده

### 1. اصلاح `convertLLMResponseToOriginalStructureNew`

**قبل:**
```typescript
for (const originalKey in originalChunk) {
    if (flattenedResponse.hasOwnProperty(originalKey)) {
        result[originalKey] = flattenedResponse[originalKey];
    } else {
        // اگر کلید در پاسخ LLM نبود، از original استفاده کنیم
        result[originalKey] = originalChunk[originalKey]; // ❌ اشتباه
    }
}
```

**بعد:**
```typescript
for (const originalKey in originalChunk) {
    if (flattenedResponse.hasOwnProperty(originalKey)) {
        result[originalKey] = flattenedResponse[originalKey];
    } else {
        // اگر کلید در پاسخ LLM نبود، آن را نادیده بگیریم
        this.logger.log(`Key ${originalKey} not found in LLM response, skipping`);
    }
}
```

### 2. اصلاح `showDiffViewWithControls`

**قبل:**
```typescript
// کل محتوای mergedContent به diff view ارسال می‌شد
this.showDiffViewWithControls(mergedContent, result.chunkId)
```

**بعد:**
```typescript
// فقط تغییرات ترجمه شده به diff view ارسال می‌شود
this.showDiffViewWithControls(convertedResponse, result.chunkId)
```

### 3. بازنویسی کامل `showDiffViewWithControls`

```typescript
private async showDiffViewWithControls(translatedChanges: any, chunkId: string): Promise<void> {
    // خواندن فایل اصلی
    let originalContent: any = {};
    if (fs.existsSync(this.originalFilePath)) {
        originalContent = this.loadJsonFile(this.originalFilePath);
    }
    
    // ایجاد محتوای جدید با اعمال تغییرات ترجمه شده
    const newContent = JSON.parse(JSON.stringify(originalContent));
    
    // اعمال تغییرات ترجمه شده به محتوای جدید
    for (const key in translatedChanges) {
        if (translatedChanges[key] === null) {
            this.deleteNestedProperty(newContent, key);
        } else {
            this.setNestedProperty(newContent, key, translatedChanges[key]);
        }
    }
    
    // ایجاد diff بین فایل اصلی و محتوای جدید
    const tempDiffPath = path.join(os.tmpdir(), `i18n-nexus-diff-${uniqueId}.json`);
    fs.writeFileSync(tempDiffPath, JSON.stringify(newContent, null, 2));
    
    await vscode.commands.executeCommand('vscode.diff', originalUri, diffUri, title);
}
```

## نحوه کارکرد جدید

1. **LLM Response**: LLM پاسخ nested برمی‌گرداند
2. **Flattening**: پاسخ به flat keys تبدیل می‌شود
3. **Filtering**: فقط کلیدهایی که در LLM response وجود دارند انتخاب می‌شوند
4. **Diff Creation**: فایل جدید با اعمال تغییرات ترجمه شده ایجاد می‌شود
5. **Diff View**: diff بین فایل اصلی و فایل جدید نمایش داده می‌شود

## مثال عملی

**LLM Response:**
```json
{
  "access-control": {
    "add-permission": {
      "title": "افزودن دسترسی برای",
      "role-label": "نقش"
    }
  }
}
```

**Original Chunk:**
```json
{
  "access-control.add-permission.title": "Add permission for",
  "access-control.add-permission.role-label": "Role",
  "access-control.permissions.title": "Permissions"
}
```

**Converted Response (فقط کلیدهای ترجمه شده):**
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای",
  "access-control.add-permission.role-label": "نقش"
}
```

**Diff View:**
- فایل اصلی: محتوای کامل فایل مقصد
- فایل جدید: فایل مقصد + تغییرات ترجمه شده
- نمایش: فقط خطوط تغییر یافته به صورت قرمز (حذف) و سبز (اضافه)

## مزایا

1. **نمایش صحیح ترجمه‌ها**: فقط محتوای ترجمه شده فارسی نمایش داده می‌شود
2. **ساختار صحیح**: JSON بدون تکرار و تودرتو شدن
3. **Diff دقیق**: تغییرات به درستی به عنوان جایگزین تشخیص داده می‌شوند
4. **عملکرد بهتر**: فقط تغییرات لازم پردازش می‌شوند
5. **تجربه کاربری بهتر**: کاربر فقط تغییرات واقعی را می‌بیند

## تست

تغییرات با تست‌های مختلف بررسی شده‌اند:
- تبدیل nested به flat
- فیلتر کردن کلیدهای غیرضروری
- اعمال تغییرات در ساختار nested
- نمایش diff صحیح

نتایج تست نشان می‌دهد که سیستم حالا به درستی کار می‌کند و فقط محتوای ترجمه شده در diff view نمایش داده می‌شود. 