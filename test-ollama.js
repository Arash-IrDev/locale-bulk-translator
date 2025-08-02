const axios = require('axios');

async function testOllamaConnection() {
    console.log('Testing Ollama connection...');
    
    try {
        const response = await axios.post('http://localhost:11434/v1/chat/completions', {
            model: 'gemma3:4b',
            messages: [{
                role: 'user',
                content: 'Hello! Please respond with "Ollama is working!"'
            }],
            stream: false,
            options: {
                temperature: 0.1,
                top_p: 0.9
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log('✅ Ollama connection successful!');
        console.log('Response:', response.data.choices[0].message.content);
        return true;
    } catch (error) {
        console.log('❌ Ollama connection failed!');
        console.log('Error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure Ollama is running:');
            console.log('   ollama serve');
        }
        
        if (error.response?.status === 404) {
            console.log('\n💡 Make sure the model is installed:');
            console.log('   ollama pull gemma3:4b');
        }
        
        return false;
    }
}

async function testTranslation() {
    console.log('\nTesting translation with Ollama...');
    
    try {
        const testContent = {
            "welcome": "Welcome to our application",
            "login": "Please login to continue",
            "logout": "Logout"
        };

        const response = await axios.post('http://localhost:11434/v1/chat/completions', {
            model: 'gemma3:4b',
            messages: [{
                role: 'user',
                content: `You are a professional translator. Translate the following JSON content to Persian. 

IMPORTANT RULES:
1. Maintain the exact JSON structure and keys
2. Only translate the values (the text content)
3. Keep all keys unchanged
4. Ensure the translation is culturally appropriate and uses common expressions in the target language
5. Return ONLY the translated JSON, no additional text or explanations

Content to translate:
${JSON.stringify(testContent, null, 2)}`
            }],
            stream: false,
            options: {
                temperature: 0.1,
                top_p: 0.9
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        console.log('✅ Translation test successful!');
        console.log('Original:', testContent);
        console.log('Translated:', response.data.choices[0].message.content);
        return true;
    } catch (error) {
        console.log('❌ Translation test failed!');
        console.log('Error:', error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Ollama Integration Test\n');
    
    const connectionOk = await testOllamaConnection();
    
    if (connectionOk) {
        await testTranslation();
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Open VS Code');
    console.log('2. Press Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)');
    console.log('3. Type "I18n Nexus: Configure AI Model"');
    console.log('4. Select "ollama" as provider');
    console.log('5. Set model to "gemma3:4b"');
    console.log('6. Set API URL to "http://localhost:11434/v1/chat/completions"');
    console.log('7. Leave API Key empty');
    console.log('8. Start translating your JSON files!');
}

main().catch(console.error); 