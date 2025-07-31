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
        try {
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

            if (decorations.length > 0) {
                // اعمال decorations
                const decorationType = vscode.window.createTextEditorDecorationType({
                    backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                    border: '1px solid',
                    borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder'),
                    overviewRulerColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                });

                editor.setDecorations(decorationType, decorations);

                // حذف decorations بعد از 3 ثانیه
                setTimeout(() => {
                    decorationType.dispose();
                }, 3000);
            }
        } catch (error) {
            console.error('Error showing inline diff:', error);
        }
    }

    public async showRealtimeDiff(editor: vscode.TextEditor | undefined, originalContent: any, translatedContent: any): Promise<void> {
        try {
            console.log('showRealtimeDiff called');
            
            if (!editor) {
                console.error('No active editor for realtime diff');
                return;
            }

            console.log('Editor found, processing diff...');

            const document = editor.document;
            const decorations: vscode.DecorationOptions[] = [];

            console.log(`Original content keys: ${Object.keys(originalContent).length}`);
            console.log(`Translated content keys: ${Object.keys(translatedContent).length}`);

            // مقایسه محتوای اصلی با محتوای ترجمه شده
            for (const [key, translatedValue] of Object.entries(translatedContent)) {
                const originalValue = this.getNestedValue(originalContent, key);
                
                console.log(`Comparing key: ${key}, original: ${originalValue}, translated: ${translatedValue}`);
                
                // اگر مقدار تغییر کرده یا جدید است
                if (originalValue !== translatedValue) {
                    console.log(`Difference found for key: ${key}`);
                    const range = this.findKeyRange(document, key);
                    if (range) {
                        console.log(`Range found for key: ${key}`);
                        const isNew = originalValue === undefined;
                        const decorationColor = isNew ? 
                            new vscode.ThemeColor('diffEditor.insertedTextBackground') : 
                            new vscode.ThemeColor('diffEditor.modifiedTextBackground');

                        decorations.push({
                            range,
                            renderOptions: {
                                after: {
                                    contentText: ` → ${translatedValue}`,
                                    color: decorationColor
                                }
                            }
                        });

                        // اضافه کردن دکمه‌های Accept/Reject برای این تغییر
                        this.addAcceptRejectButtons(editor, range, key, translatedValue, isNew);
                    } else {
                        console.log(`No range found for key: ${key}`);
                    }
                }
            }

            console.log(`Total decorations to apply: ${decorations.length}`);

            if (decorations.length > 0) {
                // اعمال decorations
                const decorationType = vscode.window.createTextEditorDecorationType({
                    backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                    border: '1px solid',
                    borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder'),
                    overviewRulerColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                });

                editor.setDecorations(decorationType, decorations);
                console.log('Decorations applied successfully');

                // حذف decorations بعد از 5 ثانیه
                setTimeout(() => {
                    decorationType.dispose();
                    console.log('Decorations disposed');
                }, 5000);
            } else {
                console.log('No decorations to apply');
            }
        } catch (error) {
            console.error('Error showing realtime diff:', error);
        }
    }

    private findKeyRange(document: vscode.TextDocument, key: string): vscode.Range | null {
        const text = document.getText();
        
        // برای کلیدهای nested، فقط آخرین بخش را جستجو کنیم
        const keyParts = key.split('.');
        const lastKey = keyParts[keyParts.length - 1];
        
        console.log(`Looking for key: ${key}, lastKey: ${lastKey}`);
        
        // جستجو برای کلید کامل
        let keyIndex = text.indexOf(`"${key}"`);
        if (keyIndex === -1) {
            // اگر کلید کامل پیدا نشد، برای آخرین بخش جستجو کنیم
            keyIndex = text.indexOf(`"${lastKey}"`);
            console.log(`Full key not found, searching for lastKey: ${lastKey}, found at: ${keyIndex}`);
        } else {
            console.log(`Full key found at: ${keyIndex}`);
        }
        
        if (keyIndex === -1) {
            console.log(`Key not found in document: ${key}`);
            return null;
        }

        const startPos = document.positionAt(keyIndex);
        const endPos = document.positionAt(keyIndex + lastKey.length + 2); // +2 for quotes

        console.log(`Range created: ${startPos.line}:${startPos.character} to ${endPos.line}:${endPos.character}`);
        return new vscode.Range(startPos, endPos);
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((o, i) => o ? o[i] : undefined, obj);
    }

    private addAcceptRejectButtons(editor: vscode.TextEditor, range: vscode.Range, key: string, translatedValue: any, isNew: boolean): void {
        try {
            // ایجاد دکمه‌های Accept/Reject در editor
            const acceptRejectDecoration = vscode.window.createTextEditorDecorationType({
                after: {
                    contentText: ' $(check) Accept $(x) Reject',
                    color: new vscode.ThemeColor('editor.foreground'),
                    backgroundColor: new vscode.ThemeColor('editor.lineHighlightBackground'),
                    border: '1px solid',
                    borderColor: new vscode.ThemeColor('editor.lineHighlightBorder'),
                    margin: '0 0 0 10px'
                }
            });

            // اعمال decoration
            editor.setDecorations(acceptRejectDecoration, [range]);

            // ثبت command برای دکمه‌ها
            const acceptCommand = vscode.commands.registerCommand(`i18n-nexus.accept-${key}`, () => {
                this.handleAccept(editor, key, translatedValue, isNew);
                acceptRejectDecoration.dispose();
            });

            const rejectCommand = vscode.commands.registerCommand(`i18n-nexus.reject-${key}`, () => {
                this.handleReject(editor, key);
                acceptRejectDecoration.dispose();
            });

            // حذف decoration بعد از 10 ثانیه
            setTimeout(() => {
                acceptRejectDecoration.dispose();
                acceptCommand.dispose();
                rejectCommand.dispose();
            }, 10000);

        } catch (error) {
            console.error('Error adding accept/reject buttons:', error);
        }
    }

    private async handleAccept(editor: vscode.TextEditor, key: string, translatedValue: any, isNew: boolean): Promise<void> {
        try {
            // اعمال تغییر به فایل
            const document = editor.document;
            const range = this.findKeyRange(document, key);
            
            if (range) {
                // اگر کلید جدید است، آن را اضافه کنیم
                if (isNew) {
                    const insertPosition = new vscode.Position(range.end.line + 1, 0);
                    const insertText = `  "${key}": "${translatedValue}",\n`;
                    await editor.edit(editBuilder => {
                        editBuilder.insert(insertPosition, insertText);
                    });
                } else {
                    // اگر کلید موجود است، مقدار آن را تغییر دهیم
                    const valueRange = this.findValueRange(document, key);
                    if (valueRange) {
                        await editor.edit(editBuilder => {
                            editBuilder.replace(valueRange, `"${translatedValue}"`);
                        });
                    }
                }

                vscode.window.showInformationMessage(`✅ Accepted translation for "${key}"`);
            }
        } catch (error) {
            console.error('Error handling accept:', error);
            vscode.window.showErrorMessage(`Error accepting translation for "${key}"`);
        }
    }

    private async handleReject(editor: vscode.TextEditor, key: string): Promise<void> {
        try {
            vscode.window.showInformationMessage(`❌ Rejected translation for "${key}"`);
        } catch (error) {
            console.error('Error handling reject:', error);
        }
    }

    private findValueRange(document: vscode.TextDocument, key: string): vscode.Range | null {
        const text = document.getText();
        const keyIndex = text.indexOf(`"${key}"`);
        
        if (keyIndex === -1) return null;
        
        // پیدا کردن مقدار بعد از کلید
        const afterKey = text.substring(keyIndex + key.length + 2); // +2 for quotes
        const colonIndex = afterKey.indexOf(':');
        if (colonIndex === -1) return null;
        
        const afterColon = afterKey.substring(colonIndex + 1);
        const valueStart = afterColon.search(/\S/); // پیدا کردن اولین کاراکتر غیر-whitespace
        if (valueStart === -1) return null;
        
        const valueText = afterColon.substring(valueStart);
        const quoteMatch = valueText.match(/^"([^"]*)"?/);
        if (!quoteMatch) return null;
        
        const valueLength = quoteMatch[0].length;
        const startPos = document.positionAt(keyIndex + key.length + 2 + colonIndex + 1 + valueStart);
        const endPos = document.positionAt(keyIndex + key.length + 2 + colonIndex + 1 + valueStart + valueLength);
        
        return new vscode.Range(startPos, endPos);
    }
} 