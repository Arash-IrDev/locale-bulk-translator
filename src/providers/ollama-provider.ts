import * as vscode from 'vscode';
import axios from 'axios';
import { ILLMProvider, TranslationResult, ValidationResult, TokenUsage } from '../llm-provider.interface';
import { Logger, LogCategory } from '../logger';
import { getProviderDefaultApiUrl, getProviderDefaultModel } from '../provider-config';

export class OllamaProvider implements ILLMProvider {
    private apiUrl: string = '';
    private model: string = '';
    private logger!: Logger;

    initialize(config: vscode.WorkspaceConfiguration, logger: Logger): void {
        // Use default Ollama configuration
        this.apiUrl = getProviderDefaultApiUrl('ollama') + '/chat/completions';
        this.model = config.get('llmModel') || getProviderDefaultModel('ollama');
        this.logger = logger;
        this.logger.info('OllamaProvider initialized', LogCategory.PROVIDER);
        this.logger.debug(`Ollama API URL: ${this.apiUrl}`, LogCategory.PROVIDER);
        this.logger.debug(`Ollama Model: ${this.model}`, LogCategory.PROVIDER);
    }

    async translate(content: any, targetLang: string): Promise<TranslationResult> {
        this.logger.logTranslation(`Starting translation to ${targetLang}`);
        this.logger.logProvider(`Input content structure: ${Object.keys(content).length} keys`);
        this.logger.logProvider(`Input content keys: ${Object.keys(content).slice(0, 5).join(', ')}${Object.keys(content).length > 5 ? '...' : ''}`);
        
        const prompt = this.generatePrompt(content, targetLang);
        
        try {
            const result = await this.callAPI(prompt);
            this.logger.logProvider(`Raw response length: ${result.content.length} characters`);
            this.logger.logProvider(`Raw response preview: ${result.content.substring(0, 200)}...`);
            
            const parsedResponse = this.parseResponse(result.content);
            this.logger.logProvider(`Parsed response structure: ${Object.keys(parsedResponse).length} keys`);
            this.logger.logTranslation(`Translation to ${targetLang} completed successfully`);
            
            return {
                translatedContent: parsedResponse,
                tokensUsed: result.tokensUsed
            };
        } catch (error) {
            this.logger.error('Translation failed', error, LogCategory.PROVIDER);
            throw error;
        }
    }

