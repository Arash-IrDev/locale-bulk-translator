import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMService } from './llmService';
import { Logger } from './logger';
import { ChunkDiffViewer, ChunkDiffResult } from './chunkDiffViewer';

interface StreamingTranslationResult {
    chunkId: string;
    originalContent: any;
    translatedContent: any;
    tokensUsed: { inputTokens: number; outputTokens: number };
    startLine: number;
    endLine: number;
    applied: boolean;
}

interface TranslationProgress {
    currentChunk: number;
    totalChunks: number;
    currentChunkId: string;
    totalTokens: { inputTokens: number; outputTokens: number };
    acceptedChunks: number;
    rejectedChunks: number;
}

export class StreamingTranslationManager {
    private llmService: LLMService;
    private logger: Logger;
    private outputChannel: vscode.OutputChannel;
    private chunkSize: number;
    private autoSaveInterval: number;
    private isTranslationActive: boolean = false;
    private translationCancelled: boolean = false;
    private progressBar: vscode.Progress<{ message?: string; increment?: number }> | null = null;
    private statusBarItem: vscode.StatusBarItem | null = null;
    private acceptAllItem: vscode.StatusBarItem | null = null;
    private cancelItem: vscode.StatusBarItem | null = null;
    private tempFilePath: string | null = null;
    private originalFilePath: string | null = null;
    private diffViewer: ChunkDiffViewer;

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.llmService = new LLMService(logger, channel);
        this.logger = logger;
        this.outputChannel = channel;
        this.diffViewer = ChunkDiffViewer.getInstance();
        
