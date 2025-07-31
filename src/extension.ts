// The vscode module contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in the code below
import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { ChunkedTranslationManager } from './chunkedTranslationManager';
import { LanguageSelector } from './languageSelector';
import { ModelConfigurator } from './modelConfigurator';
import { Logger } from './logger';
// This method is called when the extension is activated for the first time
export function activate(context: vscode.ExtensionContext) {
    const channel = vscode.window.createOutputChannel('i18n Nexus');
    const logger = new Logger(channel);
    logger.log('i18n Nexus activation started');

    // Initialize managers without API key validation during activation
    let translationManager: TranslationManager | undefined;
    let chunkedTranslationManager: ChunkedTranslationManager | undefined;
    let modelConfigurator: ModelConfigurator | undefined;
    
    try {
        translationManager = new TranslationManager(logger, channel);
        chunkedTranslationManager = new ChunkedTranslationManager(logger, channel);
        modelConfigurator = new ModelConfigurator(logger, channel);
        logger.log('All managers initialized');
    } catch (error) {
        logger.error('Failed to initialize managers:', error);
        // Don't throw error during activation, just log it
        vscode.window.showWarningMessage('i18n Nexus activated with limited functionality. Please configure your API key to use translation features.');
    }

    const showConfigDisposable = vscode.commands.registerCommand('i18n-nexus.showConfig', () => {
        const config = vscode.workspace.getConfiguration('i18nNexus');
        const configObject = {
            basePath: config.get('basePath'),
            baseLanguage: config.get('baseLanguage'),
            targetLanguages: config.get('targetLanguages'),
            llmProvider: config.get('llmProvider'),
            llmApiKey: '******', // For security, don't display the actual API key
            llmApiUrl: config.get('llmApiUrl'),
            // Add other configuration items...
        };

        const configJson = JSON.stringify(configObject, null, 2);

        // Create and display output channel
        // const channel = vscode.window.createOutputChannel('i18n Nexus Configuration');
        channel.appendLine('Current i18n Nexus Configuration:');
        channel.appendLine(configJson);
        channel.show();

        // Also display brief information in the information prompt
        logger.toggleDebugOutput();
        vscode.window.showInformationMessage(`${logger.isDebugEnabled() ? 'd-' : ''}i18n Nexus configuration has been output to the "i18n Nexus Configuration" channel.`);
    });

    context.subscriptions.push(showConfigDisposable);

    // Register translation command
    let translateDisposable = vscode.commands.registerCommand('i18n-nexus.translateFiles', () => {
        console.log('Translation command triggered');
        if (!translationManager) {
            vscode.window.showErrorMessage('Translation manager not initialized. Please check your configuration.');
            return;
        }
        try {
            translationManager.translate().catch(error => {
                console.error('Error occurred during translation:', error);
                vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
            });
            console.log('Translation operation completed');
        } catch (error) {
            console.error('Error occurred during translation:', error);
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('Unknown error occurred during translation');
            }
        }
    });

    // Register configure model command
    let configureModelDisposable = vscode.commands.registerCommand('i18n-nexus.configureModel', () => {
        logger.log('Configure model command triggered');
        if (!modelConfigurator) {
            vscode.window.showErrorMessage('Model configurator not initialized. Please check your configuration.');
            return;
        }
        modelConfigurator.configureModel();
    });
    logger.log('Configure model command registered');

    // Register toggle debug output command
    let toggleDebugOutputDisposable = vscode.commands.registerCommand('i18n-nexus.toggleDebugOutput', () => {
        logger.toggleDebugOutput();
        vscode.window.showInformationMessage(`Debug output ${logger.isDebugEnabled() ? 'enabled' : 'disabled'}`);
    });
    logger.log('Toggle debug output command registered');

    context.subscriptions.push(
        translateDisposable,
        configureModelDisposable,
        toggleDebugOutputDisposable
    );


    // Add the following code in the extension.ts file

    // Register translate current file command
    let translateCurrentFileDisposable = vscode.commands.registerCommand('i18n-nexus.translateCurrentFile', () => {
        logger.log('Translate current file command triggered');
        if (!translationManager) {
            vscode.window.showErrorMessage('Translation manager not initialized. Please check your configuration.');
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            translationManager.translateFile(activeEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No active file to translate');
        }
    });

    // Register translate large file command
    let translateLargeFileDisposable = vscode.commands.registerCommand('i18n-nexus.translateLargeFile', () => {
        logger.log('Translate large file command triggered');
        if (!chunkedTranslationManager) {
            vscode.window.showErrorMessage('Chunked translation manager not initialized. Please check your configuration.');
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            chunkedTranslationManager.translateLargeFile(activeEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No active file to translate');
        }
    });

    // Register cancel translation command
    let cancelTranslationDisposable = vscode.commands.registerCommand('i18n-nexus.cancelTranslation', () => {
        logger.log('Cancel translation command triggered');
        if (chunkedTranslationManager && chunkedTranslationManager.isActive()) {
            chunkedTranslationManager.cancelTranslation();
            vscode.window.showInformationMessage('Translation cancelled');
        } else {
            vscode.window.showInformationMessage('No active translation to cancel');
        }
    });


    // Register open settings command
    let openSettingsDisposable = vscode.commands.registerCommand('i18n-nexus.openSettings', () => {
        logger.log('Open settings command triggered');
        vscode.commands.executeCommand('workbench.action.openSettings', 'i18nNexus');
    });

    // Add newly registered commands to context.subscriptions
    context.subscriptions.push(
        translateCurrentFileDisposable,
        translateLargeFileDisposable,
        cancelTranslationDisposable,
        openSettingsDisposable
    );

    logger.log('All commands registered and added to subscriptions');

    vscode.window.showInformationMessage('i18n Nexus has been successfully activated');
}

// This function is called when the extension is deactivated
export function deactivate() {
    console.log('i18n Nexus is being deactivated');
}