    async compareAndUpdate(oldContent: any, newContent: any, targetLang: string): Promise<TranslationResult> {
        this.logger.logTranslation(`Starting compare and update for ${targetLang}`);
        const prompt = this.generateCompareAndUpdatePrompt(oldContent, newContent, targetLang);
        
        try {
            const result = await this.callAPI(prompt);
            const parsedResponse = this.parseResponse(result.content);
            this.logger.logTranslation(`Compare and update for ${targetLang} completed`);
            return {
                translatedContent: parsedResponse,
                tokensUsed: result.tokensUsed
            };
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
        return 'Ollama';
    }

    private generatePrompt(content: any, targetLang: string): string {
        return `You are a professional translator. Your task is to translate JSON content to ${targetLang}.

CRITICAL INSTRUCTIONS:
1. Maintain the EXACT JSON structure and keys
2. Only translate the string values, keep all keys unchanged
3. Return ONLY valid JSON, no explanations, no additional text
4. Do not add any comments or descriptions
5. The response must be parseable JSON

INPUT JSON:
${JSON.stringify(content, null, 2)}

RESPOND WITH ONLY THE TRANSLATED JSON:`;
    }

    private generateCompareAndUpdatePrompt(oldContent: any, newContent: any, targetLang: string): string {
        return `You are a professional translator. Compare the following two JSON structures and translate only the changed or new parts in the new content to ${targetLang}.

IMPORTANT RULES:
1. Maintain the exact JSON structure and keys
2. Only translate the values that are new or changed
3. Keep all keys unchanged
4. Ensure the translation is culturally appropriate and uses common expressions in the target language
5. Return ONLY the translated JSON, no additional text or explanations

Old content:
${JSON.stringify(oldContent, null, 2)}

New content (translate only new/changed values):
${JSON.stringify(newContent, null, 2)}`;
    }

    private generateValidationPrompt(originalContent: any, translatedContent: any, targetLang: string): string {
        return `You are a translation validator. Check if the following translation from the original language to ${targetLang} is correct.

VALIDATION CRITERIA:
1. The translation maintains the correct meaning
2. It is culturally appropriate
3. It uses common expressions in the target language
4. The JSON structure is preserved

Respond with exactly 'true' if the translation is correct, or 'false' if there are any issues.

Original content:
${JSON.stringify(originalContent, null, 2)}

Translated content:
${JSON.stringify(translatedContent, null, 2)}`;
    }

    private async callAPI(prompt: string): Promise<{ content: string; tokensUsed: TokenUsage }> {
        this.logger.log('Ollama: Calling API');
        this.logger.log(`Prompt: ${prompt}`);
        this.logger.log(`API URL: ${this.apiUrl}`);
        this.logger.log(`Model: ${this.model}`);
    
        try {
            const requestBody = {
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                stream: false,
                options: {
                    temperature: 0.1, // Lower temperature for more consistent translations
                    top_p: 0.9
                }
            };
            this.logger.log(`Request Body: ${JSON.stringify(requestBody, null, 2)}`);
    
            const response = await axios.post(
                this.apiUrl,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000 // 2 minutes timeout for local models
                }
            );
    
            this.logger.log('Ollama: API call successful');
            this.logger.log(`Response Status: ${response.status}`);
            this.logger.log(`Response Data: ${JSON.stringify(response.data, null, 2)}`);
    
            const content = response.data.choices[0].message.content;
            const tokensUsed: TokenUsage = {
                inputTokens: response.data.usage?.prompt_tokens || 0,
                outputTokens: response.data.usage?.completion_tokens || 0
            };
    
            this.logger.log(`Extracted Content: ${content}`);
            this.logger.log(`Tokens Used: Input: ${tokensUsed.inputTokens}, Output: ${tokensUsed.outputTokens}`);
    
            return { content, tokensUsed };
        } catch (error) {
            this.logger.error('Ollama: API call failed');
            if (axios.isAxiosError(error)) {
                this.logger.error(`Error Response: ${JSON.stringify(error.response?.data, null, 2)}`);
                this.logger.error(`Error Status: ${error.response?.status}`);
                this.logger.error(`Error Message: ${error.message}`);
            } else {
                this.logger.error(`Error: ${error}`);
            }
            throw error;
        }
    }

    private parseResponse(response: string): any {
        this.logger.log('Ollama: Parsing response');
        this.logger.log(`Ollama: Response starts with: ${response.substring(0, 100)}...`);
        
        try {
            // First, try to find JSON in the response using a more robust pattern
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonString = jsonMatch[0];
                this.logger.log(`Ollama: Found JSON match, length: ${jsonString.length}`);
                this.logger.log(`Ollama: JSON preview: ${jsonString.substring(0, 200)}...`);
                return JSON.parse(jsonString);
            }
            
            // If no JSON found, try to parse the entire response
            this.logger.log('Ollama: No JSON match found, trying to parse entire response');
            return JSON.parse(response.trim());
            
        } catch (error) {
            this.logger.error('Ollama: Failed to parse response as JSON');
            this.logger.error(`Ollama: Response type: ${typeof response}`);
            this.logger.error(`Ollama: Response length: ${response.length}`);
            this.logger.error(`Ollama: Raw response: ${response}`);
            
            // Try to extract any JSON-like content
            const possibleJson = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
            if (possibleJson) {
                this.logger.log('Ollama: Attempting to parse possible JSON content');
                try {
                    return JSON.parse(possibleJson[0]);
                } catch (secondError) {
                    this.logger.error('Ollama: Second parsing attempt also failed');
                }
            }
            
            throw new Error("Failed to parse Ollama response as JSON");
        }
    }

    private parseValidationResponse(response: string): boolean {
        this.logger.log('Ollama: Parsing validation response');
        return response.toLowerCase().includes('true');
    }
} 