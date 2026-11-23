import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'public', 'portal/dist', 'portal/public', 'kit/dist', 'kit/example/dist'] },
    {
        files: ['**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
    {
        // Context modules export their provider together with its hook
        files: ['src/context/**/*.tsx', 'src/i18n/**/*.tsx', 'portal/src/PortalContext.tsx', 'portal/src/reference/ReferenceState.tsx'],
        rules: { 'react-refresh/only-export-components': 'off' },
    },
);
