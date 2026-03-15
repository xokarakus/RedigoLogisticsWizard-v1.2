module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2020: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2020
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'warn',
    'eqeqeq': ['warn', 'always'],
    'no-throw-literal': 'error'
  },
  ignorePatterns: ['webapp/', 'node_modules/', 'coverage/']
};
