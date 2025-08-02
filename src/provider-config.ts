export interface ProviderConfig {
    name: string;
    defaultApiUrl: string;
    requiresApiKey: boolean;
    defaultModel: string;
    availableModels: string[];
    description: string;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    'openai': {
        name: 'OpenAI',
        defaultApiUrl: 'https://api.openai.com/v1',
        requiresApiKey: true,
        defaultModel: 'gpt-4o-mini',
        availableModels: [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'gpt-4',
            'gpt-3.5-turbo'
        ],
        description: 'OpenAI GPT models (GPT-4, GPT-3.5)'
    },
    'gemini': {
        name: 'Gemini',
        defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        requiresApiKey: true,
        defaultModel: 'gemini-1.5-flash',
        availableModels: [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro'
        ],
        description: 'Google Gemini models'
    },
    'claude': {
        name: 'Claude',
        defaultApiUrl: 'https://api.anthropic.com/v1',
        requiresApiKey: true,
        defaultModel: 'claude-3-5-sonnet-20241022',
        availableModels: [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ],
        description: 'Anthropic Claude models'
    },
    'openai-compatible': {
        name: 'OpenAI Compatible',
        defaultApiUrl: 'https://api.openai.com/v1',
        requiresApiKey: true,
        defaultModel: 'gpt-4o',
        availableModels: [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'gpt-4',
            'gpt-3.5-turbo'
        ],
        description: 'Any API compatible with OpenAI format'
    },
    'ollama': {
        name: 'Ollama',
        defaultApiUrl: 'http://localhost:11434/v1',
        requiresApiKey: false,
        defaultModel: 'gemma3:4b',
        availableModels: [
            'gemma3:4b',
            'gemma2:2b',
            'llama2:7b',
            'llama2:13b',
            'llama2:70b',
            'mistral:7b',
            'mistral:7b-instruct',
            'codellama:34b'
        ],
        description: 'Local LLMs via Ollama (Gemma, Llama, Mistral, etc.)'
    }
};

export function getProviderConfig(providerName: string): ProviderConfig | undefined {
    return PROVIDER_CONFIGS[providerName];
}

export function getAvailableProviders(): string[] {
    return Object.keys(PROVIDER_CONFIGS);
}

export function getProviderDefaultApiUrl(providerName: string): string {
    const config = getProviderConfig(providerName);
    return config?.defaultApiUrl || '';
}

export function getProviderDefaultModel(providerName: string): string {
    const config = getProviderConfig(providerName);
    return config?.defaultModel || '';
}

export function getProviderAvailableModels(providerName: string): string[] {
    const config = getProviderConfig(providerName);
    return config?.availableModels || [];
}

export function getProviderRequiresApiKey(providerName: string): boolean {
    const config = getProviderConfig(providerName);
    return config?.requiresApiKey || false;
} 