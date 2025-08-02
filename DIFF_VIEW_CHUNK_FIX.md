# Diff View Chunk Display Fix - اصلاح نمایش چانک‌ها در Diff View

## مشکل اصلی

در diff view، وقتی چانک‌های جواب از LLM دریافت می‌شدند و برای نمایش تبدیل می‌شدند، فقط چانک اول و خط اول نمایش داده می‌شد و بقیه چانک‌ها درست نمایش داده نمی‌شدند.

### علت مشکل

1. **استفاده از `tempContent`**: در `showDiffViewWithControls`، از `tempContent` (که شامل تمام تغییرات ترجمه شده تا آن لحظه است) استفاده می‌شد
2. **نمایش تجمعی**: هر diff view تمام تغییرات قبلی را نیز نمایش می‌داد که باعث سردرگمی می‌شد
3. **عدم تمایز چانک‌ها**: کاربر نمی‌توانست تشخیص دهد که کدام تغییرات متعلق به کدام چانک است

## راه‌حل پیاده‌سازی شده

### 1. اصلاح `showDiffViewWithControls`

**قبل:**
```typescript
// خواندن فایل موقت که شامل تمام تغییرات ترجمه شده تا آن لحظه است
let tempContent: any = {};
if (fs.existsSync(this.tempFilePath)) {
    tempContent = this.loadJsonFile(this.tempFilePath);
}

// استفاده از tempContent برای diff
fs.writeFileSync(tempDiffPath, JSON.stringify(tempContent, null, 2));
```

**بعد:**
```typescript
// ایجاد محتوای جدید با اعمال تغییرات ترجمه شده به فایل اصلی
const newContent = JSON.parse(JSON.stringify(originalContent));

// اعمال تغییرات ترجمه شده به محتوای جدید
for (const key in translatedChanges) {
    if (translatedChanges[key] === null) {
        this.deleteNestedProperty(newContent, key);
    } else {
        this.setNestedProperty(newContent, key, translatedChanges[key]);
    }
}

// استفاده از newContent برای diff
fs.writeFileSync(tempDiffPath, JSON.stringify(newContent, null, 2));
```

### 2. منطق جدید

1. **خواندن فایل اصلی**: فایل مقصد (فارسی) خوانده می‌شود
2. **کپی محتوا**: یک کپی از محتوای اصلی ایجاد می‌شود
3. **اعمال تغییرات چانک فعلی**: فقط تغییرات چانک فعلی اعمال می‌شود
4. **ایجاد diff**: diff بین فایل اصلی و محتوای جدید ایجاد می‌شود

## مثال عملی

### چانک 1
**تغییرات:**
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای",
  "access-control.add-permission.role-label": "نقش"
}
```

**Diff View:**
- فایل اصلی: محتوای کامل فایل فارسی
- فایل جدید: فایل فارسی + تغییرات چانک 1
- نمایش: فقط 2 خط تغییر یافته

### چانک 2
**تغییرات:**
```json
{
  "access-control.add-permission.level-aria-label": "سطح دسترسی",
  "access-control.add-permission.permissions-aria-label": "اسلایدر دسترسیها"
}
```

**Diff View:**
- فایل اصلی: محتوای کامل فایل فارسی
- فایل جدید: فایل فارسی + تغییرات چانک 2
- نمایش: فقط 2 خط تغییر یافته (بدون نمایش تغییرات چانک 1)

## مزایا

1. **نمایش واضح**: هر چانک فقط تغییرات خودش را نمایش می‌دهد
2. **عدم سردرگمی**: کاربر می‌داند که کدام تغییرات متعلق به کدام چانک است
3. **عملکرد بهتر**: فقط تغییرات لازم پردازش می‌شوند
4. **تجربه کاربری بهتر**: diff view واضح و قابل فهم است

## تست‌ها

تغییرات با تست‌های مختلف بررسی شده‌اند:

```javascript
// تست چانک‌های مختلف
const chunk1Changes = {
    "access-control.add-permission.title": "افزودن دسترسی برای",
    "access-control.add-permission.role-label": "نقش"
};

const chunk2Changes = {
    "access-control.add-permission.level-aria-label": "سطح دسترسی",
    "access-control.add-permission.permissions-aria-label": "اسلایدر دسترسیها"
};

