import * as vscode from 'vscode';
import { StreamingTranslationManager } from '../streamingTranslationManager';
import { Logger } from '../logger';

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
        showQuickPick: jest.fn(),
        withProgress: jest.fn(),
        createStatusBarItem: jest.fn(() => ({
            show: jest.fn(),
            dispose: jest.fn()
        })),
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
                    case 'chunkSize':
                        return 50;
                    case 'autoSaveInterval':
                        return 100;
                    case 'enableStreamingTranslation':
                        return true;
                    default:
                        return undefined;
                }
            })
        })),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    },
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path }))
    },
    StatusBarAlignment: {
        Right: 1
    }
}));

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    unlinkSync: jest.fn()
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    basename: jest.fn((path: string) => path.split('/').pop()),
    parse: jest.fn((path: string) => ({ name: path.split('/').pop()?.replace('.json', '') }))
}));

// Mock os
jest.mock('os', () => ({
    tmpdir: jest.fn(() => '/tmp')
}));

describe('StreamingTranslationManager', () => {
    let manager: StreamingTranslationManager;
    let mockLogger: Logger;
    let mockChannel: vscode.OutputChannel;

    beforeEach(() => {
        mockChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
            logStructures: jest.fn(),
            logProvider: jest.fn(),
            logTranslation: jest.fn(),
            logApi: jest.fn(),
            setLogLevel: jest.fn(),
            getLogLevel: jest.fn(),
            enableCategory: jest.fn(),
            disableCategory: jest.fn(),
            toggleCategory: jest.fn(),
            toggleDebugOutput: jest.fn(),
            isDebugEnabled: jest.fn(),
            getEnabledCategories: jest.fn(),
            isCategoryEnabled: jest.fn()
        } as any;

        manager = new StreamingTranslationManager(mockLogger, mockChannel);
    });

    describe('Constructor', () => {
        it('should initialize with default settings', () => {
            expect(manager).toBeDefined();
        });
    });

    describe('translateLargeFileStreaming', () => {
        it('should handle invalid file (output channel)', async () => {
            const mockUri = { fsPath: '/test/extension-output-file.json' } as vscode.Uri;
            
            await manager.translateLargeFileStreaming(mockUri);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'This file cannot be translated. Please select a valid translation JSON file.'
            );
        });

        it('should handle non-JSON file', async () => {
            const mockUri = { fsPath: '/test/file.txt' } as vscode.Uri;
            
            await manager.translateLargeFileStreaming(mockUri);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'This file cannot be translated. Please select a valid translation JSON file.'
            );
        });

        it('should handle missing configuration', async () => {
            const mockUri = { fsPath: '/test/workspace/file.json' } as vscode.Uri;
            
            // Mock fs operations for valid file
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{"key": "value"}');
            
            // Mock workspace.getConfiguration to return undefined
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn(() => undefined)
            });

            await manager.translateLargeFileStreaming(mockUri);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Translation failed: Error: Base path or base language not configured.'
            );
        });

        it('should handle base language file', async () => {
            const mockUri = { fsPath: '/test/workspace/en.json' } as vscode.Uri;
            
            // Mock fs operations for valid file
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{"key": "value"}');
            
            // Mock configuration
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string) => {
                    switch (key) {
                        case 'basePath':
                            return 'messages';
                        case 'baseLanguage':
                            return 'en';
                        case 'llmProvider':
                            return 'openai';
                        case 'llmApiKey':
                            return 'test-key';
                        default:
                            return undefined;
                    }
                })
            });

            await manager.translateLargeFileStreaming(mockUri);
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'This is the base language file, no translation needed.'
            );
        });
    });

    describe('isValidTranslationFile', () => {
        it('should reject output channel files', () => {
            const result = (manager as any).isValidTranslationFile('/test/extension-output-file.json');
            expect(result).toBe(false);
        });

        it('should reject non-JSON files', () => {
            const result = (manager as any).isValidTranslationFile('/test/file.txt');
            expect(result).toBe(false);
        });

        it('should accept valid JSON files', () => {
            // Mock fs operations
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{"key": "value"}');

            const result = (manager as any).isValidTranslationFile('/test/workspace/file.json');
            expect(result).toBe(true);
        });
    });

    describe('Utility methods', () => {
        it('should split into chunks correctly', () => {
            const largeObject: any = {};
            for (let i = 0; i < 150; i++) {
                largeObject[`key${i}`] = `value${i}`;
            }

            const chunks = (manager as any).splitIntoChunks(largeObject, 50);
            
            // With character-based chunking, the number of chunks will be different
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks.length).toBeLessThanOrEqual(150); // Maximum number of keys
            
            // Each chunk should have keys
            chunks.forEach((chunk: any) => {
                expect(Object.keys(chunk).length).toBeGreaterThan(0);
            });
        });

        it('should create temp file correctly', () => {
            const originalPath = '/test/file.json';
            const initialContent = { key1: 'value1' };

            const tempPath = (manager as any).createTempFile(originalPath, initialContent);
            
            expect(tempPath).toContain('streaming_');
            expect(tempPath).toContain('file.json');
        });

        it('should apply chunk to file correctly', async () => {
            const mockResult = {
                chunkId: 'chunk_1',
                originalContent: { key1: 'value1' },
                translatedContent: { key1: 'translated1' },
                tokensUsed: { inputTokens: 10, outputTokens: 5 },
                startLine: 0,
                endLine: 10,
                applied: false
            };

            // Mock temp file path
            (manager as any).tempFilePath = '/tmp/test.json';
            
            // Mock fs operations
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('{"key1": "old1"}');

            const result = await (manager as any).applyChunkToFile(mockResult);
            
            expect(result).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('Progress tracking', () => {
        it('should update progress correctly', async () => {
            const currentChunk = 5;
            const totalChunks = 10;
            const chunkId = 'chunk_5';
            const totalTokens = { inputTokens: 100, outputTokens: 50 };
            const acceptedChunks = 4;
            const rejectedChunks = 1;

            await (manager as any).updateProgress(
                currentChunk, 
                totalChunks, 
                chunkId, 
                totalTokens, 
                acceptedChunks, 
                rejectedChunks
            );

            expect(mockChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Translating chunk_5 (5/10) - 50% - Accepted: 4, Rejected: 1')
            );
        });
    });

    describe('State management', () => {
        it('should track active state', () => {
            expect(manager.isActive()).toBe(false);
        });

        it('should allow cancellation', () => {
            manager.cancelTranslation();
            expect(manager).toBeDefined();
        });
    });

    describe('Cleanup', () => {
        it('should cleanup resources correctly', () => {
            // Mock temp file path
            (manager as any).tempFilePath = '/tmp/test.json';
            
            // Mock fs operations
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            (manager as any).cleanup();

            expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.json');
        });

        it('should handle cleanup errors gracefully', () => {
            // Mock temp file path
            (manager as any).tempFilePath = '/tmp/test.json';
            
            // Mock fs operations to throw error
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.unlinkSync as jest.Mock).mockImplementation(() => {
                throw new Error('File not found');
            });

            // Should not throw error
            expect(() => (manager as any).cleanup()).not.toThrow();
        });
    });
}); 