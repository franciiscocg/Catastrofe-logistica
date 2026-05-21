import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_DIR = resolve(__dirname, '.').replace(/\\/g, '/')

export default {
  test: {
    environment: 'node',
    globals: true,
    include: [`${TEST_DIR}/frontend/**/*.test.ts`],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
}
