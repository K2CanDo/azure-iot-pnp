module.exports = {
  extends: '../../.eslintrc.json',
  ignorePatterns: [
    '!**/*'
  ],
  overrides: [
    {
      files: [
        '*.ts'
      ],
      parserOptions: {
        project: ['tsconfig.lib.json'],
        tsconfigRootDir: __dirname,
        createDefaultProgram: true
      },
      plugins: [
        'eslint-plugin-react'
      ],
      rules: {
        '@typescript-eslint/member-ordering': [
          "error",
          {
            "classes": [
              "field",
              "static-method",
              "constructor",
              "method"
            ]
          }
        ],
        '@typescript-eslint/unified-signatures': 'off',
        '@typescript-eslint/consistent-type-definitions': 'error',
        '@typescript-eslint/dot-notation': 'off',
        '@typescript-eslint/explicit-member-accessibility': [
          'off',
          {
            accessibility: 'explicit'
          }
        ],
        '@typescript-eslint/no-empty-function': 'error',
        'arrow-parens': [
          'error',
          'as-needed'
        ],
        'brace-style': [
          'error',
          '1tbs'
        ],
        'id-blacklist': 'off',
        'id-match': 'off',
        'linebreak-style': 'off',
        'new-parens': 'off',
        'newline-per-chained-call': 'off',
        'no-empty': 'error',
        'no-extra-semi': 'off',
        'no-irregular-whitespace': 'off',
        'no-underscore-dangle': 'off',
        'quote-props': 'off',
        'react/jsx-curly-spacing': 'off',
        'react/jsx-equals-spacing': 'off',
        'react/jsx-wrap-multilines': 'off',
        'space-before-function-paren': 'off',
        'space-in-parens': [
          'off',
          'never'
        ]
      }
    },
    {
      files: [
        '*.html'
      ],
      rules: {}
    }
  ]
};
