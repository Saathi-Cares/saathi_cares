import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']),
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
      // PLAN.md §8.9: redaction sees only the object payload, so a value interpolated into the message escapes it.
      // Covers the message in both pino forms: log.info(`...`) and log.info({ ... }, `...`).
      'no-restricted-syntax': [
        'error',
        ...[
          'CallExpression[callee.property.name=/^(trace|debug|info|warn|error|fatal)$/] > TemplateLiteral.arguments:first-child[expressions.length>0]',
          'CallExpression[callee.property.name=/^(trace|debug|info|warn|error|fatal)$/] > TemplateLiteral.arguments:nth-child(2)[expressions.length>0]',
        ].map((selector) => ({
          selector,
          message: 'log the value as a field, never in the message text (PLAN.md §8.9)',
        })),
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
