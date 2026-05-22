import shared from './packages/config/eslint.config.mjs';

/** Root flat config — ESLint walks up to here for every package. */
export default [
  ...shared,
  { ignores: ['**/.next/**', '**/dist/**', '**/node_modules/**', '**/prisma/migrations/**'] },
];
