import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,

  {
    // اعمال قوانین روی تمام فایل‌های تی‌اس و جی‌اس پروژه بدون درگیری با ری‌اکت
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: [
      'apps/web/.next/**',
      'dist/**',
      'node_modules/**',
      '**/*.config.ts',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  }
);
