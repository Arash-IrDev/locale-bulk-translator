import * as vscode from 'vscode';
import { ChunkDiffViewer, ChunkDiffResult } from '../chunkDiffViewer';

// Mock VS Code
jest.mock('vscode', () => ({
    window: {
        showQuickPick: jest.fn(),
        showInformationMessage: jest.fn(),
        createTextEditorDecorationType: jest.fn(() => ({
            dispose: jest.fn()
        }))
    },
    commands: {
        executeCommand: jest.fn()
    },
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path }))
    },
    ThemeColor: jest.fn(),
    Range: jest.fn(),
    Position: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn()
}));

// Mock path
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    basename: jest.fn((path: string) => path.split('/').pop())
}));

// Mock os
jest.mock('os', () => ({
    tmpdir: jest.fn(() => '/tmp')
}));

describe('ChunkDiffViewer', () => {
    let viewer: ChunkDiffViewer;

    beforeEach(() => {
        viewer = ChunkDiffViewer.getInstance();
    });

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = ChunkDiffViewer.getInstance();
            const instance2 = ChunkDiffViewer.getInstance();
            
            expect(instance1).toBe(instance2);
        });
    });

    describe('showChunkDiff', () => {
        it('should create temp files and show diff', async () => {
            const mockResult: ChunkDiffResult = {
                chunkId: 'chunk_1',
                originalContent: { key1: 'value1' },
                translatedContent: { key1: 'translated1' },
                startLine: 0,
                endLine: 10
            };

            const mockUri = { fsPath: '/test/file.json' } as vscode.Uri;

            // Mock user choice
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('✅ Accept This Chunk');

            const result = await viewer.showChunkDiff(mockResult, mockUri);

            expect(result).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.diff',
                expect.any(Object),
                expect.any(Object),
                'Chunk chunk_1 Translation'
            );
        });

        it('should handle reject choice', async () => {
            const mockResult: ChunkDiffResult = {
                chunkId: 'chunk_1',
                originalContent: { key1: 'value1' },
                translatedContent: { key1: 'translated1' },
                startLine: 0,
                endLine: 10
            };

            const mockUri = { fsPath: '/test/file.json' } as vscode.Uri;

            // Mock user choice
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('❌ Reject This Chunk');

            const result = await viewer.showChunkDiff(mockResult, mockUri);

            expect(result).toBe(false);
        });

        it('should handle pause choice', async () => {
            const mockResult: ChunkDiffResult = {
                chunkId: 'chunk_1',
                originalContent: { key1: 'value1' },
                translatedContent: { key1: 'translated1' },
                startLine: 0,
                endLine: 10
            };

            const mockUri = { fsPath: '/test/file.json' } as vscode.Uri;

            // Mock user choices
            (vscode.window.showQuickPick as jest.Mock)
                .mockResolvedValueOnce('⏸️ Pause Translation');
            (vscode.window.showInformationMessage as jest.Mock)
                .mockResolvedValue('Resume');

            const result = await viewer.showChunkDiff(mockResult, mockUri);

            expect(result).toBe(true);
        });

        it('should handle cancel choice', async () => {
            const mockResult: ChunkDiffResult = {
                chunkId: 'chunk_1',
                originalContent: { key1: 'value1' },
                translatedContent: { key1: 'translated1' },
                startLine: 0,
                endLine: 10
            };

            const mockUri = { fsPath: '/test/file.json' } as vscode.Uri;

            // Mock user choice
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('🛑 Cancel All');

            const result = await viewer.showChunkDiff(mockResult, mockUri);

            expect(result).toBe(false);
        });
    });

    describe('showFinalDiff', () => {
        it('should show final diff and return user choice', async () => {
            const filePath = '/test/file.json';
            const newContent = { key1: 'new1', key2: 'new2' };
            const originalContent = { key1: 'old1' };

            // Mock user choice
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Apply All Changes');

            const result = await viewer.showFinalDiff(filePath, newContent, originalContent);

            expect(result).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'vscode.diff',
                expect.any(Object),
                expect.any(Object),
                'Final Translation Changes'
            );
        });

        it('should handle cancel choice in final diff', async () => {
            const filePath = '/test/file.json';
            const newContent = { key1: 'new1' };
            const originalContent = { key1: 'old1' };

            // Mock user choice
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Cancel');

            const result = await viewer.showFinalDiff(filePath, newContent, originalContent);

            expect(result).toBe(false);
        });
    });

    describe('cleanup', () => {
        it('should clean up temp files', () => {
            // Mock fs.existsSync to return true
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);

            viewer.cleanup();

            expect(fs.unlinkSync).toHaveBeenCalled();
        });

        it('should handle cleanup errors gracefully', () => {
            const fs = require('fs');
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.unlinkSync as jest.Mock).mockImplementation(() => {
                throw new Error('File not found');
            });

            // Should not throw error
            expect(() => viewer.cleanup()).not.toThrow();
        });
    });

    describe('showInlineDiff', () => {
        it('should create decorations for changes', async () => {
            const mockEditor = {
                document: {
                    getText: jest.fn(() => '"key1": "old value"'),
                    positionAt: jest.fn(() => ({ line: 0, character: 0 }))
                },
                setDecorations: jest.fn()
            } as any;

            const changes = { key1: 'new value' };

            await viewer.showInlineDiff(mockEditor, changes);

            expect(mockEditor.setDecorations).toHaveBeenCalled();
        });
    });

    describe('findKeyRange', () => {
        it('should find key range in document', () => {
            const mockDocument = {
                getText: jest.fn(() => '"key1": "value1"'),
                positionAt: jest.fn((offset: number) => ({ line: 0, character: offset }))
            } as any;

            const range = (viewer as any).findKeyRange(mockDocument, 'key1');

            expect(range).toBeDefined();
        });

        it('should return null for non-existent key', () => {
            const mockDocument = {
                getText: jest.fn(() => '"key1": "value1"'),
                positionAt: jest.fn()
            } as any;

            const range = (viewer as any).findKeyRange(mockDocument, 'nonexistent');

            expect(range).toBeNull();
        });
    });
}); 