# Nested to Flat JSON Conversion Fix

## Problem Description

The issue was that LLM responses were being returned in nested object format (e.g., `{"access-control": {"add-permission": {"title": "value"}}}`), but the translation system expected flat keys with dots (e.g., `{"access-control.add-permission.title": "value"}`). This caused problems in:

1. **Diff View**: The nested structure didn't match the flat structure expected by the diff viewer
2. **File Merging**: The merge process couldn't properly apply changes from nested responses to flat target files
3. **Auto-apply**: The automatic application of translations failed due to structure mismatch

## Solution Implemented

### 1. Added `flattenNestedContent` Method

This method recursively converts nested objects to flat key-value pairs:

```typescript
private flattenNestedContent(nestedContent: any, prefix: string = ''): any {
    const flattened: any = {};
    
    for (const key in nestedContent) {
        const value = nestedContent[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // If value is an object, recursively flatten it
            const subFlattened = this.flattenNestedContent(value, fullKey);
            Object.assign(flattened, subFlattened);
        } else {
            // If value is primitive, use the full key
            flattened[fullKey] = value;
        }
    }
    
    return flattened;
}
```

### 2. Updated `mergeContents` Method

Modified the merge process to handle flattened content:

```typescript
private mergeContents(baseContent: any, targetContent: any, translatedContent: any): any {
    const merged = JSON.parse(JSON.stringify(baseContent));

    // Convert translatedContent to flat structure for easier processing
    const flatTranslated = this.flattenNestedContent(translatedContent);

    for (const key in flatTranslated) {
        if (flatTranslated[key] === null) {
            // Delete key from nested structure
            this.deleteNestedProperty(merged, key);
        } else {
            // Add or update key in nested structure
            this.setNestedProperty(merged, key, flatTranslated[key]);
        }
    }

    return merged;
}
```

### 3. Added `unflattenContent` Method

This method converts flat keys back to nested structure (for future use):

```typescript
private unflattenContent(flatContent: any): any {
    const nested: any = {};
    
    for (const key in flatContent) {
        const value = flatContent[key];
        const keyParts = key.split('.');
        
        let current = nested;
        for (let i = 0; i < keyParts.length - 1; i++) {
            const part = keyParts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }
        
        const lastPart = keyParts[keyParts.length - 1];
        current[lastPart] = value;
    }
    
    return nested;
}
```

## Files Modified

### 1. `src/streamingTranslationManager.ts`
- Added `flattenNestedContent` method
- Added `unflattenContent` method
- Updated `mergeContents` method to use flattening
- Updated `convertLLMResponseToOriginalStructure` method

### 2. `src/chunkedTranslationManager.ts`
- Added `flattenNestedContent` method
- Updated `mergeContents` method to use flattening

### 3. `src/translationManager.ts`
- Added `flattenNestedContent` method
- Updated `mergeContents` method to use flattening

## How It Works

1. **LLM Response**: LLM returns nested object structure
2. **Flattening**: `flattenNestedContent` converts nested to flat keys
3. **Matching**: Flat keys are matched with original chunk keys
4. **Merging**: `mergeContents` applies changes using `setNestedProperty` and `deleteNestedProperty`
5. **Result**: Proper nested structure is maintained in the target file

## Example

**Input (LLM Response):**
```json
{
  "access-control": {
    "add-permission": {
      "title": "افزودن دسترسی برای"
    }
  }
}
```

**Flattened:**
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای"
}
```

**Original Chunk:**
```json
{
  "access-control.add-permission.title": "Add permission for"
}
```

**Result:**
```json
{
  "access-control.add-permission.title": "افزودن دسترسی برای"
}
```

**Final File Structure:**
```json
{
  "access-control": {
    "add-permission": {
      "title": "افزودن دسترسی برای"
    }
  }
}
```

## Benefits

1. **Proper Diff View**: Diff viewer now correctly compares flat structures
2. **Accurate Merging**: Changes are properly applied to nested target files
3. **Auto-apply Support**: Automatic application works correctly
4. **Consistent Structure**: Maintains the original nested structure in target files
5. **Backward Compatibility**: Existing functionality remains unchanged

## Testing

The fix has been tested with:
- Nested LLM responses
- Flat original chunks
- Complex nested structures
- Mixed primitive and object values
- Null values for deletion

The conversion process correctly handles all scenarios and maintains data integrity throughout the translation process. 