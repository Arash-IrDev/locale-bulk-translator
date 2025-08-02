import * as vscode from 'vscode';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export enum LogCategory {
    SYSTEM = 'SYSTEM',
    TRANSLATION = 'TRANSLATION',
    PROVIDER = 'PROVIDER',
    UI = 'UI',
    STRUCTURES = 'STRUCTURES'
}

export class Logger {
    private logLevel: LogLevel = LogLevel.INFO;
    private enabledCategories: Set<LogCategory> = new Set([
        LogCategory.SYSTEM,
        LogCategory.TRANSLATION,
        LogCategory.STRUCTURES
    ]);
    private outputChannel: vscode.OutputChannel;

    constructor(channel: vscode.OutputChannel) {
        this.outputChannel = channel;
    }

    // Main logging methods
    public error(message: string, error?: any, category: LogCategory = LogCategory.SYSTEM): void {
        this.logInternal(LogLevel.ERROR, category, message);
        if (error) {
            this.outputChannel.appendLine(`ERROR DETAILS: ${error.toString()}`);
        }
    }

    public warn(message: string, category: LogCategory = LogCategory.SYSTEM): void {
        this.logInternal(LogLevel.WARN, category, message);
    }

    public info(message: string, category: LogCategory = LogCategory.SYSTEM): void {
        this.logInternal(LogLevel.INFO, category, message);
    }

    public debug(message: string, category: LogCategory = LogCategory.SYSTEM): void {
        this.logInternal(LogLevel.DEBUG, category, message);
    }

    public trace(message: string, category: LogCategory = LogCategory.SYSTEM): void {
        this.logInternal(LogLevel.TRACE, category, message);
    }

    // Legacy method for backward compatibility
    public log(message: string): void {
        this.info(message);
    }

    // Structure logging (always shown when enabled)
    public logStructures(message: string): void {
        if (this.enabledCategories.has(LogCategory.STRUCTURES)) {
            this.outputChannel.appendLine(message);
        }
    }

    // Provider logging (controlled by category)
    public logProvider(message: string): void {
        this.debug(message, LogCategory.PROVIDER);
    }

    // Translation logging (controlled by category)
    public logTranslation(message: string): void {
        this.info(message, LogCategory.TRANSLATION);
    }

    // Private logging method
    private logInternal(level: LogLevel, category: LogCategory, message: string): void {
        if (level <= this.logLevel && this.enabledCategories.has(category)) {
            const prefix = this.getLevelPrefix(level);
            const formattedMessage = `${prefix}[${category}] ${message}`;
            
            if (level <= LogLevel.WARN) {
                console.log(formattedMessage);
            }
            this.outputChannel.appendLine(formattedMessage);
        }
    }

    private getLevelPrefix(level: LogLevel): string {
        switch (level) {
            case LogLevel.ERROR: return '❌ ERROR';
            case LogLevel.WARN: return '⚠️  WARN';
            case LogLevel.INFO: return 'ℹ️  INFO';
            case LogLevel.DEBUG: return '🔍 DEBUG';
            case LogLevel.TRACE: return '🔬 TRACE';
            default: return 'ℹ️  INFO';
        }
    }

    // Configuration methods
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.info(`Log level set to: ${LogLevel[level]}`, LogCategory.SYSTEM);
    }

    public getLogLevel(): LogLevel {
        return this.logLevel;
    }

    public enableCategory(category: LogCategory): void {
        this.enabledCategories.add(category);
        this.info(`Log category enabled: ${category}`, LogCategory.SYSTEM);
    }

    public disableCategory(category: LogCategory): void {
        this.enabledCategories.delete(category);
        this.info(`Log category disabled: ${category}`, LogCategory.SYSTEM);
    }

    public toggleCategory(category: LogCategory): void {
        if (this.enabledCategories.has(category)) {
            this.disableCategory(category);
        } else {
            this.enableCategory(category);
        }
    }

    // Legacy methods for backward compatibility
    public toggleDebugOutput(): void {
        if (this.logLevel === LogLevel.DEBUG) {
            this.setLogLevel(LogLevel.INFO);
        } else {
            this.setLogLevel(LogLevel.DEBUG);
        }
    }

    public isDebugEnabled(): boolean {
        return this.logLevel >= LogLevel.DEBUG;
    }

    // Utility methods
    public getEnabledCategories(): LogCategory[] {
        return Array.from(this.enabledCategories);
    }

    public isCategoryEnabled(category: LogCategory): boolean {
        return this.enabledCategories.has(category);
    }
}