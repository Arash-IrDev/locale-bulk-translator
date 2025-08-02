import * as vscode from 'vscode';
import { Logger } from './logger';
import { getAvailableProviders, getProviderConfig, getProviderDefaultApiUrl, getProviderDefaultModel, getProviderRequiresApiKey } from './provider-config';

export class ModelConfigurator {
    private logger: Logger;

    private outputChannel: vscode.OutputChannel;

    constructor(logger: Logger, channel: vscode.OutputChannel) {
        this.logger = logger;
        this.outputChannel = channel;
        this.logger.log('ModelConfigurator initialized');
    }

    // Configure AI model
    public async configureModel() {
        this.logger.log('configureModel method called');

        const config = vscode.workspace.getConfiguration('i18nNexus');
        const currentProvider = config.get('llmProvider') as string;
        const currentModel = config.get('llmModel') as string;

        // Prepare LLM provider options
        const providerOptions: vscode.QuickPickItem[] = getAvailableProviders().map(provider => {
            const config = getProviderConfig(provider);
            return {
                label: provider,
                description: `${config?.description || ''} ${provider === currentProvider ? '(current)' : ''}`
            };
        });

        this.logger.log(`Current provider: ${currentProvider}, Current model: ${currentModel}`);

        // Select LLM provider
        const selectedProvider = await vscode.window.showQuickPick(providerOptions, {
            placeHolder: 'Select LLM provider'
        });

        if (selectedProvider) {
            const provider = selectedProvider.label;
            this.logger.log(`Selected provider: ${provider}`);

            // Update LLM provider
            await config.update('llmProvider', provider, vscode.ConfigurationTarget.Global);
            this.logger.log(`Updated llmProvider to: ${provider}`);

            // Get provider configuration
            const providerConfig = getProviderConfig(provider);
            if (!providerConfig) {
                vscode.window.showErrorMessage(`Unknown provider: ${provider}`);
                return;
            }

            // Set default API URL automatically
            const defaultApiUrl = getProviderDefaultApiUrl(provider);
            await config.update('llmApiUrl', defaultApiUrl, vscode.ConfigurationTarget.Global);
            this.logger.log(`Updated llmApiUrl to: ${defaultApiUrl} (default for ${provider})`);

            // Input model name with suggestions
            const defaultModel = getProviderDefaultModel(provider);
            const model = await vscode.window.showInputBox({
                prompt: `Enter the model name for ${provider}`,
                value: currentModel || defaultModel,
                placeHolder: `Default: ${defaultModel}`
            });

            if (model) {
                await config.update('llmModel', model, vscode.ConfigurationTarget.Global);
                this.logger.log(`Updated llmModel to: ${model}`);
            }

            // Input API Key only if required
            if (getProviderRequiresApiKey(provider)) {
                const apiKey = await vscode.window.showInputBox({
                    prompt: `Enter the API Key for ${provider}`,
                    value: config.get('llmApiKey') as string,
                    password: true
                });

                if (apiKey) {
                    await config.update('llmApiKey', apiKey, vscode.ConfigurationTarget.Global);
                    this.logger.log('Updated llmApiKey (value hidden for security)');
                }
            } else {
                // Clear API key for providers that don't need it
                await config.update('llmApiKey', '', vscode.ConfigurationTarget.Global);
                this.logger.log(`Cleared llmApiKey (not required for ${provider})`);
            }

            vscode.window.showInformationMessage(`AI model configuration updated for ${provider}`);
            this.logger.log(`AI model configuration completed for ${provider}`);
        } else {
            this.logger.log('Model configuration cancelled');
        }
    }
}