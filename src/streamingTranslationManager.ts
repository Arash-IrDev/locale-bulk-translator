import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMService } from './llmService';
import { Logger } from './logger';
import { ChunkDiffViewer, ChunkDiffResult } from './chunkDiffViewer';
import { getProviderConfig } from './provider-config';

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
    private progressBarResolve: (() => void) | null = null;
    private diffViewer: ChunkDiffViewer;
    private allChangesFlat: Record<string, string | null> = {};
    private diffTempFiles: string[] = [];

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.llmService = new LLMService(logger, channel);
        this.logger = logger;
        this.outputChannel = channel;
        this.diffViewer = ChunkDiffViewer.getInstance();
        
        // Get configuration
        const config = vscode.workspace.getConfiguration('i18nNexus');
        this.chunkSize = config.get<number>('chunkSize', 3000); // Maximum 3000 characters per chunk for gpt-4o-mini
        this.autoSaveInterval = config.get<number>('autoSaveInterval', 100);
    }

    /**
     * Structured logging for translation process - focuses on the three key structures
     */
    private logTranslationStructures(chunkId: string, inputToLLM: any, llmResponse: any, finalStructure: any): void {
        const separator = '='.repeat(80);
        const sectionSeparator = '-'.repeat(60);
        
        this.logger.log(separator);
        this.logger.log(`🔄 TRANSLATION STRUCTURES FOR ${chunkId.toUpperCase()}`);
        this.logger.log(separator);
        
        // 1. Input to LLM
        this.logger.log(`📤 INPUT TO LLM (${Object.keys(inputToLLM).length} keys):`);
        this.logger.log(sectionSeparator);
        this.logger.log(JSON.stringify(inputToLLM, null, 2));
        this.logger.log('');
        
        // 2. LLM Response
        this.logger.log(`📥 LLM RESPONSE (${Object.keys(llmResponse).length} keys):`);
        this.logger.log(sectionSeparator);
        this.logger.log(JSON.stringify(llmResponse, null, 2));
        this.logger.log('');
        
        // 3. Final Extracted Structure (for diff file) - only if provided
        this.logger.log(`📋 FINAL EXTRACTED STRUCTURE (${Object.keys(finalStructure).length} keys):`);
        this.logger.log(sectionSeparator);
        this.logger.log(JSON.stringify(finalStructure, null, 2));
        this.logger.log('');
        
        // Summary comparison
        this.logger.log(`📊 STRUCTURE COMPARISON SUMMARY:`);
        this.logger.log(sectionSeparator);
        this.logger.log(`Input keys: ${Object.keys(inputToLLM).join(', ')}`);
        this.logger.log(`Response keys: ${Object.keys(llmResponse).join(', ')}`);
        this.logger.log(`Final keys: ${Object.keys(finalStructure).join(', ')}`);

        this.logger.log(separator);
        this.logger.log('');
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
            this.logger.log(`🚀 Starting streaming translation for file: ${filePath}`);

            // Check if file is valid
            if (!this.isValidTranslationFile(filePath)) {
                vscode.window.showErrorMessage('This file cannot be translated. Please select a valid translation JSON file.');
                return;
            }

            // Get configuration
            const config = vscode.workspace.getConfiguration('i18nNexus');
            const basePath = config.get<string>('basePath');
            const baseLanguage = config.get<string>('baseLanguage');
            const llmProvider = config.get<string>('llmProvider');
            const llmApiKey = config.get<string>('llmApiKey');

            // this.logger.log(`Configuration: basePath=${basePath}, baseLanguage=${baseLanguage}, llmProvider=${llmProvider}, hasApiKey=${!!llmApiKey}`);

            if (!basePath || !baseLanguage) {
                throw new Error('Base path or base language not configured.');
            }

            if (!llmProvider) {
                throw new Error('LLM provider not configured.');
            }

            // Check API key only for providers that require it
            const providerConfig = getProviderConfig(llmProvider);
            if (providerConfig && providerConfig.requiresApiKey && !llmApiKey) {
                throw new Error('API key not configured for this provider.');
            }

            // Detect file language
            const fileName = path.basename(filePath);
            const lang = path.parse(fileName).name;

            if (lang === baseLanguage) {
                vscode.window.showInformationMessage('This is the base language file, no translation needed.');
                return;
            }

            // Read files
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const fullBasePath = path.join(workspaceRoot, basePath);
            const baseFilePath = path.join(fullBasePath, `${baseLanguage}.json`);

            if (!fs.existsSync(baseFilePath)) {
                throw new Error(`Base language file not found: ${baseFilePath}`);
            }

            const baseContent = this.loadJsonFile(baseFilePath);
            const targetContent = fs.existsSync(filePath) ? this.loadJsonFile(filePath) : {};
            const originalBaseContent = this.getOriginalBaseContent(baseFilePath);

            // Prepare translation content
            const toTranslate = this.prepareTranslationContent(baseContent, targetContent, originalBaseContent);

            if (Object.keys(toTranslate).length === 0) {
                vscode.window.showInformationMessage('No changes detected, no translation needed.');
                return;
            }

            // Split into chunks
            const chunks = this.splitIntoChunks(toTranslate, this.chunkSize);
            this.logger.log(`📦 Split content into ${chunks.length} chunks from ${Object.keys(toTranslate).length} total keys`);

            // Create temporary file for translation
            this.tempFilePath = this.createTempFile(filePath, targetContent);
            this.allChangesFlat = this.flattenNestedContent(targetContent);

            // Start streaming translation
            const results: StreamingTranslationResult[] = [];
            let totalTokens = { inputTokens: 0, outputTokens: 0 };
            let acceptedChunks = 0;
            let rejectedChunks = 0;

            this.logger.log(`🚀 Starting translation loop for ${chunks.length} chunks`);

            // Show progress bar asynchronously
            this.showProgressBar(chunks.length).catch(error => {
                this.logger.error(`Error in progress bar: ${error}`);
            });

            for (let i = 0; i < chunks.length; i++) {
                if (this.translationCancelled) {
                    this.logger.log('❌ Translation cancelled by user');
                    break;
                }

                const chunk = chunks[i];
                const chunkId = `chunk_${i + 1}`;

                this.logger.log(`🔄 Processing chunk ${chunkId} (${i + 1}/${chunks.length})`);

                try {
                    // Update progress
                    this.updateProgress(i + 1, chunks.length, chunkId, totalTokens, acceptedChunks, rejectedChunks);

                    // Translate chunk
                    // this.logger.log(`Translating chunk ${chunkId}...`);
                    const result = await this.translateChunk(chunk, lang, chunkId, i + 1, chunks.length);
                    // this.logger.log(`Chunk ${chunkId} translated successfully`);
                    
                    // Apply directly to temporary file
                    // this.logger.log(`Applying chunk ${chunkId} to temp file...`);
                    const applied = await this.applyChunkToFile(result);
                    
                    if (applied) {
                        acceptedChunks++;
                        totalTokens.inputTokens += result.tokensUsed.inputTokens;
                        totalTokens.outputTokens += result.tokensUsed.outputTokens;
                        this.logger.log(`✅ Chunk ${chunkId} applied successfully`);
                    } else {
                        rejectedChunks++;
                        this.logger.log(`❌ Chunk ${chunkId} rejected by user`);
                    }

                    // Save result
                    results.push({
                        ...result,
                        applied
                    });

                    // Small delay for better display
                    // this.logger.log(`Waiting ${this.autoSaveInterval}ms before next chunk...`);
                    await this.delay(this.autoSaveInterval);

                } catch (error) {
                    this.logger.error(`Error translating chunk ${chunkId}: ${error}`);
                    vscode.window.showWarningMessage(`Error translating chunk ${chunkId}. Skipping to next chunk.`);
                }
            }

            // this.logger.log(`Translation loop completed. Processed ${results.length} chunks.`);

            if (!this.translationCancelled && results.length > 0) {
                this.logger.log(`🎉 Translation loop completed. Processed ${results.length} chunks, ${acceptedChunks} accepted, ${rejectedChunks} rejected.`);
                
                if (acceptedChunks > 0) {
                    this.logger.log('✅ Translation completed successfully, showing final summary...');
                    
                    // Show final summary
                    await this.showFinalSummary(results, totalTokens, acceptedChunks, rejectedChunks);
                    
                    this.logger.log('🎯 Translation completed - use Accept All or Reject All buttons in status bar');
                    
                    // Show final message without popup
                    vscode.window.showInformationMessage(
                        `Translation completed! ${acceptedChunks} chunks processed successfully, ${rejectedChunks} failed. Use Accept All or Reject All buttons in status bar.`
                    );
                } else {
                    this.logger.log('❌ No chunks were successfully translated');
                    vscode.window.showWarningMessage(
                        `Translation failed! All ${results.length} chunks failed to translate. Please check the logs for details.`
                    );
                    this.cleanup();
                }
                
                // cleanup only when user makes final decision (with Accept All/Reject All buttons)
            } else if (this.translationCancelled) {
                this.logger.log('❌ Translation was cancelled by user');
                vscode.window.showInformationMessage('Translation was cancelled by user.');
                this.cleanup(); // cleanup in case of cancel
            } else {
                this.logger.log('❌ No results to process');
                this.cleanup(); // cleanup in case of no results
            }

        } catch (error) {
            this.logger.error(`Error during streaming translation: ${error}`);
            vscode.window.showErrorMessage(`Translation failed: ${error}`);
        } finally {
            // this.logger.log('Setting isTranslationActive to false');
            this.isTranslationActive = false;
            this.hideProgressBar();
            // hideStatusBar() was removed to keep Accept All/Reject All buttons
            // cleanup() is not called after askForFinalApply
        }
    }

    private isValidTranslationFile(filePath: string): boolean {
        // Check that file is not in output channel path
        if (filePath.includes('extension-output') || filePath.includes('i18n Nexus')) {
            return false;
        }

        // Check that file is JSON
        if (!filePath.endsWith('.json')) {
            return false;
        }

        // Check that file is in workspace
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
            return false;
        }

        // Check that file exists and is readable
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                JSON.parse(content); // Check that JSON is valid
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
        
        // Write initial content
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
            // Check validity of translated content
            if (!result.translatedContent ||
                typeof result.translatedContent !== 'object' ||
                Object.keys(result.translatedContent).length === 0) {
                this.logger.warn(`Chunk ${result.chunkId} has invalid or empty translated content`);
                return false;
            }

            // Reconstruct original structure and remove duplicate prefixes
            const normalizedChunk = this.convertLLMResponseToOriginalStructureNew(
                result.translatedContent,
                result.originalContent
            );

            // Convert final result to flat structure
            const flatTranslated = this.flattenNestedContent(normalizedChunk);

            // Merge new changes with overall state
            this.allChangesFlat = {
                ...this.allChangesFlat,
                ...flatTranslated
            };

            // Reconstruct complete content from flat state
            const mergedContent = this.unflattenContent(this.allChangesFlat);

            // Write to complete temporary file
            fs.writeFileSync(this.tempFilePath, JSON.stringify(mergedContent, null, 2));

            // this.logger.log(`Successfully wrote chunk ${result.chunkId} to temp file`);

            // Show cumulative diff view
            // this.logger.log(`About to show diff view for chunk ${result.chunkId}...`);
            this.showDiffViewWithControls(mergedContent, result.chunkId).catch(error => {
                this.logger.error(`Error showing diff view for chunk ${result.chunkId}: ${error}`);
            });
            // this.logger.log(`Diff view initiated for chunk ${result.chunkId}`);

            return true;
        } catch (error) {
            this.logger.error(`Error applying chunk to file: ${error}`);
            return false;
        }
    }

    private async showLiveDiff(mergedContent: any): Promise<void> {
        try {
            // this.logger.log('Starting showLiveDiff...');
            
            if (!this.originalFilePath) {
                this.logger.error('Original file path not found for live diff');
                return;
            }

            // this.logger.log(`Original file path: ${this.originalFilePath}`);

            // Read original file
            let originalContent: any = {};
            if (fs.existsSync(this.originalFilePath)) {
                originalContent = this.loadJsonFile(this.originalFilePath);
                // this.logger.log(`Original content loaded with ${Object.keys(originalContent).length} keys`);
            } else {
                // this.logger.log('Original file does not exist, using empty content');
            }

            // this.logger.log(`Merged content has ${Object.keys(mergedContent).length} keys`);

            // Open original file in editor if not already open
            let editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
                // this.logger.log('Opening original file in editor...');
                const document = await vscode.workspace.openTextDocument(this.originalFilePath);
                editor = await vscode.window.showTextDocument(document);
                // this.logger.log('Original file opened in editor');
            }

            if (editor) {
                // this.logger.log('Active editor found, showing realtime diff...');
                
                // Show diff visually
                await this.showLiveDiffAndUpdate(mergedContent, 'current');
                
                // this.logger.log('Visual diff displayed');
            } else {
                // this.logger.log('No active editor found for live diff');
            }

            // this.logger.log('Live diff process completed');
        } catch (error) {
            this.logger.error(`Error showing live diff: ${error}`);
        }
    }

    private async showDiffViewWithControls(mergedContent: any, chunkId: string): Promise<void> {
        try {
            this.logger.log(`=== Showing diff view for chunk ${chunkId} ===`);

            if (!this.originalFilePath) {
                this.logger.error('Original file path not found for diff view');
                return;
            }

            // Create temporary file for diff that includes all changes up to this point
            const tempDiffPath = path.join(os.tmpdir(), `i18n-nexus-diff-${chunkId}.json`);
            fs.writeFileSync(tempDiffPath, JSON.stringify(mergedContent, null, 2));
            this.diffTempFiles.push(tempDiffPath);

            const originalUri = vscode.Uri.file(this.originalFilePath);
            const diffUri = vscode.Uri.file(tempDiffPath);

            this.logger.log(`Original URI: ${originalUri.fsPath}`);
            this.logger.log(`Diff URI: ${diffUri.fsPath}`);

            // Show control buttons in status bar (before opening diff view)
            this.showControlButtonsInStatusBar();

            // Small delay to ensure new diff view opens
            await this.delay(50);

            // Open new diff view
            try {
                await vscode.commands.executeCommand('vscode.diff', originalUri, diffUri, `Live Translation Progress - ${chunkId}`);
                this.logger.log('Diff view opened successfully');
            } catch (diffError) {
                this.logger.error(`Error opening diff view: ${diffError}`);
                // If diff view doesn't open, at least show notification
                vscode.window.showInformationMessage(
                    `Chunk ${chunkId} translated! Total keys: ${Object.keys(mergedContent).length}`
                );
            }

            this.logger.log(`=== Finished showing diff view for chunk ${chunkId} ===`);

        } catch (error) {
            this.logger.error(`Error showing diff view with controls: ${error}`);
        }
    }







    private findKeyRange(document: vscode.TextDocument, key: string): vscode.Range | null {
        const text = document.getText();
        const keyParts = key.split('.');
        const lastKey = keyParts[keyParts.length - 1];
        
        this.logger.log(`Looking for key: ${key}, lastKey: ${lastKey}`);
        
        // Search for complete key
        let keyIndex = text.indexOf(`"${key}"`);
        if (keyIndex === -1) {
            // Search for last part of key
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

            // Open original file in editor
            let editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
                this.logger.log('Opening original file in editor...');
                const document = await vscode.workspace.openTextDocument(this.originalFilePath);
                editor = await vscode.window.showTextDocument(document);
                this.logger.log('Original file opened in editor');
            }

            if (editor) {
                // Show diff view with Accept All and Cancel buttons
                // Use mergedContent instead of translatedChanges (this function is used for overall display)
                await this.showDiffViewWithControls(mergedContent, chunkId);
                
                // Only show notification (without confirmation)
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
        
        // Close progress bar
        if (this.progressBarResolve) {
            this.progressBarResolve();
            this.progressBarResolve = null;
        }
        
        // Show summary to user (without await)
        vscode.window.showInformationMessage(
            `🎉 Translation completed! Total keys processed: ${results.length}`
        );
        
        // Show Accept All button at end of operation
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
            // Copy temporary file to original file
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
        
        // Update progress bar
        if (this.progressBar) {
            this.progressBar.report({ 
                message, 
                increment: 0 // Set increment to 0 so the progress bar works correctly
            });
        }

        // Update status bar
        if (this.statusBarItem) {
            this.statusBarItem.text = `🔄 ${progress}% (${currentChunk}/${totalChunks})`;
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

            // Wait until translation is finished
            return new Promise<void>((resolve) => {
                // This promise will be resolved at the end of translation
                this.progressBarResolve = resolve;
            });
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

    private showControlButtonsInStatusBar(): void {
        try {
            this.logger.log('Showing control buttons in status bar...');
            
            // Cancel button (only when translation is in progress)
            if (this.isTranslationActive) {
                const cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
                cancelItem.text = "🛑 Cancel Translation";
                cancelItem.tooltip = "Cancel the current translation process";
                cancelItem.command = 'i18n-nexus.cancelTranslation';
                cancelItem.show();
                
                // Save reference for cleanup
                this.cancelItem = cancelItem;
            }
            
            this.logger.log('Control buttons added to status bar');
        } catch (error) {
            this.logger.error(`Error showing control buttons in status bar: ${error}`);
        }
    }

    private showAcceptAllButtonAtEnd(): void {
        try {
            this.logger.log('Showing Accept All button at end...');
            
            // Accept All button (at the end of the operation)
            const acceptAllItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
            acceptAllItem.text = "✅ Accept All Changes";
            acceptAllItem.tooltip = "Apply all translated changes to the original file";
            acceptAllItem.command = 'i18n-nexus.acceptAllChanges';
            acceptAllItem.show();
            
            // Save reference for cleanup
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
        // Clean up temporary file
        if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
            try {
                fs.unlinkSync(this.tempFilePath);
                this.logger.log(`Cleaned up temp file: ${this.tempFilePath}`);
            } catch (error) {
                this.logger.error(`Error cleaning up temp file: ${error}`);
            }
        }

        // Clean up diff files
        for (const diffPath of this.diffTempFiles) {
            try {
                if (fs.existsSync(diffPath)) {
                    fs.unlinkSync(diffPath);
                }
            } catch (error) {
                this.logger.error(`Error cleaning diff file ${diffPath}: ${error}`);
            }
        }
        this.diffTempFiles = [];
        this.diffViewer.cleanup();

        this.tempFilePath = null;
        this.originalFilePath = null;
        this.allChangesFlat = {};
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Helper methods from previous class
    private async translateChunk(
        chunk: any, 
        lang: string, 
        chunkId: string, 
        chunkNumber: number, 
        totalChunks: number
    ): Promise<StreamingTranslationResult> {
        // this.logger.log(`Translating chunk ${chunkId} (${chunkNumber}/${totalChunks})`);
        // this.logger.log(`Chunk ${chunkId} structure: ${Object.keys(chunk).length} keys`);
        // this.logger.log(`Chunk ${chunkId} sample keys: ${Object.keys(chunk).slice(0, 3).join(', ')}`);
        // this.logger.log(`Chunk ${chunkId} sample values: ${Object.values(chunk).slice(0, 2).map(v => typeof v === 'string' ? v.substring(0, 50) : typeof v)}`);

        const startLine = (chunkNumber - 1) * this.chunkSize;
        const endLine = startLine + Object.keys(chunk).length;

        try {
            // this.logger.log(`Calling LLM service for chunk ${chunkId}...`);
            const result = await this.llmService.translate(chunk, lang);
            // this.logger.log(`LLM service returned result for chunk ${chunkId}`);
            // this.logger.log(`Chunk ${chunkId} translated structure: ${Object.keys(result.translatedContent).length} keys`);
            // this.logger.log(`Chunk ${chunkId} translated sample: ${Object.keys(result.translatedContent).slice(0, 2).join(', ')}`);

            // Reconstruct original structure and remove duplicate prefixes
            const normalizedChunk = this.convertLLMResponseToOriginalStructureNew(
                result.translatedContent,
                chunk
            );

            // Convert final result to flat structure
            const flatTranslated = this.flattenNestedContent(normalizedChunk);

            // Log the three key structures for comparison
            this.logTranslationStructures(chunkId, chunk, result.translatedContent, normalizedChunk);

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
            this.logger.error(`Chunk ${chunkId} content that failed: ${JSON.stringify(chunk, null, 2).substring(0, 500)}...`);
            throw error;
        }
    }

    private splitIntoChunks(obj: any, chunkSize: number): any[] {
        const chunks: any[] = [];
        const keys = Object.keys(obj);
        
        // this.logger.log(`Splitting ${keys.length} keys into character-based chunks (max ${chunkSize} chars per chunk)`);
        
        let currentChunk: any = {};
        let currentChunkSize = 0;
        const maxChunkSize = chunkSize; // This is now the number of characters, not the number of keys
        
        for (const key of keys) {
            const keyValue = { [key]: obj[key] };
            const keyValueStr = JSON.stringify(keyValue, null, 2);
            const keyValueSize = keyValueStr.length;
            
            // If adding this key would cause the chunk to grow
            if (currentChunkSize + keyValueSize > maxChunkSize && Object.keys(currentChunk).length > 0) {
                // Save current chunk
                const chunkStr = JSON.stringify(currentChunk, null, 2);
                // this.logger.log(`Chunk ${chunks.length + 1} created: ${chunkStr.length} chars, ${Object.keys(currentChunk).length} keys`);
                chunks.push({ ...currentChunk });
                
                // Start new chunk
                currentChunk = { [key]: obj[key] };
                currentChunkSize = keyValueSize;
            } else {
                // Add to current chunk
                currentChunk[key] = obj[key];
                currentChunkSize += keyValueSize;
            }
        }
        
        // Add final chunk
        if (Object.keys(currentChunk).length > 0) {
            const chunkStr = JSON.stringify(currentChunk, null, 2);
            // this.logger.log(`Final chunk ${chunks.length + 1} created: ${chunkStr.length} chars, ${Object.keys(currentChunk).length} keys`);
            chunks.push(currentChunk);
        }
        
        // this.logger.log(`Created ${chunks.length} chunks total`);
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



    /**
     * Recursively flatten a nested object into a map of dot-notation keys.
     *
     * e.g. { a: { b: 1 }, c: 2 }
     *      → { "a.b":  1, "c": 2 }
     */
    private flattenNestedContent(obj: any, parentKey = ""): Record<string, any> {
        const out: Record<string, any> = {};
        for (const key of Object.keys(obj)) {
        const val = obj[key];
        const dotted = parentKey ? `${parentKey}.${key}` : key;
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            Object.assign(out, this.flattenNestedContent(val, dotted));
        } else {
            out[dotted] = val;
        }
        }
        return out;
    }
    
    /**
     * Rebuild a nested object from a map of dot-notation keys.
     *
     * e.g. { "a.b": 1, "c": 2 }
     *      → { a: { b: 1 }, c: 2 }
     */
    private unflattenContent(flat: Record<string, any>): any {
        const result: any = {};
        for (const dotted of Object.keys(flat)) {
        const parts = dotted.split(".");
        let cursor = result;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in cursor) || typeof cursor[part] !== "object") {
            cursor[part] = {};
            }
            cursor = cursor[part];
        }
        cursor[parts[parts.length - 1]] = flat[dotted];
        }
        return result;
    }
    
    /**
     * Invert the LLM’s grouping/flattening so that:
     * 
     * 1. We take the LLM response, which is shaped like
     *    {
     *      [rootKey]: {
     *        `${rootKey}.${subKey}`: {
     *          `${rootKey}.${subKey}.${leafPath}`: translatedValue,
     *          …
     *        },
     *        …
     *      }
     *    }
     * 
     * 2. We rebuild:
     *    {
     *      [rootKey]: {
     *        [subKey]: {
     *          [leafPath]: translatedValue,
     *          …
     *        },
     *        …
     *      }
     *    }
     */
    private convertLLMResponseToOriginalStructureNew(
        llmResponse: Record<string, any>,
        originalChunk: Record<string, any>
    ): Record<string, any> {
        const result: Record<string, any> = {};
    
        // For each top-level key we sent (e.g. "access-control")
        for (const rootKey of Object.keys(originalChunk)) {
        const grouped = llmResponse[rootKey];
        if (!grouped || typeof grouped !== "object") {
            // If LLM gave us nothing, fall back to the original
            result[rootKey] = originalChunk[rootKey];
            continue;
        }
    
        // Prepare an object to hold the reconstructed subtree
        const reconstructed: Record<string, any> = {};
    
        // Each groupingKey looks like "access-control.add-permission"
        for (const groupingKey of Object.keys(grouped)) {
            const groupValue = grouped[groupingKey];
            if (!groupValue || typeof groupValue !== "object") {
            continue;
            }
    
            // 1) Flatten this group’s nested object to dot-notation keys
            const flatGroup = this.flattenNestedContent(groupValue);
    
            // 2) Strip exactly the groupingKey + "." prefix from each flat key
            const cleanedFlat: Record<string, any> = {};
            const prefix = groupingKey + ".";
            for (const flatKey of Object.keys(flatGroup)) {
            if (flatKey.startsWith(prefix)) {
                const stripped = flatKey.substring(prefix.length);
                cleanedFlat[stripped] = flatGroup[flatKey];
            }
            }
    
            // 3) Rebuild a nested object from the cleaned map
            const rebuilt = this.unflattenContent(cleanedFlat);
    
            // 4) Derive the true property name (the part after rootKey + ".")
            const subKey = groupingKey.slice(rootKey.length + 1);
    
            // 5) Assign into our final shape
            reconstructed[subKey] = rebuilt;
        }
    
        result[rootKey] = reconstructed;
        }
    
        return result;
    }

    public cancelTranslation(): void {
        this.logger.log('Translation cancelled by user');
        this.translationCancelled = true;
        this.isTranslationActive = false;
        
        // Close progress bar
        if (this.progressBarResolve) {
            this.progressBarResolve();
            this.progressBarResolve = null;
        }
        
        // Delete Cancel button
        if (this.cancelItem) {
            this.cancelItem.dispose();
            this.cancelItem = null;
        }
        
        // Show Accept All button after cancellation
        this.showAcceptAllButtonAtEnd();
    }

    public isActive(): boolean {
        return this.isTranslationActive;
    }

    public acceptAllChanges(): void {
        try {
            this.logger.log('Accept all changes triggered');
            if (this.tempFilePath && this.originalFilePath) {
                // Check if temporary file exists
                if (fs.existsSync(this.tempFilePath)) {
                    // Use applyFinalChanges to apply changes
                    this.applyFinalChanges().then(() => {
                        this.logger.log('All changes applied to original file');
                        vscode.window.showInformationMessage('✅ All changes applied to original file!');
                        
                        // Delete Accept All button
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