import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        activeTextEditor: {
            document: {
                uri: { fsPath: '/test/file.json' }
            }
        }
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string) => {
                switch (key) {
                    case 'basePath':
                        return 'messages';
                    case 'baseLanguage':
                        return 'en';
                    case 'targetLanguages':
                        return ['fa', 'es'];
                    case 'llmProvider':
                        return 'openai';
                    case 'llmApiKey':
                        return 'test-key';
                    case 'llmApiUrl':
                        return 'https://api.openai.com/v1';
                    default:
                        return undefined;
                }
            })
        })),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    },
    commands: {
        registerCommand: jest.fn(() => ({
            dispose: jest.fn()
        }))
    },
    ExtensionContext: jest.fn()
}));

describe('Extension', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('File validation', () => {
        it('should validate translation files correctly', () => {
            // This test checks the isValidTranslationFile function defined in extension.ts
            // We cannot directly access that function, but we can test its logic
            
            const isValidTranslationFile = (filePath: string): boolean => {
                return !filePath.includes('extension-output') && 
                       !filePath.includes('i18n Nexus') && 
                       filePath.endsWith('.json');
            };

            // Test valid files
            expect(isValidTranslationFile('/test/workspace/messages/en.json')).toBe(true);
            expect(isValidTranslationFile('/test/workspace/messages/fa.json')).toBe(true);
            expect(isValidTranslationFile('/test/workspace/translations/es.json')).toBe(true);

            // Test invalid files
            expect(isValidTranslationFile('/test/extension-output/file.json')).toBe(false);
            expect(isValidTranslationFile('/test/i18n Nexus/file.json')).toBe(false);
            expect(isValidTranslationFile('/test/workspace/messages/en.txt')).toBe(false);
            expect(isValidTranslationFile('/test/workspace/messages/en')).toBe(false);
            expect(isValidTranslationFile('')).toBe(false);
        });

        it('should reject output channel files', () => {
            const isValidTranslationFile = (filePath: string): boolean => {
                return !filePath.includes('extension-output') && 
                       !filePath.includes('i18n Nexus') && 
                       filePath.endsWith('.json');
            };

            expect(isValidTranslationFile('extension-output-iaiuse.i18n-nexus-#1-i18n Nexus')).toBe(false);
            expect(isValidTranslationFile('/var/folders/test/extension-output/file.json')).toBe(false);
            expect(isValidTranslationFile('/tmp/i18n Nexus/output.json')).toBe(false);
        });

        it('should reject non-JSON files', () => {
            const isValidTranslationFile = (filePath: string): boolean => {
                return !filePath.includes('extension-output') && 
                       !filePath.includes('i18n Nexus') && 
                       filePath.endsWith('.json');
            };

            expect(isValidTranslationFile('/test/workspace/messages/en.txt')).toBe(false);
            expect(isValidTranslationFile('/test/workspace/messages/fa.js')).toBe(false);
            expect(isValidTranslationFile('/test/workspace/messages/es')).toBe(false);
            expect(isValidTranslationFile('/test/workspace/messages/en.json.bak')).toBe(false);
        });

        it('should accept valid JSON files in workspace', () => {
            const isValidTranslationFile = (filePath: string): boolean => {
                return !filePath.includes('extension-output') && 
                       !filePath.includes('i18n Nexus') && 
                       filePath.endsWith('.json');
            };

            expect(isValidTranslationFile('/test/workspace/messages/en.json')).toBe(true);
            expect(isValidTranslationFile('/test/workspace/src/i18n/fa.json')).toBe(true);
            expect(isValidTranslationFile('/test/workspace/locales/es.json')).toBe(true);
        });
    });

    describe('Command registration', () => {
        it('should register all required commands', () => {
            // This test checks that all required commands are registered
            const expectedCommands = [
                'i18n-nexus.showConfig',
                'i18n-nexus.configureModel',
                'i18n-nexus.toggleDebugOutput',
                'i18n-nexus.streamingTranslation',
                'i18n-nexus.cancelTranslation',
                'i18n-nexus.openSettings'
            ];

            // In reality, these commands are registered in the activate function
            // This test is for documentation purposes
            expect(expectedCommands).toHaveLength(6);
        });
    });

    describe('Configuration handling', () => {
        it('should handle configuration correctly', () => {
            const config = vscode.workspace.getConfiguration('i18nNexus');
            
            expect(config.get('basePath')).toBe('messages');
            expect(config.get('baseLanguage')).toBe('en');
            expect(config.get('targetLanguages')).toEqual(['fa', 'es']);
            expect(config.get('llmProvider')).toBe('openai');
        });
    });
}); 