        // دریافت تنظیمات
        const config = vscode.workspace.getConfiguration('i18nNexus');
        this.chunkSize = config.get<number>('chunkSize', 50);
        this.autoSaveInterval = config.get<number>('autoSaveInterval', 100);
    }

    public async translateLargeFileStreaming(fileUri: vscode.Uri): Promise<void> {
        if (this.isTranslationActive) {
            vscode.window.showWarningMessage('Translation is already in progress. Please wait for it to complete.');
            return;
        }

        this.isTranslationActive = true;
        this.translationCancelled = false;

        try {
            const filePath = fileUri.fsPath;
            this.originalFilePath = filePath;
            this.logger.log(`Starting streaming translation for file: ${filePath}`);

            // بررسی معتبر بودن فایل
            if (!this.isValidTranslationFile(filePath)) {
                vscode.window.showErrorMessage('This file cannot be translated. Please select a valid translation JSON file.');
                return;
            }

            // دریافت تنظیمات
            const config = vscode.workspace.getConfiguration('i18nNexus');
            const basePath = config.get<string>('basePath');
            const baseLanguage = config.get<string>('baseLanguage');
            const llmProvider = config.get<string>('llmProvider');
            const llmApiKey = config.get<string>('llmApiKey');

            this.logger.log(`Configuration: basePath=${basePath}, baseLanguage=${baseLanguage}, llmProvider=${llmProvider}, hasApiKey=${!!llmApiKey}`);

            if (!basePath || !baseLanguage) {
                throw new Error('Base path or base language not configured.');
            }

            if (!llmProvider || !llmApiKey) {
                throw new Error('LLM provider or API key not configured.');
            }

            // تشخیص زبان فایل
            const fileName = path.basename(filePath);
            const lang = path.parse(fileName).name;

            if (lang === baseLanguage) {
                vscode.window.showInformationMessage('This is the base language file, no translation needed.');
                return;
            }

            // خواندن فایل‌ها
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const fullBasePath = path.join(workspaceRoot, basePath);
            const baseFilePath = path.join(fullBasePath, `${baseLanguage}.json`);

            if (!fs.existsSync(baseFilePath)) {
                throw new Error(`Base language file not found: ${baseFilePath}`);
            }

            const baseContent = this.loadJsonFile(baseFilePath);
            const targetContent = fs.existsSync(filePath) ? this.loadJsonFile(filePath) : {};
            const originalBaseContent = this.getOriginalBaseContent(baseFilePath);

            // آماده‌سازی محتوای ترجمه
            const toTranslate = this.prepareTranslationContent(baseContent, targetContent, originalBaseContent);

            if (Object.keys(toTranslate).length === 0) {
                vscode.window.showInformationMessage('No changes detected, no translation needed.');
                return;
            }

            // تقسیم به چانک‌ها
            const chunks = this.splitIntoChunks(toTranslate, this.chunkSize);
            this.logger.log(`Split content into ${chunks.length} chunks`);

            // ایجاد فایل موقت برای ترجمه
            this.tempFilePath = this.createTempFile(filePath, targetContent);

            // شروع ترجمه استریمینگ
            const results: StreamingTranslationResult[] = [];
            let totalTokens = { inputTokens: 0, outputTokens: 0 };
            let acceptedChunks = 0;
            let rejectedChunks = 0;

            this.logger.log(`Starting translation loop for ${chunks.length} chunks`);

            // نمایش progress bar به صورت async
            this.showProgressBar(chunks.length).catch(error => {
                this.logger.error(`Error in progress bar: ${error}`);
            });

            for (let i = 0; i < chunks.length; i++) {
                if (this.translationCancelled) {
                    this.logger.log('Translation cancelled by user');
                    break;
                }

                const chunk = chunks[i];
                const chunkId = `chunk_${i + 1}`;

                this.logger.log(`Processing chunk ${chunkId} (${i + 1}/${chunks.length})`);

                try {
                    // به‌روزرسانی progress
                    this.updateProgress(i + 1, chunks.length, chunkId, totalTokens, acceptedChunks, rejectedChunks);

                    // ترجمه چانک
                    this.logger.log(`Translating chunk ${chunkId}...`);
                    const result = await this.translateChunk(chunk, lang, chunkId, i + 1, chunks.length);
                    this.logger.log(`Chunk ${chunkId} translated successfully`);
                    
                    // اعمال مستقیم در فایل موقت
                    this.logger.log(`Applying chunk ${chunkId} to temp file...`);
                    const applied = await this.applyChunkToFile(result);
                    
                    if (applied) {
                        acceptedChunks++;
                        totalTokens.inputTokens += result.tokensUsed.inputTokens;
                        totalTokens.outputTokens += result.tokensUsed.outputTokens;
                        this.logger.log(`Chunk ${chunkId} applied successfully`);
                    } else {
                        rejectedChunks++;
                        this.logger.log(`Chunk ${chunkId} rejected by user`);
                    }

                    // ذخیره نتیجه
                    results.push({
                        ...result,
                        applied
                    });

                    // کمی تاخیر برای نمایش بهتر
                    this.logger.log(`Waiting ${this.autoSaveInterval}ms before next chunk...`);
                    await this.delay(this.autoSaveInterval);

                } catch (error) {
                    this.logger.error(`Error translating chunk ${chunkId}: ${error}`);
                    vscode.window.showWarningMessage(`Error translating chunk ${chunkId}. Skipping to next chunk.`);
                }
            }

            this.logger.log(`Translation loop completed. Processed ${results.length} chunks.`);

            if (!this.translationCancelled && results.length > 0) {
                this.logger.log('Translation completed successfully, showing final summary...');
                
                // نمایش خلاصه نهایی
                await this.showFinalSummary(results, totalTokens, acceptedChunks, rejectedChunks);
                
                this.logger.log('Translation completed - use Accept All or Reject All buttons in status bar');
                
                // نمایش پیام نهایی بدون popup
                vscode.window.showInformationMessage(
                    `Translation completed! ${acceptedChunks} chunks processed. Use Accept All or Reject All buttons in status bar.`
                );
                
                // cleanup فقط وقتی کاربر تصمیم نهایی گرفت (با دکمه‌های Accept All/Reject All)
            } else if (this.translationCancelled) {
                this.logger.log('Translation was cancelled by user');
                vscode.window.showInformationMessage('Translation was cancelled by user.');
                this.cleanup(); // cleanup در صورت cancel
            } else {
                this.logger.log('No results to process');
                this.cleanup(); // cleanup در صورت عدم وجود نتیجه
            }

        } catch (error) {
            this.logger.error(`Error during streaming translation: ${error}`);
            vscode.window.showErrorMessage(`Translation failed: ${error}`);
        } finally {
            this.logger.log('Setting isTranslationActive to false');
            this.isTranslationActive = false;
            this.hideProgressBar();
            // hideStatusBar() را حذف کردیم تا دکمه‌های Accept All/Reject All باقی بمانند
            // cleanup() را بعد از askForFinalApply فراخوانی نمی‌کنیم
        }
    }

    private isValidTranslationFile(filePath: string): boolean {
        // بررسی اینکه فایل در مسیر output channel نیست
        if (filePath.includes('extension-output') || filePath.includes('i18n Nexus')) {
            return false;
        }

        // بررسی اینکه فایل JSON است
        if (!filePath.endsWith('.json')) {
            return false;
        }

        // بررسی اینکه فایل در workspace است
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
            return false;
        }

        // بررسی اینکه فایل وجود دارد و قابل خواندن است
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                JSON.parse(content); // بررسی اینکه JSON معتبر است
                return true;
            }
        } catch (error) {
            this.logger.error(`Invalid JSON file: ${filePath}`);
            return false;
        }

        return false;
    }

    private createTempFile(originalFilePath: string, initialContent: any): string {
        const tempDir = path.join(os.tmpdir(), 'i18n-nexus-streaming');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFileName = `streaming_${Date.now()}_${path.basename(originalFilePath)}`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        // نوشتن محتوای اولیه
        fs.writeFileSync(tempFilePath, JSON.stringify(initialContent, null, 2));
        
        this.logger.log(`Created temp file: ${tempFilePath}`);
        return tempFilePath;
    }

    private async applyChunkToFile(result: StreamingTranslationResult): Promise<boolean> {
        if (!this.tempFilePath) {
            this.logger.error('Temp file path not found');
            return false;
        }

        try {
            this.logger.log(`Reading current temp file: ${this.tempFilePath}`);
            
            // خواندن محتوای فعلی فایل موقت
            let currentContent: any = {};
            if (fs.existsSync(this.tempFilePath)) {
                currentContent = this.loadJsonFile(this.tempFilePath);
            }
            
            this.logger.log(`Current temp file has ${Object.keys(currentContent).length} keys`);
            
            // ادغام تغییرات
            const mergedContent = this.mergeContents(currentContent, {}, result.translatedContent);
            
            this.logger.log(`Merged content has ${Object.keys(mergedContent).length} keys`);
            
            // نوشتن به فایل موقت
            fs.writeFileSync(this.tempFilePath, JSON.stringify(mergedContent, null, 2));
            
            this.logger.log(`Successfully wrote chunk ${result.chunkId} to temp file`);
            
            // نمایش live diff و به‌روزرسانی فایل اصلی
            this.logger.log(`About to show live diff for chunk ${result.chunkId}...`);
            await this.showLiveDiffAndUpdate(mergedContent, result.chunkId);
            this.logger.log(`Live diff completed for chunk ${result.chunkId}`);
            
            return true;
        } catch (error) {
            this.logger.error(`Error applying chunk to file: ${error}`);
            return false;
        }
    }

    private async showLiveDiff(mergedContent: any): Promise<void> {
        try {
            this.logger.log('Starting showLiveDiff...');
            
            if (!this.originalFilePath) {
                this.logger.error('Original file path not found for live diff');
                return;
            }

            this.logger.log(`Original file path: ${this.originalFilePath}`);

            // خواندن فایل اصلی
            let originalContent: any = {};
            if (fs.existsSync(this.originalFilePath)) {
                originalContent = this.loadJsonFile(this.originalFilePath);
                this.logger.log(`Original content loaded with ${Object.keys(originalContent).length} keys`);
            } else {
                this.logger.log('Original file does not exist, using empty content');
            }

            this.logger.log(`Merged content has ${Object.keys(mergedContent).length} keys`);

            // باز کردن فایل اصلی در editor اگر باز نیست
            let editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
                this.logger.log('Opening original file in editor...');
                const document = await vscode.workspace.openTextDocument(this.originalFilePath);
                editor = await vscode.window.showTextDocument(document);
                this.logger.log('Original file opened in editor');
            }

            if (editor) {
                this.logger.log('Active editor found, showing realtime diff...');
                
                // نمایش diff به صورت visual
                await this.showLiveDiffAndUpdate(mergedContent, 'current');
                
                this.logger.log('Visual diff displayed');
            } else {
                this.logger.log('No active editor found for live diff');
            }

            this.logger.log('Live diff process completed');
        } catch (error) {
            this.logger.error(`Error showing live diff: ${error}`);
        }
    }

    private async showDiffViewWithControls(mergedContent: any, chunkId: string): Promise<void> {
        try {
            this.logger.log(`Showing diff view with controls for chunk ${chunkId}...`);
            
            // ایجاد فایل موقت برای diff
            const tempDiffPath = path.join(os.tmpdir(), `i18n-nexus-diff-${Date.now()}.json`);
            fs.writeFileSync(tempDiffPath, JSON.stringify(mergedContent, null, 2));
            
            const originalUri = vscode.Uri.file(this.originalFilePath!);
            const diffUri = vscode.Uri.file(tempDiffPath);
            
            // باز کردن diff view
            await vscode.commands.executeCommand('vscode.diff', originalUri, diffUri, `Live Translation Progress - ${chunkId}`);
            
            this.logger.log('Diff view opened');
            
            // نمایش دکمه‌های کنترل در diff view
            this.showControlButtonsInDiffView();
            
        } catch (error) {
            this.logger.error(`Error showing diff view with controls: ${error}`);
        }
    }







    private findKeyRange(document: vscode.TextDocument, key: string): vscode.Range | null {
        const text = document.getText();
        const keyParts = key.split('.');
        const lastKey = keyParts[keyParts.length - 1];
        
        this.logger.log(`Looking for key: ${key}, lastKey: ${lastKey}`);
        
        // جستجو برای کلید کامل
        let keyIndex = text.indexOf(`"${key}"`);
        if (keyIndex === -1) {
            // جستجو برای آخرین بخش کلید
            keyIndex = text.indexOf(`"${lastKey}"`);
            this.logger.log(`Full key not found, searching for lastKey: ${lastKey}, found at: ${keyIndex}`);
        } else {
            this.logger.log(`Full key found at: ${keyIndex}`);
        }
        
        if (keyIndex === -1) {
            this.logger.log(`Key not found in document: ${key}`);
            return null;
        }
        
        const startPos = document.positionAt(keyIndex);
        const endPos = document.positionAt(keyIndex + lastKey.length + 2);
        const range = new vscode.Range(startPos, endPos);
        
        this.logger.log(`Range created for key ${key}: ${startPos.line}:${startPos.character} to ${endPos.line}:${endPos.character}`);
        return range;
    }

    private async showLiveDiffAndUpdate(mergedContent: any, chunkId: string): Promise<void> {
        try {
            this.logger.log(`Starting showLiveDiffAndUpdate for ${chunkId}...`);
            
            if (!this.originalFilePath) {
                this.logger.error('Original file path not found');
                return;
            }

            // باز کردن فایل اصلی در editor
            let editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
                this.logger.log('Opening original file in editor...');
                const document = await vscode.workspace.openTextDocument(this.originalFilePath);
                editor = await vscode.window.showTextDocument(document);
                this.logger.log('Original file opened in editor');
            }

            if (editor) {
                // نمایش diff view با دکمه‌های Accept All و Cancel
                await this.showDiffViewWithControls(mergedContent, chunkId);
                
                // فقط نمایش notification (بدون تایید)
                vscode.window.showInformationMessage(
                    `Chunk ${chunkId} translated! Total keys: ${Object.keys(mergedContent).length}`
                );
            }
            
        } catch (error) {
            this.logger.error(`Error in showLiveDiffAndUpdate: ${error}`);
        }
    }

    private async showFinalSummary(
        results: StreamingTranslationResult[], 
        totalTokens: { inputTokens: number; outputTokens: number },
        acceptedChunks: number,
        rejectedChunks: number
    ): Promise<void> {
        const summary = `
Translation Summary:
- Total chunks: ${results.length}
- Accepted chunks: ${acceptedChunks}
- Rejected chunks: ${rejectedChunks}
- Total tokens used: Input: ${totalTokens.inputTokens}, Output: ${totalTokens.outputTokens}
        `.trim();

        this.outputChannel.appendLine(summary);
        
        // نمایش خلاصه به کاربر (بدون await)
        vscode.window.showInformationMessage(
            `🎉 Translation completed! Total keys processed: ${results.length}`
        );
        
        // نمایش دکمه Accept All در پایان عملیات
        this.showAcceptAllButtonAtEnd();
    }



    private async applyFinalChanges(): Promise<void> {
        this.logger.log(`Applying final changes...`);
        this.logger.log(`Temp file path: ${this.tempFilePath}`);
        this.logger.log(`Original file path: ${this.originalFilePath}`);

        if (!this.tempFilePath) {
            throw new Error('Temp file path not found');
        }

        if (!this.originalFilePath) {
            throw new Error('Original file path not found');
        }

        if (!fs.existsSync(this.tempFilePath)) {
            throw new Error(`Temp file does not exist: ${this.tempFilePath}`);
        }

        try {
            // کپی فایل موقت به فایل اصلی
            const tempContent = fs.readFileSync(this.tempFilePath, 'utf8');
            fs.writeFileSync(this.originalFilePath, tempContent);
            
            this.logger.log(`Final changes applied to ${this.originalFilePath}`);
        } catch (error) {
            this.logger.error(`Error applying final changes: ${error}`);
            throw error;
        }
    }

    private async updateProgress(
        currentChunk: number, 
        totalChunks: number, 
        chunkId: string,
        totalTokens: { inputTokens: number; outputTokens: number },
        acceptedChunks: number,
        rejectedChunks: number
    ): Promise<void> {
        const progress = Math.round((currentChunk / totalChunks) * 100);
        const message = `Translating ${chunkId} (${currentChunk}/${totalChunks}) - ${progress}% - Accepted: ${acceptedChunks}, Rejected: ${rejectedChunks}`;
        
        if (this.progressBar) {
            this.progressBar.report({ message, increment: 100 / totalChunks });
        }

        // به‌روزرسانی status bar
        if (this.statusBarItem) {
            this.statusBarItem.text = `$(sync~spin) ${progress}% (${acceptedChunks}/${rejectedChunks})`;
        }

        this.outputChannel.appendLine(message);
    }

    private async showProgressBar(totalChunks: number): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Streaming Translation...",
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.translationCancelled = true;
                this.logger.log('Translation cancelled via progress bar');
            });

            this.progressBar = progress;
            this.showStatusBar();

            // فقط progress bar را نمایش می‌دهیم و منتظر نمی‌مانیم
            // ترجمه در background ادامه می‌یابد
        });
    }

    private showStatusBar(): void {
        try {
            this.logger.log('Showing status bar...');
            
            if (!this.statusBarItem) {
                this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            }
            this.statusBarItem.text = "🔄 Streaming Translation...";
            this.statusBarItem.tooltip = "Translation in progress";
            this.statusBarItem.show();
            
            this.logger.log('Status bar shown');
        } catch (error) {
            this.logger.error(`Error showing status bar: ${error}`);
        }
    }

    private showControlButtonsInDiffView(): void {
        try {
            this.logger.log('Showing control buttons in diff view...');
            
            // دکمه Cancel (فقط وقتی ترجمه در حال انجام است)
            if (this.isTranslationActive) {
                const cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
                cancelItem.text = "🛑 Cancel Translation";
                cancelItem.tooltip = "Cancel the current translation process";
                cancelItem.command = 'i18n-nexus.cancelTranslation';
                cancelItem.show();
                
                // ذخیره reference برای cleanup
                this.cancelItem = cancelItem;
            }
            
            this.logger.log('Control buttons added to diff view');
        } catch (error) {
            this.logger.error(`Error showing control buttons in diff view: ${error}`);
        }
    }

    private showAcceptAllButtonAtEnd(): void {
        try {
            this.logger.log('Showing Accept All button at end...');
            
            // دکمه Accept All (در پایان عملیات)
            const acceptAllItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
            acceptAllItem.text = "✅ Accept All Changes";
            acceptAllItem.tooltip = "Apply all translated changes to the original file";
            acceptAllItem.command = 'i18n-nexus.acceptAllChanges';
            acceptAllItem.show();
            
            // ذخیره reference برای cleanup
            this.acceptAllItem = acceptAllItem;
            
            this.logger.log('Accept All button added at end');
        } catch (error) {
            this.logger.error(`Error showing Accept All button at end: ${error}`);
        }
    }

    private hideProgressBar(): void {
        this.progressBar = null;
    }

    private hideStatusBar(): void {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = null;
        }
        if (this.acceptAllItem) {
            this.acceptAllItem.dispose();
            this.acceptAllItem = null;
        }
        if (this.cancelItem) {
            this.cancelItem.dispose();
            this.cancelItem = null;
        }
    }

    private cleanup(): void {
        // پاک کردن فایل موقت
        if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
            try {
                fs.unlinkSync(this.tempFilePath);
                this.logger.log(`Cleaned up temp file: ${this.tempFilePath}`);
            } catch (error) {
                this.logger.error(`Error cleaning up temp file: ${error}`);
            }
        }

        // پاک کردن فایل‌های diff
        this.diffViewer.cleanup();

        this.tempFilePath = null;
        this.originalFilePath = null;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // متدهای کمکی از کلاس قبلی
    private async translateChunk(
        chunk: any, 
        lang: string, 
        chunkId: string, 
        chunkNumber: number, 
        totalChunks: number
    ): Promise<StreamingTranslationResult> {
        this.logger.log(`Translating chunk ${chunkId} (${chunkNumber}/${totalChunks})`);

        const startLine = (chunkNumber - 1) * this.chunkSize;
        const endLine = startLine + Object.keys(chunk).length;

        try {
            this.logger.log(`Calling LLM service for chunk ${chunkId}...`);
            const result = await this.llmService.translate(chunk, lang);
            this.logger.log(`LLM service returned result for chunk ${chunkId}`);

            return {
                chunkId,
                originalContent: chunk,
                translatedContent: result.translatedContent,
                tokensUsed: result.tokensUsed,
                startLine,
                endLine,
                applied: false
            };
        } catch (error) {
            this.logger.error(`Error in translateChunk for ${chunkId}: ${error}`);
            throw error;
        }
    }

    private splitIntoChunks(obj: any, chunkSize: number): any[] {
        const chunks: any[] = [];
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunk: any = {};
            const chunkKeys = keys.slice(i, i + chunkSize);
            
            for (const key of chunkKeys) {
                chunk[key] = obj[key];
            }
            
            chunks.push(chunk);
        }
        
        return chunks;
    }

    private loadJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            this.logger.error(`Error loading JSON file: ${filePath}`);
            throw error;
        }
    }

    private getOriginalBaseContent(filePath: string): any {
        try {
            const originalPath = `${filePath}.original`;
            if (fs.existsSync(originalPath)) {
                return this.loadJsonFile(originalPath);
            }
            return this.loadJsonFile(filePath);
        } catch (error) {
            this.logger.warn(`Could not get original content: ${error}`);
            return this.loadJsonFile(filePath);
        }
    }

    private prepareTranslationContent(baseContent: any, targetContent: any, originalBaseContent: any): any {
        const toTranslate: any = {};
        this.deepCompare(baseContent, targetContent, originalBaseContent, toTranslate);
        return toTranslate;
    }

    private deepCompare(base: any, target: any, original: any, result: any, currentPath: string = '') {
        for (const key in base) {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (typeof base[key] === 'object' && base[key] !== null) {
                if (!(key in target) || typeof target[key] !== 'object') {
                    result[newPath] = base[key];
                } else {
                    if (!(newPath in result)) { result[newPath] = {}; }
                    this.deepCompare(base[key], target[key], original[key] || {}, result[newPath], newPath);
                    if (Object.keys(result[newPath]).length === 0) { delete result[newPath]; }
                }
            } else {
                if (!(key in target) || target[key] === '' ||
                    (original && this.getNestedValue(original, newPath) !== base[key]) ||
                    (target[key] !== base[key])) {
                    result[newPath] = base[key];
                }
            }
        }

        for (const key in target) {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (!(key in base)) {
                result[newPath] = null;
            }
        }
    }

    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((o, i) => o ? o[i] : undefined, obj);
    }



    private mergeContents(baseContent: any, targetContent: any, translatedContent: any): any {
        const merged = JSON.parse(JSON.stringify(baseContent));

        for (const key in translatedContent) {
            if (translatedContent[key] === null) {
                this.deleteNestedProperty(merged, key);
            } else {
                this.setNestedProperty(merged, key, translatedContent[key]);
            }
        }

        return merged;
    }

    private setNestedProperty(obj: any, path: string, value: any) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
    }

    private deleteNestedProperty(obj: any, path: string) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in current)) {
                return;
            }
            current = current[keys[i]];
        }
        delete current[keys[keys.length - 1]];
    }

    public cancelTranslation(): void {
        this.logger.log('Translation cancelled by user');
        this.translationCancelled = true;
        this.isTranslationActive = false;
        
        // حذف دکمه Cancel
        if (this.cancelItem) {
            this.cancelItem.dispose();
            this.cancelItem = null;
        }
        
        // نمایش دکمه Accept All بعد از لغو
        this.showAcceptAllButtonAtEnd();
    }

    public isActive(): boolean {
        return this.isTranslationActive;
    }

    public acceptAllChanges(): void {
        try {
            this.logger.log('Accept all changes triggered');
            if (this.tempFilePath && this.originalFilePath) {
                // بررسی وجود فایل موقت
                if (fs.existsSync(this.tempFilePath)) {
                    // استفاده از applyFinalChanges برای اعمال تغییرات
                    this.applyFinalChanges().then(() => {
                        this.logger.log('All changes applied to original file');
                        vscode.window.showInformationMessage('✅ All changes applied to original file!');
                        
                        // حذف دکمه Accept All
                        if (this.acceptAllItem) {
                            this.acceptAllItem.dispose();
                            this.acceptAllItem = null;
                        }
                        
                        // cleanup
                        this.cleanup();
                    }).catch(error => {
                        this.logger.error(`Error applying final changes: ${error}`);
                        vscode.window.showErrorMessage(`Error applying changes: ${error}`);
                    });
                } else {
                    vscode.window.showErrorMessage('No temporary file found. Translation may not have started yet.');
                }
            } else {
                vscode.window.showErrorMessage('No changes to apply. Please start a translation first.');
            }
        } catch (error) {
            this.logger.error(`Error accepting all changes: ${error}`);
            vscode.window.showErrorMessage(`Error applying changes: ${error}`);
        }
    }


} 