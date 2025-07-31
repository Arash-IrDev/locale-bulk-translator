import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ChunkDiffResult {
    chunkId: string;
    originalContent: any;
    translatedContent: any;
    startLine: number;
    endLine: number;
}

export class ChunkDiffViewer {
    private static instance: ChunkDiffViewer;
    private tempFiles: string[] = [];

    public static getInstance(): ChunkDiffViewer {
        if (!ChunkDiffViewer.instance) {
            ChunkDiffViewer.instance = new ChunkDiffViewer();
        }
        return ChunkDiffViewer.instance;
    }

    public async showChunkDiff(result: ChunkDiffResult, fileUri: vscode.Uri): Promise<boolean> {
        // ایجاد فایل‌های موقت
        const tempDir = path.join(os.tmpdir(), 'i18n-nexus-chunks');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempOriginalPath = path.join(tempDir, `${result.chunkId}_original.json`);
        const tempTranslatedPath = path.join(tempDir, `${result.chunkId}_translated.json`);

        // نوشتن محتوا به فایل‌های موقت
        fs.writeFileSync(tempOriginalPath, JSON.stringify(result.originalContent, null, 2));
        fs.writeFileSync(tempTranslatedPath, JSON.stringify(result.translatedContent, null, 2));

        // اضافه کردن به لیست فایل‌های موقت
        this.tempFiles.push(tempOriginalPath, tempTranslatedPath);

        const originalUri = vscode.Uri.file(tempOriginalPath);
        const translatedUri = vscode.Uri.file(tempTranslatedPath);

        // نمایش diff
        await vscode.commands.executeCommand('vscode.diff', originalUri, translatedUri, `Chunk ${result.chunkId} Translation`);

        // نمایش دکمه‌های کنترل
        return await this.showChunkControls(result);
    }

    private async showChunkControls(result: ChunkDiffResult): Promise<boolean> {
        const choices = [
            '✅ Accept This Chunk',
            '❌ Reject This Chunk',
            '⏸️ Pause Translation',
            '🛑 Cancel All'
        ];

        const choice = await vscode.window.showQuickPick(choices, {
            placeHolder: `Review translation for chunk ${result.chunkId}`,
            ignoreFocusOut: true
        });

        switch (choice) {
            case '✅ Accept This Chunk':
                return true;
            case '❌ Reject This Chunk':
                return false;
            case '⏸️ Pause Translation':
                return await this.handlePause();
            case '🛑 Cancel All':
                return false;
            default:
                return false;
        }
    }

    private async handlePause(): Promise<boolean> {
        const resume = await vscode.window.showInformationMessage(
            'Translation paused. Do you want to resume?',
            'Resume',
            'Cancel'
        );

        return resume === 'Resume';
    }

    public async showFinalDiff(filePath: string, newContent: any, originalContent: any): Promise<boolean> {
        const tempNewPath = path.join(os.tmpdir(), `i18n-nexus-final-${Date.now()}-${path.basename(filePath)}`);
        fs.writeFileSync(tempNewPath, JSON.stringify(newContent, null, 2));

        this.tempFiles.push(tempNewPath);

        const oldUri = vscode.Uri.file(filePath);
        const newUri = vscode.Uri.file(tempNewPath);

        await vscode.commands.executeCommand('vscode.diff', oldUri, newUri, 'Final Translation Changes');

        const choice = await vscode.window.showQuickPick(['Apply All Changes', 'Cancel'], {
            placeHolder: 'Apply all translation changes?'
        });

        return choice === 'Apply All Changes';
    }

    public cleanup(): void {
        // پاک کردن فایل‌های موقت
        for (const tempFile of this.tempFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (error) {
                console.error(`Error cleaning up temp file ${tempFile}:`, error);
            }
        }
        this.tempFiles = [];
    }

    public async showInlineDiff(editor: vscode.TextEditor, changes: any): Promise<void> {
        // نمایش تغییرات به صورت inline در editor
        const document = editor.document;
        const decorations: vscode.DecorationOptions[] = [];

        // ایجاد decoration برای تغییرات
        for (const [key, value] of Object.entries(changes)) {
            const range = this.findKeyRange(document, key);
            if (range) {
                decorations.push({
                    range,
                    renderOptions: {
                        after: {
                            contentText: ` → ${value}`,
                            color: new vscode.ThemeColor('diffEditor.insertedTextBackground')
                        }
                    }
                });
            }
        }

        // اعمال decorations
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder')
        });

        editor.setDecorations(decorationType, decorations);

        // حذف decorations بعد از 5 ثانیه
        setTimeout(() => {
            decorationType.dispose();
        }, 5000);
    }

    private findKeyRange(document: vscode.TextDocument, key: string): vscode.Range | null {
        const text = document.getText();
        const keyIndex = text.indexOf(`"${key}"`);
        
        if (keyIndex === -1) {
            return null;
        }

        const startPos = document.positionAt(keyIndex);
        const endPos = document.positionAt(keyIndex + key.length + 2); // +2 for quotes

        return new vscode.Range(startPos, endPos);
    }
} 