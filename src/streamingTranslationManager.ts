import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LLMService } from './llmService';
import { Logger, LogCategory } from './logger';
import { ChunkDiffViewer, ChunkDiffResult } from './chunkDiffViewer';
import { getProviderConfig } from './provider-config';

interface StreamingTranslationResult {
  chunkId: string;
  originalContent: Record<string, any>;
  translatedContent: Record<string, any>;
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

    const config = vscode.workspace.getConfiguration('i18nNexus');
    this.chunkSize = config.get<number>('chunkSize', 3000);
    this.autoSaveInterval = config.get<number>('autoSaveInterval', 100);
  }

  private logTranslationStructures(
    chunkId: string,
    originalData: any,
    inputToLLM: any,
    llmResponse: any,
    finalStructure: any
  ): void {
    const separator = '='.repeat(80);
    const sectionSeparator = '-'.repeat(60);

    this.logger.logStructures(separator);
    this.logger.logStructures(`🔄 TRANSLATION STRUCTURES FOR ${chunkId.toUpperCase()}`);
    this.logger.logStructures(separator);

    this.logger.logStructures(`📄 ORIGINAL DATA STRUCTURE (${Object.keys(originalData).length} keys):`);
    this.logger.logStructures(sectionSeparator);
    this.logger.logStructures(JSON.stringify(originalData, null, 2));
    this.logger.logStructures('');

    this.logger.logStructures(`📤 INPUT TO LLM (${Object.keys(inputToLLM).length} keys):`);
    this.logger.logStructures(sectionSeparator);
    this.logger.logStructures(JSON.stringify(inputToLLM, null, 2));
    this.logger.logStructures('');

    this.logger.logStructures(`📥 LLM RESPONSE (${Object.keys(llmResponse).length} keys):`);
    this.logger.logStructures(sectionSeparator);
    this.logger.logStructures(JSON.stringify(llmResponse, null, 2));
    this.logger.logStructures('');

    this.logger.logStructures(`📋 FINAL EXTRACTED STRUCTURE (${Object.keys(finalStructure).length} keys):`);
    this.logger.logStructures(sectionSeparator);
    this.logger.logStructures(JSON.stringify(finalStructure, null, 2));
    this.logger.logStructures('');

    this.logger.logStructures(`📊 STRUCTURE COMPARISON SUMMARY:`);
    this.logger.logStructures(sectionSeparator);
    this.logger.logStructures(`Original keys: ${Object.keys(originalData).join(', ')}`);
    this.logger.logStructures(`Input keys: ${Object.keys(inputToLLM).join(', ')}`);
    this.logger.logStructures(`Response keys: ${Object.keys(llmResponse).join(', ')}`);
    this.logger.logStructures(`Final keys: ${Object.keys(finalStructure).join(', ')}`);

    this.logger.logStructures(separator);
    this.logger.logStructures('');
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
      this.logger.logTranslation(`Starting streaming translation for file: ${filePath}`);

      if (!this.isValidTranslationFile(filePath)) {
        vscode.window.showErrorMessage('This file cannot be translated. Please select a valid translation JSON file.');
        return;
      }

      const config = vscode.workspace.getConfiguration('i18nNexus');
      const basePath = config.get<string>('basePath');
      const baseLanguage = config.get<string>('baseLanguage');
      const llmProvider = config.get<string>('llmProvider');
      const llmApiKey = config.get<string>('llmApiKey');

      if (!basePath || !baseLanguage) {
        throw new Error('Base path or base language not configured.');
      }
      if (!llmProvider) {
        throw new Error('LLM provider not configured.');
      }

      const providerConfig = getProviderConfig(llmProvider);
      if (providerConfig && providerConfig.requiresApiKey && !llmApiKey) {
        throw new Error('API key not configured for this provider.');
      }

      const fileName = path.basename(filePath);
      const lang = path.parse(fileName).name;
      if (lang === baseLanguage) {
        vscode.window.showInformationMessage('This is the base language file, no translation needed.');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullBasePath = path.join(workspaceRoot, basePath);
      const baseFilePath = path.join(fullBasePath, `${baseLanguage}.json`);
      if (!fs.existsSync(baseFilePath)) {
        throw new Error(`Base language file not found: ${baseFilePath}`);
      }

      const baseContent = this.loadJsonFile(baseFilePath);
      const targetContent = fs.existsSync(filePath) ? this.loadJsonFile(filePath) : {};
      const originalBaseContent = this.getOriginalBaseContent(baseFilePath);

      const toTranslate = this.prepareTranslationContent(baseContent, targetContent, originalBaseContent);
      if (Object.keys(toTranslate).length === 0) {
        vscode.window.showInformationMessage('No changes detected, no translation needed.');
        return;
      }

      const chunks = this.splitIntoChunks(toTranslate, this.chunkSize);
      this.logger.logTranslation(`Split content into ${chunks.length} chunks from ${Object.keys(toTranslate).length} total keys`);

      this.tempFilePath = this.createTempFile(filePath, targetContent);
      this.allChangesFlat = this.flattenNestedContent(targetContent);

      const results: StreamingTranslationResult[] = [];
      let totalTokens = { inputTokens: 0, outputTokens: 0 };
      let acceptedChunks = 0;
      let rejectedChunks = 0;

      this.logger.logTranslation(`Starting translation loop for ${chunks.length} chunks`);
      this.showProgressBar(chunks.length).catch(error => {
        this.logger.error(`Error in progress bar: ${error}`, error, LogCategory.UI);
      });

      for (let i = 0; i < chunks.length; i++) {
        if (this.translationCancelled) {
          this.logger.warn('Translation cancelled by user', LogCategory.TRANSLATION);
          break;
        }

        const chunk = chunks[i];
        const chunkId = `chunk_${i + 1}`;
        this.logger.logTranslation(`Processing chunk ${chunkId} (${i + 1}/${chunks.length})`);
        try {
          this.updateProgress(i + 1, chunks.length, chunkId, totalTokens, acceptedChunks, rejectedChunks);

          const result = await this.translateChunk(chunk, toTranslate, lang, chunkId, i + 1, chunks.length);
          const applied = await this.applyChunkToFile(result);

          if (applied) {
            acceptedChunks++;
            totalTokens.inputTokens += result.tokensUsed.inputTokens;
            totalTokens.outputTokens += result.tokensUsed.outputTokens;
            this.logger.logTranslation(`Chunk ${chunkId} applied successfully`);
          } else {
            rejectedChunks++;
            this.logger.warn(`Chunk ${chunkId} rejected by user`, LogCategory.TRANSLATION);
          }

          results.push({ ...result, applied });
          await this.delay(this.autoSaveInterval);
        } catch (error) {
          this.logger.error(`Error translating chunk ${chunkId}: ${error}`, LogCategory.TRANSLATION);
          vscode.window.showWarningMessage(`Error translating chunk ${chunkId}. Skipping to next chunk.`);
        }
      }

      if (!this.translationCancelled && results.length > 0) {
        this.logger.logTranslation(`Translation loop completed. Processed ${results.length} chunks, ${acceptedChunks} accepted, ${rejectedChunks} rejected.`);
        if (acceptedChunks > 0) {
          await this.showFinalSummary(results, totalTokens, acceptedChunks, rejectedChunks);
          vscode.window.showInformationMessage(
            `Translation completed! ${acceptedChunks} chunks processed successfully, ${rejectedChunks} failed. Use Accept All or Reject All buttons in status bar.`
          );
        } else {
          this.logger.error('No chunks were successfully translated', undefined, LogCategory.TRANSLATION);
          vscode.window.showWarningMessage(
            `Translation failed! All ${results.length} chunks failed to translate. Please check the logs for details.`
          );
          this.cleanup();
        }
      } else if (this.translationCancelled) {
        this.logger.warn('Translation was cancelled by user', LogCategory.TRANSLATION);
        vscode.window.showInformationMessage('Translation was cancelled by user.');
        this.cleanup();
      } else {
        this.logger.warn('No results to process', LogCategory.TRANSLATION);
        this.cleanup();
      }
    } catch (error) {
      this.logger.error(`Error during streaming translation: ${error}`, LogCategory.TRANSLATION);
      vscode.window.showErrorMessage(`Translation failed: ${error}`);
    } finally {
      this.isTranslationActive = false;
      this.hideProgressBar();
    }
  }

  private isValidTranslationFile(filePath: string): boolean {
    if (filePath.includes('extension-output') || filePath.includes('i18n Nexus')) return false;
    if (!filePath.endsWith('.json')) return false;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot && !filePath.startsWith(workspaceRoot)) return false;
    try {
      if (fs.existsSync(filePath)) {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return true;
      }
    } catch {
      this.logger.error(`Invalid JSON file: ${filePath}`);
      return false;
    }
    return false;
  }

  private createTempFile(originalFilePath: string, initialContent: any): string {
    const tempDir = path.join(os.tmpdir(), 'i18n-nexus-streaming');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFileName = `streaming_${Date.now()}_${path.basename(originalFilePath)}`;
    const tempFilePath = path.join(tempDir, tempFileName);
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
      if (!result.translatedContent || typeof result.translatedContent !== 'object' || !Object.keys(result.translatedContent).length) {
        this.logger.warn(`Chunk ${result.chunkId} has invalid or empty translated content`);
        return false;
      }

      // Merge flat LLM response with overall state
      this.allChangesFlat = {
        ...this.allChangesFlat,
        ...result.translatedContent
      };

      // Rebuild nested JSON and write to temp file
      const mergedContent = this.unflattenContent(this.allChangesFlat);
      fs.writeFileSync(this.tempFilePath, JSON.stringify(mergedContent, null, 2));

      // Show diff view
      this.showDiffViewWithControls(mergedContent, result.chunkId).catch(err =>
        this.logger.error(`Error showing diff for ${result.chunkId}: ${err}`)
      );
      return true;
    } catch (error) {
      this.logger.error(`Error applying chunk to file: ${error}`);
      return false;
    }
  }

  private async showLiveDiff(mergedContent: any): Promise<void> {
    try {
      if (!this.originalFilePath) {
        this.logger.error('Original file path not found for live diff');
        return;
      }
      let originalContent: any = {};
      if (fs.existsSync(this.originalFilePath)) {
        originalContent = this.loadJsonFile(this.originalFilePath);
      }
      let editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
        const doc = await vscode.workspace.openTextDocument(this.originalFilePath);
        editor = await vscode.window.showTextDocument(doc);
      }
      if (editor) {
        await this.showLiveDiffAndUpdate(mergedContent, 'current');
      }
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
      const tempDiffPath = path.join(os.tmpdir(), `i18n-nexus-diff-${chunkId}.json`);
      fs.writeFileSync(tempDiffPath, JSON.stringify(mergedContent, null, 2));
      this.diffTempFiles.push(tempDiffPath);

      const originalUri = vscode.Uri.file(this.originalFilePath);
      const diffUri = vscode.Uri.file(tempDiffPath);

      this.showControlButtonsInStatusBar();
      await this.delay(50);

      try {
        await vscode.commands.executeCommand('vscode.diff', originalUri, diffUri, `Live Translation Progress - ${chunkId}`);
        this.logger.log('Diff view opened successfully');
      } catch {
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
    const lastKey = key.split('.').pop()!;
    let idx = text.indexOf(`"${key}"`);
    if (idx === -1) {
      idx = text.indexOf(`"${lastKey}"`);
    }
    if (idx === -1) return null;
    const start = document.positionAt(idx);
    const end = document.positionAt(idx + lastKey.length + 2);
    return new vscode.Range(start, end);
  }

  private async showLiveDiffAndUpdate(mergedContent: any, chunkId: string): Promise<void> {
    try {
      if (!this.originalFilePath) {
        this.logger.error('Original file path not found');
        return;
      }
      let editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.fsPath !== this.originalFilePath) {
        const doc = await vscode.workspace.openTextDocument(this.originalFilePath);
        editor = await vscode.window.showTextDocument(doc);
      }
      if (editor) {
        await this.showDiffViewWithControls(mergedContent, chunkId);
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
    if (this.progressBarResolve) {
      this.progressBarResolve();
      this.progressBarResolve = null;
    }
    vscode.window.showInformationMessage(`🎉 Translation completed! ${acceptedChunks} keys updated.`);
    this.showAcceptAllButtonAtEnd();
  }

  private async applyFinalChanges(): Promise<void> {
    this.logger.log(`Applying final changes...`);
    if (!this.tempFilePath || !this.originalFilePath) {
      throw new Error('Temp/original file path missing');
    }
    if (!fs.existsSync(this.tempFilePath)) {
      throw new Error(`Temp file does not exist: ${this.tempFilePath}`);
    }
    const content = fs.readFileSync(this.tempFilePath, 'utf8');
    fs.writeFileSync(this.originalFilePath, content);
    this.logger.log(`Final changes applied to ${this.originalFilePath}`);
  }

  private async updateProgress(
    currentChunk: number,
    totalChunks: number,
    chunkId: string,
    totalTokens: { inputTokens: number; outputTokens: number },
    acceptedChunks: number,
    rejectedChunks: number
  ): Promise<void> {
    const pct = Math.round((currentChunk / totalChunks) * 100);
    const msg = `Translating ${chunkId} (${currentChunk}/${totalChunks}) - ${pct}% - Accepted: ${acceptedChunks}, Rejected: ${rejectedChunks}`;
    this.progressBar?.report({ message: msg, increment: 0 });
    if (this.statusBarItem) {
      this.statusBarItem.text = `🔄 ${pct}% (${currentChunk}/${totalChunks})`;
    }
    this.outputChannel.appendLine(msg);
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
      return new Promise<void>(resolve => {
        this.progressBarResolve = resolve;
      });
    });
  }

  private showStatusBar(): void {
    if (!this.statusBarItem) {
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    }
    this.statusBarItem.text = "🔄 Streaming Translation...";
    this.statusBarItem.tooltip = "Translation in progress";
    this.statusBarItem.show();
  }

  private showControlButtonsInStatusBar(): void {
    if (this.isTranslationActive) {
      const cancelItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
      cancelItem.text = "🛑 Cancel Translation";
      cancelItem.tooltip = "Cancel the current translation process";
      cancelItem.command = 'i18n-nexus.cancelTranslation';
      cancelItem.show();
      this.cancelItem = cancelItem;
    }
  }

  private showAcceptAllButtonAtEnd(): void {
    const acceptAllItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    acceptAllItem.text = "✅ Accept All Changes";
    acceptAllItem.tooltip = "Apply all translated changes to the original file";
    acceptAllItem.command = 'i18n-nexus.acceptAllChanges';
    acceptAllItem.show();
    this.acceptAllItem = acceptAllItem;
  }

  private hideProgressBar(): void {
    this.progressBar = null;
  }

  private hideStatusBar(): void {
    this.statusBarItem?.dispose();
    this.acceptAllItem?.dispose();
    this.cancelItem?.dispose();
    this.statusBarItem = this.acceptAllItem = this.cancelItem = null;
  }

  private cleanup(): void {
    if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
      try { fs.unlinkSync(this.tempFilePath); } catch {}
    }
    for (const diffPath of this.diffTempFiles) {
      if (fs.existsSync(diffPath)) {
        try { fs.unlinkSync(diffPath); } catch {}
      }
    }
    this.diffTempFiles = [];
    this.diffViewer.cleanup();
    this.tempFilePath = this.originalFilePath = null;
    this.allChangesFlat = {};
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async translateChunk(
    chunk: Record<string, any>,
    originalData: Record<string, any>,
    lang: string,
    chunkId: string,
    chunkNumber: number,
    totalChunks: number
  ): Promise<StreamingTranslationResult> {
    const startLine = (chunkNumber - 1) * this.chunkSize;
    const endLine = startLine + Object.keys(chunk).length;
    const result = await this.llmService.translate(chunk, lang);
    this.logTranslationStructures(
      chunkId,
      originalData,
      chunk,
      result.translatedContent,
      this.unflattenContent(result.translatedContent)
    );
    return {
      chunkId,
      originalContent: chunk,
      translatedContent: result.translatedContent,
      tokensUsed: result.tokensUsed,
      startLine,
      endLine,
      applied: false
    };
  }

  private splitIntoChunks(obj: Record<string, any>, chunkSize: number): Record<string, any>[] {
    const chunks: Record<string, any>[] = [];
    const keys = Object.keys(obj);
    let currentChunk: Record<string, any> = {};
    let currentSize = 0;
    for (const key of keys) {
      const kv = { [key]: obj[key] };
      const s = JSON.stringify(kv, null, 2).length;
      if (currentSize + s > chunkSize && Object.keys(currentChunk).length) {
        chunks.push(currentChunk);
        currentChunk = { [key]: obj[key] };
        currentSize = s;
      } else {
        currentChunk[key] = obj[key];
        currentSize += s;
      }
    }
    if (Object.keys(currentChunk).length) {
      chunks.push(currentChunk);
    }
    return chunks;
  }

  private loadJsonFile(filePath: string): any {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  private getOriginalBaseContent(filePath: string): any {
    try {
      const snap = `${filePath}.original`;
      if (fs.existsSync(snap)) {
        return this.loadJsonFile(snap);
      }
      return this.loadJsonFile(filePath);
    } catch (e) {
      this.logger.warn(`Could not get original content: ${e}`);
      return this.loadJsonFile(filePath);
    }
  }

  private prepareTranslationContent(
    baseContent: Record<string, any>,
    targetContent: Record<string, any>,
    originalBaseContent: Record<string, any>
  ): Record<string, any> {
    const nestedDiff: Record<string, any> = {};
    this.deepCompare(baseContent, targetContent, originalBaseContent, nestedDiff);
    return this.flattenNestedContent(nestedDiff);
  }

  private deepCompare(
    base: Record<string, any>,
    target: Record<string, any>,
    original: Record<string, any>,
    result: Record<string, any>,
    currentPath: string = ''
  ): void {
    for (const key in base) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      const bVal = base[key];
      const tVal = target[key];
      const oVal = this.getNestedValue(original, newPath);

      if (bVal !== null && typeof bVal === 'object' && !Array.isArray(bVal)) {
        this.deepCompare(
          bVal,
          (typeof tVal === 'object' && tVal) || {},
          (typeof oVal === 'object' && oVal) || {},
          result,
          newPath
        );
      } else {
        const needs = !(key in target) ||
          tVal === '' ||
          (original && oVal !== bVal) ||
          (key in target && tVal !== bVal);
        if (needs) {
          result[newPath] = bVal;
        }
      }
    }
    for (const key in target) {
      if (!(key in base)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        result[newPath] = null;
      }
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
  }

  private flattenNestedContent(obj: Record<string, any>, parentKey = ''): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const dotted = parentKey ? `${parentKey}.${key}` : key;
      const val = obj[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(out, this.flattenNestedContent(val, dotted));
      } else {
        out[dotted] = val;
      }
    }
    return out;
  }

  private unflattenContent(flat: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const dotted of Object.keys(flat)) {
      const parts = dotted.split('.');
      let cursor: Record<string, any> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!cursor[part] || typeof cursor[part] !== 'object') {
          cursor[part] = {};
        }
        cursor = cursor[part];
      }
      cursor[parts[parts.length - 1]] = flat[dotted];
    }
    return result;
  }

  private convertLLMResponseToOriginalStructureNew(
    llmResponse: Record<string, any>,
    originalChunk: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const rootKey of Object.keys(originalChunk)) {
      const grouped = llmResponse[rootKey];
      if (!grouped || typeof grouped !== 'object') {
        result[rootKey] = originalChunk[rootKey];
        continue;
      }
      const reconstructed: Record<string, any> = {};
      for (const groupingKey of Object.keys(grouped)) {
        const groupValue = grouped[groupingKey];
        if (!groupValue || typeof groupValue !== 'object') continue;
        const flatGroup = this.flattenNestedContent(groupValue);
        const cleaned: Record<string, any> = {};
        const prefix = groupingKey + '.';
        for (const k of Object.keys(flatGroup)) {
          if (k.startsWith(prefix)) {
            cleaned[k.substring(prefix.length)] = flatGroup[k];
          }
        }
        reconstructed[groupingKey.slice(rootKey.length + 1)] = this.unflattenContent(cleaned);
      }
      result[rootKey] = reconstructed;
    }
    return result;
  }

  public cancelTranslation(): void {
    this.logger.log('Translation cancelled by user');
    this.translationCancelled = true;
    this.isTranslationActive = false;
    if (this.progressBarResolve) {
      this.progressBarResolve();
      this.progressBarResolve = null;
    }
    if (this.cancelItem) {
      this.cancelItem.dispose();
      this.cancelItem = null;
    }
    this.showAcceptAllButtonAtEnd();
  }

  public isActive(): boolean {
    return this.isTranslationActive;
  }

  public acceptAllChanges(): void {
    try {
      this.logger.log('Accept all changes triggered');
      if (this.tempFilePath && this.originalFilePath) {
        if (fs.existsSync(this.tempFilePath)) {
          this.applyFinalChanges().then(() => {
            this.logger.log('All changes applied to original file');
            vscode.window.showInformationMessage('✅ All changes applied to original file!');
            if (this.acceptAllItem) {
              this.acceptAllItem.dispose();
              this.acceptAllItem = null;
            }
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