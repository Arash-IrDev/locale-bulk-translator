# Testing Guide for i18n Nexus Extension

## 🧪 Running Tests

### Unit Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Compilation
```bash
npm run compile
```

## 🚀 Development Testing

### 1. Extension Development Host
1. Open the project in VS Code
2. Press `F5` or go to `Run -> Start Debugging`
3. A new VS Code window will open with your extension loaded
4. Test the extension commands in the new window

### 2. Testing Commands
In the Development Host window:
- `Cmd+Shift+P` → "i18n Nexus: Translate File"
- `Cmd+Shift+P` → "i18n Nexus: Configure AI Model"
- `Cmd+Shift+P` → "Show i18n Nexus Configuration"

### 3. Testing with Real Files
1. Create a test project with locale files
2. Configure your API keys in VS Code settings
3. Run translation commands
4. Check the output channel for logs

## 📁 Test Structure

```
src/
├── __tests__/
│   ├── extension.test.ts      # Extension activation tests
│   ├── streamingTranslationManager.test.ts  # StreamingTranslationManager tests
│   └── setup.ts              # Jest setup
├── __mocks__/
│   └── vscode.ts             # VS Code API mocks
└── ...
```

## 🔧 Test Configuration

- **Jest**: Configured for TypeScript
- **Mocks**: VS Code API is mocked for unit tests
- **Coverage**: Basic test coverage for core functionality

## 🐛 Debugging Tests

```bash
# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- streamingTranslationManager.test.ts

# Run with verbose output
npm test -- --verbose
```

## 📝 Adding New Tests

1. Create test files in `src/__tests__/`
2. Use Jest syntax: `describe`, `test`, `expect`
3. Mock external dependencies
4. Test both success and error cases

## 🎯 Test Coverage Goals

- [x] Extension activation
- [x] Basic StreamingTranslationManager functionality
- [ ] LLM provider integration
- [ ] File translation workflows
- [ ] Configuration management
- [ ] Error handling 