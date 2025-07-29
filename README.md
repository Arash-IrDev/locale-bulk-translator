# Locale BulkTranslator

**Locale BulkTranslator** is an AI-powered VS Code extension and toolkit for translating **large locale files** (JSON/YAML) used in software projects.

This project is currently in **early development** – more features, documentation, and examples will be added soon.

---

## 🚀 Features

- Detect `locales/` folders (or any translation key/value files) in your project.
- Translate values into multiple languages using GPT, Gemini, or local LLMs.
- Handle **massive files** (20k+ lines) with smart chunking.
- Preserve keys, placeholders, formatting, and structure perfectly.
- Provide **diff view** to preview translations and approve or reject changes before applying.

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

## 🔍 Diff Preview

i18n Nexus opens a diff view after generating translations so you can review the proposed changes. Choose **Apply Changes** to write the file or **Cancel** to keep the original.

This behaviour can be turned off by setting `"i18nNexus.enableDiffView": false` in your VS Code settings.

---

## 🛠 Contributing

This repo will soon open for contributions. Until then, development is handled on the `main` branch, with upstream updates tracked via `upstream-main`.

---

## 🙏 Credits

This project is inspired by and builds upon concepts from  
**[i18n-intl](https://github.com/iaiuse/i18n-intl)** by [iaiuse](https://github.com/iaiuse).

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.