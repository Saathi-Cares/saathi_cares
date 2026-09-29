import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']),
  // temporary: repaired and re-included in Task 10
  globalIgnores(['src/components/sections/**', 'src/components/layout/**']),
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // PLAN.md §7: the backend never imports UI or client-only code.
    files: ['src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/components/*',
                '@/hooks/*',
                'react',
                'react-dom',
                'next/navigation',
                'next/link',
                'next/image',
              ],
              message: 'src/server must not import UI or client code (PLAN.md §7).',
            },
          ],
        },
      ],
    },
  },
  {
    // UI never reaches into the backend.
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/server/*'], message: 'Components must not import the server layer (PLAN.md §7).' },
          ],
        },
      ],
    },
  },
]);
