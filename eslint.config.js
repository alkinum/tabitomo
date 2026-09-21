import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', '**/node_modules/**', 'output/**', 'test-results/**', 'playwright-report/**', 'apps/mobile/ios/**', 'apps/mobile/.expo/**'],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}', 'e2e/**/*.ts', 'apps/mobile/plugins/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/mobile/plugins/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': ['error', { allow: ['\\.png$'] }],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: [
      '*.config.js',
      '*.config.ts',
      'tailwind.config.js',
      'postcss.config.js',
      'vite.config.ts',
      'playwright.config.ts',
      'pwa-assets.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
