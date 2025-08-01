import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMService } from './llmService';
import { Logger } from './logger';
import { ChunkDiffViewer, ChunkDiffResult } from './chunkDiffViewer';

interface ChunkTranslationResult {
    chunkId: string;
    originalContent: any;
    translatedContent: any;
    tokensUsed: { inputTokens: number; outputTokens: number };
    startLine: number;
    endLine: number;
}

interface TranslationProgress {
    currentChunk: number;
    totalChunks: number;
    currentChunkId: string;
    tokensUsed: { inputTokens: number; outputTokens: number };
}

export class ChunkedTranslationManager {
    private llmService: LLMService;
    private logger: Logger;
    private outputChannel: vscode.OutputChannel;
    private chunkSize: number; // تعداد کلیدها در هر چانک
    private isTranslationActive: boolean = false;
    private translationCancelled: boolean = false;
    private progressBar: vscode.Progress<{ message?: string; increment?: number }> | null = null;
    private statusBarItem: vscode.StatusBarItem | null = null;

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.llmService = new LLMService(logger, channel);
        this.logger = logger;
        this.outputChannel = channel;
        
        // دریافت تنظیمات
        const config = vscode.workspace.getConfiguration('i18nNexus');
        this.chunkSize = config.get<number>('chunkSize', 50);
    }

    public async translateLargeFile(fileUri: vscode.Uri): Promise<void> {
        if (this.isTranslationActive) {
            vscode.window.showWarningMessage('Translation is already in progress. Please wait for it to complete.');
            return;
        }

        this.isTranslationActive = true;
        this.translationCancelled = false;

        try {
            const filePath = fileUri.fsPath;
            this.logger.log(`Starting chunked translation for file: ${filePath}`);

            // دریافت تنظیمات
            const config = vscode.workspace.getConfiguration('i18nNexus');
            const basePath = config.get<string>('basePath');
            const baseLanguage = config.get<string>('baseLanguage');

            if (!basePath || !baseLanguage) {
                throw new Error('Base path or base language not configured.');
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

            // نمایش progress bar
            await this.showProgressBar(chunks.length);

            // شروع ترجمه چانک‌ها
            const results: ChunkTranslationResult[] = [];
            let totalTokens = { inputTokens: 0, outputTokens: 0 };

            for (let i = 0; i < chunks.length; i++) {
                if (this.translationCancelled) {
                    this.logger.log('Translation cancelled by user');
                    break;
                }

                const chunk = chunks[i];
                const chunkId = `chunk_${i + 1}`;

                try {
                    // ترجمه چانک
                    const result = await this.translateChunk(chunk, lang, chunkId, i + 1, chunks.length);
                    
                    // نمایش diff ناحیه‌ای و دریافت تصمیم کاربر
                    const accepted = await this.showChunkDiff(result, fileUri);
                    
                    if (accepted) {
                        results.push(result);
                        totalTokens.inputTokens += result.tokensUsed.inputTokens;
                        totalTokens.outputTokens += result.tokensUsed.outputTokens;
                        this.logger.log(`Chunk ${chunkId} accepted by user`);
                    } else {
                        this.logger.log(`Chunk ${chunkId} rejected by user`);
                    }

                } catch (error) {
                    this.logger.error(`Error translating chunk ${chunkId}: ${error}`);
                    vscode.window.showWarningMessage(`Error translating chunk ${chunkId}. Skipping to next chunk.`);
                }
            }

            if (!this.translationCancelled && results.length > 0) {
                // اعمال همه تغییرات
                await this.applyAllChanges(results, targetContent, filePath);
                vscode.window.showInformationMessage(`Translation completed. Total tokens used: Input: ${totalTokens.inputTokens}, Output: ${totalTokens.outputTokens}`);
            }

        } catch (error) {
            this.logger.error(`Error during chunked translation: ${error}`);
            vscode.window.showErrorMessage(`Translation failed: ${error}`);
        } finally {
            this.isTranslationActive = false;
            this.hideProgressBar();
            this.hideStatusBar();
            
            // پاک کردن فایل‌های موقت
            const diffViewer = ChunkDiffViewer.getInstance();
            diffViewer.cleanup();
        }
    }

    private async translateChunk(
        chunk: any, 
        lang: string, 
        chunkId: string, 
        chunkNumber: number, 
        totalChunks: number
    ): Promise<ChunkTranslationResult> {
        this.logger.log(`Translating chunk ${chunkId} (${chunkNumber}/${totalChunks})`);

        // محاسبه خطوط شروع و پایان
        const startLine = (chunkNumber - 1) * this.chunkSize;
        const endLine = startLine + Object.keys(chunk).length;

        const result = await this.llmService.translate(chunk, lang);

        return {
            chunkId,
            originalContent: chunk,
            translatedContent: result.translatedContent,
            tokensUsed: result.tokensUsed,
            startLine,
            endLine
        };
    }

    private async showChunkDiff(result: ChunkTranslationResult, fileUri: vscode.Uri): Promise<boolean> {
        const diffViewer = ChunkDiffViewer.getInstance();
        
        const diffResult: ChunkDiffResult = {
            chunkId: result.chunkId,
            originalContent: result.originalContent,
            translatedContent: result.translatedContent,
            startLine: result.startLine,
            endLine: result.endLine
        };

        return await diffViewer.showChunkDiff(diffResult, fileUri);
    }



    private async showProgressBar(totalChunks: number): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Translating large file...",
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.translationCancelled = true;
            });

            // اینجا progress را به‌روزرسانی می‌کنیم
            return new Promise<void>((resolve) => {
                this.progressBar = progress;
                resolve();
            });
        });
    }

    private hideProgressBar(): void {
        this.progressBar = null;
    }

    private showStatusBar(): void {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        }
        this.statusBarItem.text = "$(sync~spin) Translating...";
        this.statusBarItem.tooltip = "Click to cancel translation";
        this.statusBarItem.command = 'i18n-nexus.cancelTranslation';
        this.statusBarItem.show();
    }

    private hideStatusBar(): void {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = null;
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

    private async applyAllChanges(results: ChunkTranslationResult[], targetContent: any, filePath: string): Promise<void> {
        // ادغام همه تغییرات
        let mergedContent = { ...targetContent };
        
        for (const result of results) {
            mergedContent = this.mergeContents(mergedContent, {}, result.translatedContent);
        }

        // نمایش diff نهایی
        const confirmed = await this.previewFinalChanges(filePath, mergedContent, targetContent);
        
        if (confirmed) {
            fs.writeFileSync(filePath, JSON.stringify(mergedContent, null, 2));
            this.logger.log(`All changes applied to ${filePath}`);
        } else {
            this.logger.log('Final changes rejected by user');
        }
    }

    private async previewFinalChanges(filePath: string, newContent: any, originalContent: any): Promise<boolean> {
        const diffViewer = ChunkDiffViewer.getInstance();
        return await diffViewer.showFinalDiff(filePath, newContent, originalContent);
    }

    // متدهای کمکی از TranslationManager
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

    /**
     * تبدیل محتوای nested به ساختار flat اصلی
     */
    private flattenNestedContent(nestedContent: any, prefix: string = ''): any {
        const flattened: any = {};
        
        for (const key in nestedContent) {
            const value = nestedContent[key];
            const fullKey = prefix ? `${prefix}.${key}` : key;
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // اگر مقدار یک object است، آن را recursively flatten کنیم
                const subFlattened = this.flattenNestedContent(value, fullKey);
                Object.assign(flattened, subFlattened);
            } else {
                // اگر مقدار primitive است، کلید کامل را استفاده کنیم
                flattened[fullKey] = value;
            }
        }
        
        return flattened;
    }

    private mergeContents(baseContent: any, targetContent: any, translatedContent: any): any {
        const merged = JSON.parse(JSON.stringify(baseContent));

        // تبدیل translatedContent به flat structure برای پردازش آسان‌تر
        const flatTranslated = this.flattenNestedContent(translatedContent);

        for (const key in flatTranslated) {
            if (flatTranslated[key] === null) {
                // حذف کلید از ساختار nested
                this.deleteNestedProperty(merged, key);
            } else {
                // اضافه کردن یا به‌روزرسانی کلید در ساختار nested
                this.setNestedProperty(merged, key, flatTranslated[key]);
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
        this.translationCancelled = true;
        this.logger.log('Translation cancelled by user');
    }

    public isActive(): boolean {
        return this.isTranslationActive;
    }
} 