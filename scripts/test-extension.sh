#!/bin/bash

# Test script for i18n Nexus Extension
echo "🧪 Starting i18n Nexus Extension Test..."

# Check if VS Code is installed
if ! command -v code &> /dev/null; then
    echo "❌ VS Code CLI not found. Please install it first:"
    echo "   In VS Code: Cmd+Shift+P -> 'Shell Command: Install code command in PATH'"
    exit 1
fi

# Compile the extension
echo "📦 Compiling extension..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

echo "✅ Compilation successful!"

# Check if test project exists
if [ ! -d "test-project" ]; then
    echo "❌ Test project not found!"
    exit 1
fi

echo "📁 Test project found"

# Instructions for manual testing
echo ""
echo "🚀 Manual Testing Instructions:"
echo "================================"
echo ""
echo "1. Open VS Code and press F5 to start Development Host"
echo "2. In the new window, open the 'test-project' folder"
echo "3. Configure your API key:"
echo "   - Cmd+Shift+P -> 'i18n Nexus: Configure AI Model'"
echo "   - Enter your OpenAI API key"
echo ""
echo "4. Test the extension:"
echo "   - Cmd+Shift+P -> 'i18n Nexus: Translate Files'"
echo "   - Cmd+Shift+P -> 'i18n Nexus: Translate Current File'"
echo "   - Cmd+Shift+P -> 'Show i18n Nexus Configuration'"
echo ""
echo "5. Check the output channel for logs and errors"
echo ""
echo "📋 Test Checklist:"
echo "=================="
echo "□ Extension activates without errors"
echo "□ Commands appear in Command Palette"
echo "□ API key configuration works"
echo "□ Translation completes successfully"
echo "□ New locale files are created"
echo "□ Diff view shows changes"
echo "□ Error handling works properly"
echo ""
echo "🎯 Ready to test! Open VS Code and press F5" 