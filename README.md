# Locale BulkTranslator

**Locale BulkTranslator** is an AI-powered VS Code extension and toolkit for translating **large locale files** (JSON/YAML) used in software projects.

This project is currently in **early development** – more features, documentation, and examples will be added soon.

---

## 🚀 Features

- Detect `locales/` folders (or any translation key/value files) in your project.
- Translate values into multiple languages using GPT, Gemini, or local LLMs.
- Handle **massive files** (20k+ lines) with smart chunking and streaming.
- Preserve keys, placeholders, formatting, and structure perfectly.
- Provide **diff view** to preview translations and approve or reject changes before applying.
- Stream huge locale files without loading them entirely in memory.
- Dynamically adjust batch size based on token usage.
- Auto-apply translations with real-time progress tracking.
---

## 📦 Current Status

✅ Repository initialized  
✅ Upstream synced for future updates  
🚧 Core extension structure coming next

---

## 📌 Roadmap (early draft)

- [ ] Basic VS Code extension scaffolding  
- [ ] Locale folder detection logic  
- [ ] AI translation engine integration (OpenAI + local LLM)  
- [ ] Chunking system for large files
 - [ ] CLI support (optional)

---

## 🔍 Translation Mode

i18n Nexus uses **Streaming Translation (Auto-Apply)** mode which:
- Processes files in chunks for optimal performance
- Shows real-time progress with diff views for each chunk
- Automatically applies approved translations
- Provides cancel and accept-all options during translation
- Handles large files efficiently without memory issues

---

## 🛠 Contributing

This repo will soon open for contributions. Until then, development is handled on the `main` branch, with upstream updates tracked via `upstream-main`.

## Configuration Options

The extension can handle extremely large translation files. Configure the following settings in VS Code:

- `i18nNexus.chunkSize` – maximum characters per chunk for optimal processing
- `i18nNexus.autoSaveInterval` – delay between chunk processing for better visual feedback
- `i18nNexus.translationBatchSize` – number of keys processed per batch when streaming
- `i18nNexus.batchTokenLimit` – approximate token threshold before the batch size is reduced
- `i18nNexus.parallelBatchCount` – how many batches to translate in parallel

---

## 🙏 Credits

This project is inspired by and builds upon concepts from  
**[i18n-intl](https://github.com/iaiuse/i18n-intl)** by [iaiuse](https://github.com/iaiuse).

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.