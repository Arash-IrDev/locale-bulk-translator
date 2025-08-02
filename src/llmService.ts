import * as vscode from 'vscode';
import { Logger } from './logger';
import { ILLMProvider, TranslationResult, ValidationResult } from './llm-provider.interface';
import { OpenAIProvider } from './providers/openai-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { ClaudeProvider } from './providers/claude-provider';
import { OpenAICompatibleProvider } from './providers/openai-compatible-provider';
import { OllamaProvider } from './providers/ollama-provider';


export class LLMService {
    private provider!: ILLMProvider;
    private logger: Logger;
    private outputChannel: vscode.OutputChannel;
    private batchSize: number;
    private batchTokenLimit: number;
    private parallelBatchCount: number;

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.logger = logger;
        this.outputChannel = channel;
        const config = vscode.workspace.getConfiguration('i18nNexus');
        this.batchSize = config.get('translationBatchSize', 1000);
        this.batchTokenLimit = config.get('batchTokenLimit', 8000);
        this.parallelBatchCount = Math.max(1, config.get('parallelBatchCount', 1));
        // Don't initialize provider during construction to avoid API key validation errors
        this.logger.log('LLMService initialized (provider will be initialized on first use)');
    }

    private initializeProvider() {
        const config = vscode.workspace.getConfiguration('i18nNexus');
        const providerName = config.get('llmProvider') || 'openai';
        this.logger.log(`Initializing LLM provider: ${providerName}`);

        switch (providerName) {
            case 'openai':
                this.provider = new OpenAIProvider();
                break;
            case 'gemini':
                this.provider = new GeminiProvider();
                break;
            case 'claude':
                this.provider = new ClaudeProvider();
                break;
            case 'openai-compatible':
                this.provider = new OpenAICompatibleProvider();
                break;
            case 'ollama':
                this.provider = new OllamaProvider();
                break;
            //case 'zhipuai':
            //    this.provider = new ZhipuAIProvider();
            //    break;
            default:
                this.logger.error(`Unsupported LLM provider: ${providerName}`);
                throw new Error(`Unsupported LLM provider: ${providerName}`);
        }

        this.provider.initialize(config, this.logger);
        this.logger.log(`LLM provider ${providerName} initialized successfully`);
    }

    public async translate(content: any, targetLang: string): Promise<TranslationResult> {
        this.logger.log(`Starting translation to ${targetLang}`);
        try {
            // Initialize provider if not already initialized
            if (!this.provider) {
                this.initializeProvider();
            }
            
            const result = await this.translateInBatches(content, targetLang);
            this.logger.log(`Translation to ${targetLang} completed successfully`);
            this.logger.log(`Total tokens used: Input: ${result.tokensUsed.inputTokens}, Output: ${result.tokensUsed.outputTokens}`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Translation failed: ${errorMessage}`, error);
            vscode.window.showErrorMessage(`Translation failed: ${errorMessage}`);
            throw error;
        }
    }

    public async *translateGenerator(content: any, targetLang: string): AsyncGenerator<TranslationResult> {
        // Initialize provider if not already initialized
        if (!this.provider) {
            this.initializeProvider();
        }
        
        const batchGen = this.splitIntoBatches(content, this.batchSize);
        let index = 0;
        for (const batch of batchGen) {
            index++;
            this.outputChannel.appendLine(`Translating batch ${index}...`);
            const result = await this.provider.translate(batch, targetLang);
            if (result.tokensUsed.inputTokens + result.tokensUsed.outputTokens > this.batchTokenLimit) {
                this.batchSize = Math.max(1, Math.floor(this.batchSize / 2));
                this.outputChannel.appendLine(`Token usage high, reducing batch size to ${this.batchSize}`);
            }
            yield result;
        }
    }

    private async translateInBatches(content: any, targetLang: string): Promise<TranslationResult> {
        const batchGenerator = this.splitIntoBatches(content, this.batchSize);
        let batchIndex = 0;
        let totalTranslatedContent: any = {};
        let totalTokensUsed = { inputTokens: 0, outputTokens: 0 };
        const running: Promise<void>[] = [];

        const processBatch = async (batch: any, index: number) => {
            this.outputChannel.appendLine(`Translating batch ${index}...`);
            const result = await this.provider.translate(batch, targetLang);
            Object.assign(totalTranslatedContent, result.translatedContent);
            totalTokensUsed.inputTokens += result.tokensUsed.inputTokens;
            totalTokensUsed.outputTokens += result.tokensUsed.outputTokens;
            this.outputChannel.appendLine(`Batch ${index} translated. Tokens used: Input: ${result.tokensUsed.inputTokens}, Output: ${result.tokensUsed.outputTokens}`);
            if (result.tokensUsed.inputTokens + result.tokensUsed.outputTokens > this.batchTokenLimit) {
                this.batchSize = Math.max(1, Math.floor(this.batchSize / 2));
                this.outputChannel.appendLine(`Token usage high, reducing batch size to ${this.batchSize}`);
            }
        };

        for (const batch of batchGenerator) {
            batchIndex++;
            const p = processBatch(batch, batchIndex);
            running.push(p);
            if (running.length >= this.parallelBatchCount) {
                await running.shift();
            }
        }

        await Promise.all(running);
        return { translatedContent: totalTranslatedContent, tokensUsed: totalTokensUsed };
    }

    private *splitIntoBatches(obj: any, batchSize: number): Generator<any> {
        let currentBatch: any = {};
        let currentSize = 0;
        for (const [key, value] of Object.entries(obj)) {
            currentBatch[key] = value;
            currentSize++;
            if (currentSize >= batchSize) {
                yield currentBatch;
                currentBatch = {};
                currentSize = 0;
            }
        }
        if (currentSize > 0) {
            yield currentBatch;
        }
    }

    public async validateTranslation(originalContent: any, translatedContent: any, targetLang: string): Promise<ValidationResult> {
        this.logger.log(`Starting translation validation for ${targetLang}`);
        try {
            // Initialize provider if not already initialized
            if (!this.provider) {
                this.initializeProvider();
            }
            
            const result = await this.provider.validateTranslation(originalContent, translatedContent, targetLang);
            this.logger.log(`Translation validation for ${targetLang} completed`);
            this.logger.log(`Validation tokens used: Input: ${result.tokensUsed.inputTokens}, Output: ${result.tokensUsed.outputTokens}`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Translation validation failed: ${errorMessage}`, error);
            vscode.window.showErrorMessage(`Translation validation failed: ${errorMessage}`);
            throw error;
        }
    }

    public getProviderName(): string {
        return this.provider.getProviderName();
    }
}