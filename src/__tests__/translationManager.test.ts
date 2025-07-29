import { TranslationManager } from '../translationManager';
import { Logger } from '../logger';
import * as vscode from 'vscode';

// Mock the vscode module
jest.mock('vscode');

// Mock the LLMService
jest.mock('../llmService', () => ({
  LLMService: jest.fn().mockImplementation(() => ({
    initializeProvider: jest.fn(),
    translate: jest.fn(),
  })),
}));

describe('TranslationManager', () => {
  let translationManager: TranslationManager;
  let mockLogger: Logger;
  let mockChannel: vscode.OutputChannel;

  beforeEach(() => {
    mockChannel = {
      appendLine: jest.fn(),
      show: jest.fn(),
    } as any;

    mockLogger = new Logger(mockChannel);
    translationManager = new TranslationManager(mockLogger, mockChannel);
  });

  test('should be instantiated', () => {
    expect(translationManager).toBeDefined();
  });

  test('should have translate method', () => {
    expect(typeof translationManager.translate).toBe('function');
  });

  test('should have translateFile method', () => {
    expect(typeof translationManager.translateFile).toBe('function');
  });
}); 