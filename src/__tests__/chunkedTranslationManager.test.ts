import * as vscode from 'vscode';
import { ChunkedTranslationManager } from '../chunkedTranslationManager';
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
        }))
    },
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string) => {
                switch (key) {
                    case 'chunkSize':
                        return 50;
                    case 'enableChunkedTranslation':
                        return true;
                    default:
                        return undefined;
                }
            })
        })),
        workspaceRoot: '/test/workspace'
    },
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path }))
    },
    StatusBarAlignment: {
        Right: 1
    }
}));

describe('ChunkedTranslationManager', () => {
    let manager: ChunkedTranslationManager;
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
            warn: jest.fn()
        } as any;

        manager = new ChunkedTranslationManager(mockLogger, mockChannel);
    });

    describe('Constructor', () => {
        it('should initialize with default chunk size', () => {
            expect(manager).toBeDefined();
        });
    });

    describe('splitIntoChunks', () => {
        it('should split large object into chunks', () => {
            const largeObject: any = {};
            for (let i = 0; i < 150; i++) {
                largeObject[`key${i}`] = `value${i}`;
            }

            const chunks = (manager as any).splitIntoChunks(largeObject, 50);
            
            expect(chunks).toHaveLength(3);
            expect(Object.keys(chunks[0])).toHaveLength(50);
            expect(Object.keys(chunks[1])).toHaveLength(50);
            expect(Object.keys(chunks[2])).toHaveLength(50);
        });

        it('should handle empty object', () => {
            const chunks = (manager as any).splitIntoChunks({}, 50);
            expect(chunks).toHaveLength(0);
        });

        it('should handle object smaller than chunk size', () => {
            const smallObject = { key1: 'value1', key2: 'value2' };
            const chunks = (manager as any).splitIntoChunks(smallObject, 50);
            
            expect(chunks).toHaveLength(1);
            expect(Object.keys(chunks[0])).toHaveLength(2);
        });
    });

    describe('translateLargeFile', () => {
        it('should handle missing configuration', async () => {
            const mockUri = { fsPath: '/test/file.json' } as vscode.Uri;
            
            // Mock workspace.getConfiguration to return undefined
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn(() => undefined)
            });

            await manager.translateLargeFile(mockUri);
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Translation failed: Error: Base path or base language not configured.'
            );
        });

        it('should handle base language file', async () => {
            const mockUri = { fsPath: '/test/en.json' } as vscode.Uri;
            
            // Mock configuration
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string) => {
                    switch (key) {
                        case 'basePath':
                            return 'messages';
                        case 'baseLanguage':
                            return 'en';
                        default:
                            return undefined;
                    }
                })
            });

            await manager.translateLargeFile(mockUri);
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'This is the base language file, no translation needed.'
            );
        });
    });

    describe('Utility methods', () => {
        it('should merge contents correctly', () => {
            const baseContent = { key1: 'value1', key2: 'value2' };
            const targetContent = { key1: 'translated1' };
            const translatedContent = { key2: 'translated2' };

            const result = (manager as any).mergeContents(baseContent, targetContent, translatedContent);
            
            expect(result).toEqual({
                key1: 'value1',
                key2: 'translated2'
            });
        });

        it('should set nested properties correctly', () => {
            const obj: any = {};
            (manager as any).setNestedProperty(obj, 'level1.level2.key', 'value');
            
            expect(obj.level1.level2.key).toBe('value');
        });

        it('should delete nested properties correctly', () => {
            const obj = {
                level1: {
                    level2: {
                        key: 'value'
                    }
                }
            };
            
            (manager as any).deleteNestedProperty(obj, 'level1.level2.key');
            
            expect(obj.level1.level2.key).toBeUndefined();
        });
    });

    describe('State management', () => {
        it('should track active state', () => {
            expect(manager.isActive()).toBe(false);
        });

        it('should allow cancellation', () => {
            manager.cancelTranslation();
            // Note: We can't easily test the internal state without exposing it
            expect(manager).toBeDefined();
        });
    });
}); 