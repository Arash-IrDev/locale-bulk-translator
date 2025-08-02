// The vscode module contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in the code below
import * as vscode from 'vscode';
import { StreamingTranslationManager } from './streamingTranslationManager';
import { LanguageSelector } from './languageSelector';
import { ModelConfigurator } from './modelConfigurator';
import { Logger, LogLevel, LogCategory } from './logger';
// This method is called when the extension is activated for the first time
export function activate(context: vscode.ExtensionContext) {
    const channel = vscode.window.createOutputChannel('i18n Nexus');
    const logger = new Logger(channel);
    logger.log('i18n Nexus activation started');

    // Helper function to validate translation file
    function isValidTranslationFile(filePath: string): boolean {
        return !filePath.includes('extension-output') && 
               !filePath.includes('i18n Nexus') && 
               filePath.endsWith('.json');
    }

    // Initialize managers without API key validation during activation
    let streamingTranslationManager: StreamingTranslationManager | undefined;
    let modelConfigurator: ModelConfigurator | undefined;
    
    try {
        streamingTranslationManager = new StreamingTranslationManager(logger, channel);
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

    // Add new logging commands
    let setLogLevelDisposable = vscode.commands.registerCommand('i18n-nexus.setLogLevel', async () => {
        const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
        const selected = await vscode.window.showQuickPick(levels, {
            placeHolder: 'Select log level'
        });
        
        if (selected) {
            const level = LogLevel[selected as keyof typeof LogLevel];
            logger.setLogLevel(level);
            vscode.window.showInformationMessage(`Log level set to: ${selected}`);
        }
    });

    let toggleProviderLogsDisposable = vscode.commands.registerCommand('i18n-nexus.toggleProviderLogs', () => {
        logger.toggleCategory(LogCategory.PROVIDER);
        const status = logger.isCategoryEnabled(LogCategory.PROVIDER) ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Provider logs ${status}`);
    });

    let toggleStructureLogsDisposable = vscode.commands.registerCommand('i18n-nexus.toggleStructureLogs', () => {
        logger.toggleCategory(LogCategory.STRUCTURES);
        const status = logger.isCategoryEnabled(LogCategory.STRUCTURES) ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Structure logs ${status}`);
    });

    let toggleApiLogsDisposable = vscode.commands.registerCommand('i18n-nexus.toggleApiLogs', () => {
        logger.toggleCategory(LogCategory.API_LOGS);
        const status = logger.isCategoryEnabled(LogCategory.API_LOGS) ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`API logs ${status}`);
    });

    context.subscriptions.push(
        configureModelDisposable,
        toggleDebugOutputDisposable,
        setLogLevelDisposable,
        toggleProviderLogsDisposable,
        toggleStructureLogsDisposable,
        toggleApiLogsDisposable
    );

    // Register streaming translation command
    let streamingTranslationDisposable = vscode.commands.registerCommand('i18n-nexus.streamingTranslation', () => {
        logger.log('Streaming translation command triggered');
        if (!streamingTranslationManager) {
            vscode.window.showErrorMessage('Streaming translation manager not initialized. Please check your configuration.');
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const filePath = activeEditor.document.uri.fsPath;
            if (!isValidTranslationFile(filePath)) {
                vscode.window.showErrorMessage('Please select a valid translation JSON file. Output channels and non-JSON files cannot be translated.');
                return;
            }
            streamingTranslationManager.translateLargeFileStreaming(activeEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No active file to translate');
        }
    });

    // Register cancel translation command
    let cancelTranslationDisposable = vscode.commands.registerCommand('i18n-nexus.cancelTranslation', () => {
        logger.log('Cancel translation command triggered');
        let cancelled = false;
        
        if (streamingTranslationManager && streamingTranslationManager.isActive()) {
            streamingTranslationManager.cancelTranslation();
            cancelled = true;
        }
        
        if (cancelled) {
            vscode.window.showInformationMessage('Translation cancelled');
        } else {
            vscode.window.showInformationMessage('No active translation to cancel');
        }
    });

    // Register Accept All Changes command
    let acceptAllChangesDisposable = vscode.commands.registerCommand('i18n-nexus.acceptAllChanges', () => {
        logger.log('Accept all changes command triggered');
        if (streamingTranslationManager) {
            streamingTranslationManager.acceptAllChanges();
        }
    });

    // Register open settings command
    let openSettingsDisposable = vscode.commands.registerCommand('i18n-nexus.openSettings', () => {
        logger.log('Open settings command triggered');
        vscode.commands.executeCommand('workbench.action.openSettings', 'i18nNexus');
    });

    // Add newly registered commands to context.subscriptions
    context.subscriptions.push(
        streamingTranslationDisposable,
        cancelTranslationDisposable,
        acceptAllChangesDisposable,
        openSettingsDisposable
    );

    logger.log('All commands registered and added to subscriptions');

    vscode.window.showInformationMessage('i18n Nexus has been successfully activated');
}

// This function is called when the extension is deactivated
export function deactivate() {
    console.log('i18n Nexus is being deactivated');
}
