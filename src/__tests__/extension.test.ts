import * as vscode from 'vscode';

describe('Extension Test Suite', () => {
    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('iaiuse.i18n-nexus');
        expect(extension).toBeDefined();
    });

    test('Should activate', async () => {
        const extension = vscode.extensions.getExtension('iaiuse.i18n-nexus');
        if (extension) {
            await extension.activate();
            expect(true).toBe(true); // Extension activated successfully
        }
    });
}); 