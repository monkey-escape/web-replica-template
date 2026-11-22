import { defineConfig } from 'vite-plus'

// 根配置只负责仓库级的格式、lint 和默认前端包。
// 应用自己的 dev / build 放在 apps/web/vite.config.ts。
export default defineConfig({
  defaultPackage: './apps/web',
  fmt: {
    singleQuote: true,
    semi: false,
  },
  lint: {
    plugins: ['typescript'],
    ignorePatterns: ['dist/**', 'temp/**', 'fixtures/**', 'pnpm-lock.yaml'],
    rules: {
      'no-console': 'off',
    },
    overrides: [
      {
        files: ['apps/api/**', 'scripts/**', 'tests/**', 'packages/**'],
        env: {
          node: true,
        },
      },
    ],
  },
  test: {
    include: ['packages/**/*.test.ts'],
  },
})
