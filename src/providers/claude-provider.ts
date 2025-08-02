import axios from 'axios';
import * as vscode from 'vscode';
import { ILLMProvider, TranslationResult, ValidationResult, TokenUsage } from '../llm-provider.interface';
import { Logger, LogCategory } from '../logger';

export class ClaudeProvider implements ILLMProvider {
    private apiKey: string = '';
    private apiUrl: string = '';
    private logger!: Logger;
    private model: string = 'claude-2'; // Default model

    initialize(config: vscode.WorkspaceConfiguration, logger: Logger): void {
        this.apiKey = config.get('llmApiKey') || '';
        this.apiUrl = config.get('llmApiUrl') || 'https://api.anthropic.com/v1/complete';
        this.model = config.get('llmModel') || this.model;
        this.logger = logger;
        this.logger.info('ClaudeProvider initialized', LogCategory.PROVIDER);
    }

    async translate(content: any, targetLang: string): Promise<TranslationResult> {
        this.logger.logTranslation(`Starting translation to ${targetLang}`);
        const prompt = this.generatePrompt(content, targetLang);
        
        try {
            const result = await this.callAPI(prompt);
            const parsedResponse = this.parseResponse(result.content);
            this.logger.logTranslation(`Translation to ${targetLang} completed`);
            return {
                translatedContent: parsedResponse,
                tokensUsed: result.tokensUsed
            };
        } catch (error) {
            this.logger.error('Translation failed', error, LogCategory.PROVIDER);
            throw error;
        }
    }

    async compareAndUpdate(oldContent: any, newContent: any, targetLang: string): Promise<any> {
        this.logger.logTranslation(`Starting compare and update for ${targetLang}`);
        const prompt = this.generateCompareAndUpdatePrompt(oldContent, newContent, targetLang);
        
        try {
            const response = await this.callAPI(prompt);
            const parsedResponse = this.parseResponse(response.content);
            this.logger.logTranslation(`Compare and update for ${targetLang} completed`);
            return parsedResponse;
        } catch (error) {
            this.logger.error('Compare and update failed', error, LogCategory.PROVIDER);
            throw error;
        }
    }

    async validateTranslation(originalContent: any, translatedContent: any, targetLang: string): Promise<ValidationResult> {
        this.logger.logTranslation(`Starting translation validation for ${targetLang}`);
        const prompt = this.generateValidationPrompt(originalContent, translatedContent, targetLang);
        
        try {
            const result = await this.callAPI(prompt);
            const isValid = this.parseValidationResponse(result.content);
            this.logger.logTranslation(`Translation validation for ${targetLang} completed`);
            return {
                isValid,
                tokensUsed: result.tokensUsed
            };
        } catch (error) {
            this.logger.error('Translation validation failed', error, LogCategory.PROVIDER);
            throw error;
        }
    }

    getProviderName(): string {
        return 'Claude';
    }

    private generatePrompt(content: any, targetLang: string): string {
        return `Human: Translate the following JSON content to ${targetLang}. Maintain the JSON structure and keys. Only translate the values. Ensure the translation is culturally appropriate and uses common expressions in the target language:\n\n${JSON.stringify(content, null, 2)}\n\nAssistant: Certainly! I'll translate the JSON content to ${targetLang} while maintaining the structure and keys. Here's the translated version:`;
    }

    private generateCompareAndUpdatePrompt(oldContent: any, newContent: any, targetLang: string): string {
        return `Human: Compare the following two JSON structures. The first is the old content, and the second is the new content. Translate only the changed or new parts in the new content to ${targetLang}. Maintain the JSON structure and keys. Ensure the translation is culturally appropriate and uses common expressions in the target language.\n\nOld content:\n${JSON.stringify(oldContent, null, 2)}\n\nNew content:\n${JSON.stringify(newContent, null, 2)}\n\nAssistant: I understand. I'll compare the two JSON structures, identify the changes, and translate only the modified or new parts to ${targetLang}. Here's the result:`;
    }

    private generateValidationPrompt(originalContent: any, translatedContent: any, targetLang: string): string {
        return `Human: Validate the following translation from the original language to ${targetLang}. Check if the translation maintains the correct meaning, is culturally appropriate, and uses common expressions in the target language. Respond with 'true' if the translation is correct, or 'false' if there are any issues.\n\nOriginal content:\n${JSON.stringify(originalContent, null, 2)}\n\nTranslated content:\n${JSON.stringify(translatedContent, null, 2)}\n\nAssistant: I'll carefully review the translation and validate it based on the criteria you've provided. Here's my assessment:`;
    }

    private async callAPI(prompt: string): Promise<{ content: string; tokensUsed: TokenUsage }> {
        this.logger.logApi('Calling API');
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
        };
        const data = {
            prompt: prompt,
            model: this.model,
            max_tokens_to_sample: 1000,
            temperature: 0.7
        };
        try {
            const response = await axios.post(this.apiUrl, data, { headers });
            const content = response.data.completion;
            // Note: Claude API might not provide token usage information
            // You may need to implement a token counting logic or use an estimate
            const tokensUsed: TokenUsage = {
                inputTokens: prompt.split(' ').length, // Rough estimate
                outputTokens: content.split(' ').length // Rough estimate
            };
            this.logger.logApi('API call successful');
            return { content, tokensUsed };
        } catch (error) {
            this.logger.error('API call failed', error, LogCategory.API_LOGS);
            throw error;
        }
    }

    private parseResponse(response: string): any {
        this.logger.logApi('Parsing response');
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                this.logger.logApi('JSON part extracted successfully');
                return JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No valid JSON found in the response");
            }
        } catch (error) {
            this.logger.error('Failed to parse response as JSON', error, LogCategory.API_LOGS);
            throw new Error("Failed to parse Claude response as JSON");
        }
    }

    private parseValidationResponse(response: string): boolean {
        this.logger.logApi('Parsing validation response');
        return response.toLowerCase().includes('true');
    }
}