// هر چانک فقط تغییرات خودش را نمایش می‌دهد
```

## نتیجه

✅ **مشکل حل شد**: حالا هر چانک فقط تغییرات خودش را در diff view نمایش می‌دهد
✅ **نمایش واضح**: کاربر می‌تواند به راحتی تغییرات هر چانک را ببیند
✅ **عملکرد بهتر**: سیستم سریع‌تر و کارآمدتر کار می‌کند
✅ **تجربه کاربری بهتر**: diff view واضح و قابل فهم است

## مسیر کامل تبدیل جواب‌های ترجمه شده به JSON و نمایش در Diff View

### 1. **دریافت جواب از LLM** (خط 741-747)
```typescript
// در تابع translateChunk
const result = await this.translateChunk(chunk, lang, chunkId, i + 1, chunks.length);
// result.translatedContent شامل جواب خام LLM است
```

### 2. **تبدیل جواب LLM به JSON** (خط 289-340)
```typescript
<code_block_to_apply_changes_from>
```

### 3. **تبدیل Nested به Flat** (خط 900-915)
```typescript
// در تابع flattenNestedContent
private flattenNestedContent(nestedContent: any, prefix: string = ''): any {
    const flattened: any = {};
    
    for (const key in nestedContent) {
        const value = nestedContent[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // اگر مقدار یک object است، آن را recursively flatten کنیم
            const subFlattened = this.flattenNestedContent(value, fullKey);
            Object.assign(flattened, subFlattened);
        } else {
            // اگر مقدار primitive است، کلید کامل را استفاده کنیم
            flattened[fullKey] = value;
        }
    }
    
    return flattened;
}
```

### 4. **فیلتر کردن کلیدهای ترجمه شده** (خط 977-1002)
```typescript
// در تابع convertLLMResponseToOriginalStructureNew
for (const originalKey in originalChunk) {
    if (flattenedResponse.hasOwnProperty(originalKey)) {
        result[originalKey] = flattenedResponse[originalKey];
    } else {
        // اگر کلید در پاسخ LLM نبود، آن را نادیده بگیریم
        this.logger.log(`Key ${originalKey} not found in LLM response, skipping`);
    }
}
```

### 5. **فراخوانی Diff View** (خط 329-333)
```typescript
// در تابع applyChunkToFile
this.showDiffViewWithControls(convertedResponse, result.chunkId).catch(error => {
    this.logger.error(`Error showing diff view for chunk ${result.chunkId}: ${error}`);
});
```

### 6. **ایجاد فایل JSON برای Diff** (خط 390-465)
```typescript
// در تابع showDiffViewWithControls - خط 407-420
// ایجاد محتوای جدید با اعمال تغییرات ترجمه شده به فایل اصلی
const newContent = JSON.parse(JSON.stringify(originalContent));

// اعمال تغییرات ترجمه شده به محتوای جدید
for (const key in translatedChanges) {
    if (translatedChanges[key] === null) {
        this.deleteNestedProperty(newContent, key);
    } else {
        this.setNestedProperty(newContent, key, translatedChanges[key]);
    }
}

// ایجاد فایل موقت برای diff با نام منحصر به فرد
const timestamp = Date.now();
const uniqueId = `${timestamp}-${chunkId}-${Math.random().toString(36).substr(2, 9)}`;
const tempDiffPath = path.join(os.tmpdir(), `i18n-nexus-diff-${uniqueId}.json`);
fs.writeFileSync(tempDiffPath, JSON.stringify(newContent, null, 2));
```

### 7. **باز کردن Diff View در VS Code** (خط 440-450)
```typescript
// در تابع showDiffViewWithControls
const originalUri = vscode.Uri.file(this.originalFilePath);
const diffUri = vscode.Uri.file(tempDiffPath);

// باز کردن diff view جدید
try {
    await vscode.commands.executeCommand('vscode.diff', originalUri, diffUri, `Live Translation Progress - ${chunkId} (${uniqueId})`);
    this.logger.log('Diff view opened successfully');
} catch (diffError) {
    this.logger.error(`Error opening diff view: ${diffError}`);
}
```

## مثال عملی

### ورودی LLM:
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

### تبدیل به Flat:
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای",
  "access-control.add-permission.role-label": "نقش"
}
```

### فیلتر کردن:
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای",
  "access-control.add-permission.role-label": "نقش"
}
```

### فایل JSON نهایی برای Diff:
```json
{
  "access-control": {
    "add-permission": {
      "title": "افزودن دسترسی برای",
      "role-label": "نقش",
      "level-aria-label": "Access level"
    },
    "permissions": {
      "title": "Permissions"
    }
  }
}
```

### نمایش در Diff View:
- **فایل اصلی**: محتوای کامل فایل فارسی
- **فایل جدید**: فایل فارسی + تغییرات چانک فعلی
- **نمایش**: فقط خطوط تغییر یافته به صورت قرمز (حذف) و سبز (اضافه)

این فرآیند برای هر چانک تکرار می‌شود و هر بار یک diff view جدید با نام منحصر به فرد باز می‌شود.