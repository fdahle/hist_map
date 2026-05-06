import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: ['dist', 'build'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        __APP_DEBUG__: 'readonly',
        __APP_VERSION__: 'readonly',
        __BUILD_TIME__: 'readonly',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'warn',
      'vue/no-v-html': 'warn',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'indent': ['warn', 2, { SwitchCase: 1 }],
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'semi': ['warn', 'always'],
      'comma-dangle': ['warn', 'only-multiline'],
    },
  },
]
