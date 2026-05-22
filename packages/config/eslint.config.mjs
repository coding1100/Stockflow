import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat ESLint config. Apps/packages re-export this and append framework
 * plugins (e.g. Next.js) as needed.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
);
