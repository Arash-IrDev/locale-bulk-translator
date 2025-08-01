import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMService } from './llmService';
import { Logger } from './logger';
import { execSync } from 'child_process';

interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

// Define diff result interface
interface DiffResult {
    added: Record<string, any>; // Added key-value pairs
    modified: Record<string, any>; // Modified key-value pairs
    deleted: string[]; // Deleted keys
}

export class TranslationManager {
    private llmService: LLMService;
    private logger: Logger;
    private outputChannel: vscode.OutputChannel;
    private totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    private pauseBetweenLanguages: number = 1000; // Default pause of 1 second between language translations

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.llmService = new LLMService(logger, channel);
        this.logger = logger;
        this.outputChannel = channel;
        this.logger.log('TranslationManager initialized');
        this.outputChannel.appendLine('i18n Nexus Translation Manager initialized');
    }

    // Main translation function
    public async translate() {
        this.logger.log('translate method called');
        this.outputChannel.appendLine('Starting translation process...');
        this.totalTokens = { inputTokens: 0, outputTokens: 0 };

        // Get configuration
        const config = vscode.workspace.getConfiguration('i18nNexus');
        const basePath = config.get<string>('basePath'); // Translation file path
        const baseLanguage = config.get<string>('baseLanguage'); // Base language
        const targetLanguagesConfig = config.get<Record<string, boolean>>('targetLanguages'); // Target language configuration
        const llmModel = config.get<string>('llmModel') || 'default'; // LLM model
        const providerName = config.get('llmProvider') || 'openai'; // LLM provider

        // Validate configuration
        if (!this.validateConfig(basePath, baseLanguage, targetLanguagesConfig)) {
            return;
        }

        // Ensure baseLanguage is not undefined
        if (!baseLanguage) {
            this.logger.error('Base language is not defined');
            this.outputChannel.appendLine('Error: Base language is not defined');
            vscode.window.showErrorMessage('Base language is not defined. Please check your settings.');
            return;
        }

        // Get enabled target languages
        const targetLanguages = Object.entries(targetLanguagesConfig!)
            .filter(([_, isEnabled]) => isEnabled)
            .map(([lang, _]) => lang);

        // Output translation information
        this.outputChannel.appendLine(`Base Language: ${baseLanguage}`);
        this.outputChannel.appendLine(`Target Languages: ${targetLanguages.join(', ')}`);
        this.outputChannel.appendLine(`LLM provider: ${providerName}`);
        this.outputChannel.appendLine(`LLM Model: ${llmModel}`);

        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.error('No workspace folder found');
            this.outputChannel.appendLine('Error: No workspace folder found');
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Get translation file path
        const messagesPath = path.join(workspaceFolders[0].uri.fsPath, basePath!);
        const baseFilePath = path.join(messagesPath, `${baseLanguage}.json`); // Base language file path

        // Check if base language file exists
        if (!fs.existsSync(baseFilePath)) {
            this.logger.error(`Base language file ${baseLanguage}.json not found`);
            this.outputChannel.appendLine(`Error: Base language file ${baseLanguage}.json not found`);
            vscode.window.showErrorMessage(`Base language file ${baseLanguage}.json not found`);
            return;
        }

        // Read base language file content
        let baseContent: any;
        try {
            baseContent = JSON.parse(fs.readFileSync(baseFilePath, 'utf8'));
            this.outputChannel.appendLine(`Base content loaded from ${baseFilePath}`);
        } catch (error) {
            this.logger.error(`Error reading base language file: ${error}`);
            this.outputChannel.appendLine(`Error reading base language file: ${error}`);
            vscode.window.showErrorMessage(`Error reading base language file: ${error}`);
            return;
        }

        // Iterate through target languages for translation
        for (const lang of targetLanguages) {
            if (lang !== baseLanguage) {
                this.outputChannel.appendLine(`\nTranslating to ${lang}...`);
                this.outputChannel.appendLine(`Base Language: ${baseLanguage}, Target Language: ${lang}, LLM provider: ${providerName}, LLM Model: ${llmModel}`);
                try {
                    // Translate single language
                    const tokensUsed = await this.translateLanguage(messagesPath, lang, baseContent, baseLanguage);
                    this.totalTokens.inputTokens += tokensUsed.inputTokens;
                    this.totalTokens.outputTokens += tokensUsed.outputTokens;
                    this.outputChannel.appendLine(`Tokens used for ${lang}: Input: ${tokensUsed.inputTokens}, Output: ${tokensUsed.outputTokens}`);

                    // Add pause between languages
                    if (this.pauseBetweenLanguages > 0) {
                        this.outputChannel.appendLine(`Pausing for ${this.pauseBetweenLanguages}ms before next language...`);
                        await this.pause(this.pauseBetweenLanguages);
                    }
                } catch (error) {
                    this.logger.error(`Error translating ${lang}: ${error}`);
                    this.outputChannel.appendLine(`Error translating ${lang}: ${error}`);
                    vscode.window.showWarningMessage(`Error translating ${lang}. Skipping to next language.`);
                    continue;
                }
            }
        }

        this.outputChannel.appendLine(`\nTranslation process completed. Total tokens used: Input: ${this.totalTokens.inputTokens}, Output: ${this.totalTokens.outputTokens}`);
        vscode.window.showInformationMessage(`Translation completed. Total tokens used: Input: ${this.totalTokens.inputTokens}, Output: ${this.totalTokens.outputTokens}`);
    }

    // Pause function
    private pause(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Validate configuration function
    private validateConfig(basePath?: string, baseLanguage?: string, targetLanguagesConfig?: Record<string, boolean>): boolean {
        if (!basePath || typeof basePath !== 'string') {
            this.logger.error('Invalid or missing basePath configuration');
            this.outputChannel.appendLine('Error: Invalid or missing basePath configuration');
            vscode.window.showErrorMessage('Invalid or missing basePath configuration. Please check your settings.');
            return false;
        }

        if (!baseLanguage || typeof baseLanguage !== 'string') {
            this.logger.error('Invalid or missing baseLanguage configuration');
            this.outputChannel.appendLine('Error: Invalid or missing baseLanguage configuration');
            vscode.window.showErrorMessage('Invalid or missing baseLanguage configuration. Please check your settings.');
            return false;
        }

        if (!targetLanguagesConfig || typeof targetLanguagesConfig !== 'object') {
            this.logger.error('Invalid or missing targetLanguages configuration');
            this.outputChannel.appendLine('Error: Invalid or missing targetLanguages configuration');
            vscode.window.showErrorMessage('Invalid or missing targetLanguages configuration. Please check your settings.');
            return false;
        }

        const enabledLanguages = Object.values(targetLanguagesConfig).filter(Boolean).length;
        if (enabledLanguages === 0) {
            this.logger.error('No target languages enabled');
            this.outputChannel.appendLine('Error: No target languages enabled');
            vscode.window.showErrorMessage('No target languages enabled. Please enable at least one target language in your settings.');
            return false;
        }

        return true;
    }

    // Get changes in base language file
    private getBaseChanges(messagesPath: string, baseLanguage: string): Record<string, any> {
        const baseFilePath = path.join(messagesPath, `${baseLanguage}.json`);
        const changes: Record<string, any> = {};

        try {
            // First check if it's in a Git repository
            const isGitRepo = this.isGitRepository(messagesPath);
            if (!isGitRepo) {
                this.logger.warn('Not a Git repository. Skipping base changes detection.');
                return changes;
            }

            // Use relative path
            const relativeFilePath = path.relative(process.cwd(), baseFilePath);

            // Execute Git command to get differences
            const gitDiff = execSync(`git diff HEAD~1 HEAD -- "${relativeFilePath}"`, {
                encoding: 'utf-8',
                cwd: messagesPath // Set working directory to messagesPath
            });

            const lines = gitDiff.split('\n');
            let currentKey = '';

            // Parse Git differences
            for (const line of lines) {
                if (line.startsWith('+') && line.includes(':')) {
                    const [key, value] = line.substring(1).split(':').map(s => s.trim());
                    currentKey = key.replace(/"/g, '');
                    if (value) {
                        changes[currentKey] = JSON.parse(value);
                    }
                } else if (line.startsWith('+') && currentKey) {
                    changes[currentKey] += line.substring(1);
                }
            }

            // Parse string values that might be JSON
            for (const key in changes) {
                if (typeof changes[key] === 'string') {
                    try {
                        changes[key] = JSON.parse(changes[key]);
                    } catch (e) {
                        // If not valid JSON, keep as string
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error getting base changes: ${error}`);
            // If an error occurs, return an empty changes object instead of throwing an exception
        }

        return changes;
    }

    // Check if it's a Git repository
    private isGitRepository(directory: string): boolean {
        try {
            execSync('git rev-parse --is-inside-work-tree', {
                cwd: directory,
                stdio: 'ignore'
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    // Translate single language
    private async translateLanguage(messagesPath: string, lang: string, baseContent: any, baseLanguage: string): Promise<TokenUsage> {
        this.logger.log(`translateLanguage method called for ${lang}`);
        this.outputChannel.appendLine(`Processing ${lang}...`);
    
        const targetFilePath = path.join(messagesPath, `${lang}.json`);
        let targetContent = {};
        let originalBaseContent = {};
    
        // Load target language file
        if (fs.existsSync(targetFilePath)) {
            targetContent = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
            this.outputChannel.appendLine(`Existing content loaded for ${lang}`);
        } else {
            this.outputChannel.appendLine(`No existing content found for ${lang}, starting fresh`);
        }
    
        // Load original base language file
        const originalBaseFilePath = path.join(messagesPath, `${baseLanguage}.json.original`);
        if (fs.existsSync(originalBaseFilePath)) {
            originalBaseContent = JSON.parse(fs.readFileSync(originalBaseFilePath, 'utf8'));
        } else {
            // If original file does not exist, use current base file as original
            originalBaseContent = baseContent;
            fs.writeFileSync(originalBaseFilePath, JSON.stringify(baseContent, null, 2));
        }
    
        // Get differences, including original base content
        const diff = this.getDiff(baseContent, targetContent, originalBaseContent);
        const baseChanges = this.getBaseChanges(messagesPath, baseLanguage);
    
        const toTranslate = { ...diff.added, ...diff.modified, ...baseChanges };
    
        if (Object.keys(toTranslate).length === 0) {
            this.outputChannel.appendLine(`No changes detected for ${lang}`);
            return { inputTokens: 0, outputTokens: 0 };
        }
    
        this.outputChannel.appendLine(`Translating ${Object.keys(toTranslate).length} keys...`);
    
        let newContent = targetContent;
        let tokensUsed = { inputTokens: 0, outputTokens: 0 };

        for await (const batchResult of this.llmService.translateGenerator(toTranslate, lang)) {
            newContent = this.mergeContents(newContent, batchResult.translatedContent, {});
            fs.writeFileSync(targetFilePath, JSON.stringify(newContent, null, 2));
            tokensUsed.inputTokens += batchResult.tokensUsed.inputTokens;
            tokensUsed.outputTokens += batchResult.tokensUsed.outputTokens;
        }

        newContent = this.mergeContents(newContent, {}, diff.deleted);
    
        // Validate translation result
        this.outputChannel.appendLine('Validating translation...');
        const { isValid, tokensUsed: validationTokens } = await this.llmService.validateTranslation(baseContent, newContent, lang);
        if (!isValid) {
            this.logger.warn(`Translation validation failed for ${lang}`);
            this.outputChannel.appendLine(`Warning: Translation validation failed for ${lang}. Please review the changes manually.`);
            vscode.window.showWarningMessage(`Translation validation failed for ${lang}. Please review the changes manually.`);
        } else {
            this.outputChannel.appendLine('Translation validation passed.');
        }
    
        // Preview diff and confirm
        const confirmed = await this.previewChanges(targetFilePath, newContent, targetContent);
        if (!confirmed) {
            this.outputChannel.appendLine(`Changes for ${lang} were cancelled by user.`);
            return {
                inputTokens: tokensUsed.inputTokens + validationTokens.inputTokens,
                outputTokens: tokensUsed.outputTokens + validationTokens.outputTokens
            };
        }

        // Write translated content to target language file
        fs.writeFileSync(targetFilePath, JSON.stringify(newContent, null, 2));
        this.outputChannel.appendLine(`Updated content written to ${targetFilePath}`);
    
        // Update original base file
        fs.writeFileSync(originalBaseFilePath, JSON.stringify(baseContent, null, 2));
    
        return {
            inputTokens: tokensUsed.inputTokens + validationTokens.inputTokens,
            outputTokens: tokensUsed.outputTokens + validationTokens.outputTokens
        };
    }

    // Get difference between two JSON objects
    private getDiff(baseContent: any, targetContent: any, originalBaseContent: any): DiffResult {
        const added: Record<string, any> = {};
        const modified: Record<string, any> = {};
        const deleted: string[] = [];
    
        // Recursive comparison
        this.diffRecursive(baseContent, targetContent, originalBaseContent, added, modified, deleted);
    
        this.logger.log(`Diff result: added=${Object.keys(added).length}, modified=${Object.keys(modified).length}, deleted=${deleted.length}`);
        return { added, modified, deleted };
    }
    
    private diffRecursive(base: any, target: any, originalBase: any, added: Record<string, any>, modified: Record<string, any>, deleted: string[], path: string = '') {
        // Iterate through base object
        for (const key in base) {
            const newPath = path ? `${path}.${key}` : key;
            if (!(key in target)) {
                // If key does not exist in target, add to added
                added[newPath] = base[key];
            } else if (typeof base[key] === 'object' && base[key] !== null) {
                // If it's an object, recursively compare
                this.diffRecursive(base[key], target[key], originalBase ? originalBase[key] : undefined, added, modified, deleted, newPath);
            } else if (base[key] !== target[key]) {
                // Only mark as modified if the value in the base language changes
                const originalValue = this.getNestedValue(originalBase, newPath);
                if (base[key] !== originalValue) {
                    modified[newPath] = base[key];
                }
            }
        }
    
        // Iterate through target object
        for (const key in target) {
            const newPath = path ? `${path}.${key}` : key;
            // If key does not exist in base, add to deleted
            if (!(key in base)) {
                deleted.push(newPath);
            }
        }
    }

    // Get original base content
    // Get original base content from Git
    private getOriginalBaseContent(filePath: string): any {
        try {
            // Get content of the previous version
            const gitCommand = `git show HEAD~1:"${path.relative(process.cwd(), filePath)}"`;
            const output = execSync(gitCommand, { encoding: 'utf-8' });
            return JSON.parse(output);
        } catch (error) {
            this.logger.warn(`Could not get original content from Git: ${error}`);
            // If Git history cannot be retrieved, return current file content
            return this.loadJsonFile(filePath);
        }
    }

    // Prepare translation content
    private prepareTranslationContent(baseContent: any, targetContent: any, originalBaseContent: any): any {
        const toTranslate: any = {};
        this.deepCompare(baseContent, targetContent, originalBaseContent, toTranslate);
        return toTranslate;
    }

    // Deep compare and prepare translation content
    private deepCompare(base: any, target: any, original: any, result: any, currentPath: string = '') {
        for (const key in base) {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (typeof base[key] === 'object' && base[key] !== null) {
                if (!(key in target) || typeof target[key] !== 'object') {
                    result[newPath] = base[key];
                } else {
                    if (!(newPath in result)) {result[newPath] = {};}
                    this.deepCompare(base[key], target[key], original[key] || {}, result[newPath], newPath);
                    if (Object.keys(result[newPath]).length === 0) {delete result[newPath];}
                }
            } else {
                if (!(key in target) || target[key] === '' || 
                    (original && this.getNestedValue(original, newPath) !== base[key]) ||
                    (target[key] !== base[key])) {
                    result[newPath] = base[key];
                }
            }
        }

        // Remove extra keys from target
        for (const key in target) {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (!(key in base)) {
                result[newPath] = null;  // Mark for deletion
            }
        }
    }
    
    // Helper method: Get nested object value
    // Get nested object value
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

    // Merge translated content and target language file content
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

    // Set nested property value
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

    // Delete nested property
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

    // Show diff view and ask user to confirm applying changes
    private async previewChanges(targetFilePath: string, newContent: any, originalContent: any): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('i18nNexus');
        const enableDiff = config.get<boolean>('enableDiffView', true);
        if (!enableDiff) {
            return true;
        }

        const tempNewPath = path.join(os.tmpdir(), `i18n-nexus-${Date.now()}-${path.basename(targetFilePath)}`);
        fs.writeFileSync(tempNewPath, JSON.stringify(newContent, null, 2));

        let oldUri: vscode.Uri;
        let tempOldPath: string | undefined;
        if (fs.existsSync(targetFilePath)) {
            oldUri = vscode.Uri.file(targetFilePath);
        } else {
            tempOldPath = path.join(os.tmpdir(), `i18n-nexus-old-${Date.now()}-${path.basename(targetFilePath)}`);
            fs.writeFileSync(tempOldPath, JSON.stringify(originalContent ?? {}, null, 2));
            oldUri = vscode.Uri.file(tempOldPath);
        }

        const newUri = vscode.Uri.file(tempNewPath);
        await vscode.commands.executeCommand('vscode.diff', oldUri, newUri, 'Preview Translation Changes');

        const choice = await vscode.window.showQuickPick(['Apply Changes', 'Cancel'], { placeHolder: 'Apply translation changes?' });

        fs.unlinkSync(tempNewPath);
        if (tempOldPath) {
            fs.unlinkSync(tempOldPath);
        }

        return choice === 'Apply Changes';
    }


    // Method to translate specific files
    // Modify translateFile method
    public async translateFile(fileUri: vscode.Uri) {
        const filePath = fileUri.fsPath;
        this.logger.log(`Translating file: ${filePath}`);

        const config = vscode.workspace.getConfiguration('i18nNexus');
        const basePath = config.get<string>('basePath');
        const baseLanguage = config.get<string>('baseLanguage');

        if (!basePath || !baseLanguage) {
            vscode.window.showErrorMessage('Base path or base language not configured.');
            return;
        }

        const workspaceRoot = vscode.workspace.rootPath || '';
        const fullBasePath = path.join(workspaceRoot, basePath);
        const fileName = path.basename(filePath);
        const lang = path.parse(fileName).name;

        if (lang === baseLanguage) {
            vscode.window.showInformationMessage('This is the base language file, no translation needed.');
            return;
        }

        const baseFilePath = path.join(fullBasePath, `${baseLanguage}.json`);
        const targetFilePath = filePath;

        if (!fs.existsSync(baseFilePath)) {
            vscode.window.showErrorMessage(`Base language file not found: ${baseFilePath}`);
            return;
        }

        try {
            const baseContent = this.loadJsonFile(baseFilePath);
            const targetContent = fs.existsSync(targetFilePath) ? this.loadJsonFile(targetFilePath) : {};
            const originalBaseContent = this.getOriginalBaseContent(baseFilePath);

            const toTranslate = this.prepareTranslationContent(baseContent, targetContent, originalBaseContent);

            if (Object.keys(toTranslate).length === 0) {
                vscode.window.showInformationMessage('No changes detected, no translation needed.');
                return;
            }

            const { translatedContent, tokensUsed } = await this.llmService.translate(toTranslate, lang);

            const newContent = this.mergeContents(baseContent, targetContent, translatedContent);

            const confirmed = await this.previewChanges(targetFilePath, newContent, targetContent);
            if (!confirmed) {
                vscode.window.showInformationMessage(`Translation for ${lang} cancelled`);
                return;
            }

            fs.writeFileSync(targetFilePath, JSON.stringify(newContent, null, 2));
            vscode.window.showInformationMessage(`Translation for ${lang} completed`);

            this.totalTokens.inputTokens += tokensUsed.inputTokens;
            this.totalTokens.outputTokens += tokensUsed.outputTokens;
        } catch (error) {
            this.logger.error(`Error during translation: ${error}`);
            vscode.window.showErrorMessage(`Translation failed: ${error}`);
        }
    }

    
   

    // Method to load JSON files
    private loadJsonFile(filePath: string): any {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            this.logger.error(`Error loading JSON file: ${filePath}`);
            throw error;
        }
    }
}