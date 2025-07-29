// Mock for vscode module
export const window = {
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
  })),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  activeTextEditor: null,
};

export const commands = {
  registerCommand: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
  })),
};

export const extensions = {
  getExtension: jest.fn(() => ({
    activate: jest.fn(),
    exports: {},
  })),
};

export const ExtensionContext = jest.fn();

export const Uri = {
  file: jest.fn(),
};

export const Range = jest.fn();
export const Position = jest.fn(); 