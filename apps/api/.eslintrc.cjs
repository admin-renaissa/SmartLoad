/* eslint-disable @typescript-eslint/no-require-imports */
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['../../.eslintrc.base.js'],
  env: { es2022: true, node: true },
  ignorePatterns: ['dist/**', 'node_modules/**'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    'no-control-regex': 'off',
  },
}
