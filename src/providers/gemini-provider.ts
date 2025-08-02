import * as vscode from 'vscode';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ILLMProvider, TranslationResult, ValidationResult, TokenUsage } from '../llm-provider.interface';
import { Logger, LogCategory } from '../logger';

export class GeminiProvider implements ILLMProvider {
    private model!: GenerativeModel;
    private logger!: Logger;

    initialize(config: vscode.WorkspaceConfiguration, logger: Logger): void {
        const apiKey = config.get('llmApiKey');
        const modelName = config.get('llmModel');

        if (typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Invalid or missing Gemini API key');
        }

        if (typeof modelName !== 'string' || modelName.trim() === '') {
            throw new Error('Invalid or missing Gemini model name');
        }

        this.logger = logger;

        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ model: modelName });

        this.logger.debug(`key: ${apiKey}, model: ${modelName}`, LogCategory.PROVIDER);

        this.logger.info('GeminiProvider initialized', LogCategory.PROVIDER);
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
            const result = await this.callAPI(prompt);
            const parsedResponse = this.parseResponse(result.content);
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
        return 'Gemini';
    }

    private generatePrompt(content: any, targetLang: string): string {
        return `Translate the following JSON content to ${targetLang}. Maintain the JSON structure and keys. Only translate the values. Ensure the translation is culturally appropriate and uses common expressions in the target language:\n\n${JSON.stringify(content, null, 2)}`;
    }

    private generateCompareAndUpdatePrompt(oldContent: any, newContent: any, targetLang: string): string {
        return `Compare the following two JSON structures. The first is the old content, and the second is the new content. Translate only the changed or new parts in the new content to ${targetLang}. Maintain the JSON structure and keys. Ensure the translation is culturally appropriate and uses common expressions in the target language.\n\nOld content:\n${JSON.stringify(oldContent, null, 2)}\n\nNew content:\n${JSON.stringify(newContent, null, 2)}`;
    }

    private generateValidationPrompt(originalContent: any, translatedContent: any, targetLang: string): string {
        return `Validate the following translation from the original language to ${targetLang}. Check if the translation maintains the correct meaning, is culturally appropriate, and uses common expressions in the target language. Respond with 'true' if the translation is correct, or 'false' if there are any issues.\n\nOriginal content:\n${JSON.stringify(originalContent, null, 2)}\n\nTranslated content:\n${JSON.stringify(translatedContent, null, 2)}`;
    }

    private async callAPI(prompt: string): Promise<{ content: string; tokensUsed: TokenUsage }> {
        this.logger.logApi('Calling API');
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const content = response.text();
            // Note: Gemini API might not provide token usage information
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
            throw new Error("Failed to parse Gemini response as JSON");
        }
    }

    private parseValidationResponse(response: string): boolean {
        this.logger.logApi('Parsing validation response');
        return response.toLowerCase().includes('true');
    }
}

