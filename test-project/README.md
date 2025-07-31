# Test Project for i18n Nexus Extension

This is a test project to verify the functionality of the i18n Nexus VS Code extension.

## Project Structure

```
test-project/
├── package.json
├── messages/
│   ├── zh-CN.json  (Base language - Chinese)
│   └── en.json     (Target language - English)
└── README.md
```

## Testing Steps

1. **Open this project in VS Code Extension Development Host**
   - The extension should be active in the development host
   - You should see a warning about limited functionality if API key is not configured

2. **Configure the Extension**
   - Press `Cmd+Shift+P` and run "i18n Nexus: Configure AI Model"
   - Enter your API key and select your preferred LLM provider
   - Configure target languages in VS Code settings

3. **Test Translation**
   - Open `messages/zh-CN.json` to see the base language file
   - Press `Cmd+Shift+P` and run "i18n Nexus: Translate Files"
   - Check the generated translation files in the `messages/` folder

4. **Test Current File Translation**
   - Open `messages/zh-CN.json`
   - Press `Cmd+Shift+P` and run "i18n Nexus: Translate Current File"
   - This will translate only the currently open file

## Expected Results

After successful translation, you should see:
- New language files created in the `messages/` folder
- A diff view showing the changes
- Translated content that maintains the JSON structure

## Troubleshooting

- If commands are not found, make sure the extension is properly compiled
- If translation fails, check your API key and internet connection
- Check the Output Channel for detailed logs and error messages 