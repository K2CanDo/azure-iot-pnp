import type { Config } from 'jest';

const jestConfig: Config = {
  setupFiles: ['dotenv/config'],
  testMatch: ['**/(*.)+spec.(ts|js)?(x)'],
  transform: {
    '^.+\\.js$': 'jest-esm-transformer',
    '^.+\\.(ts|js|html)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testEnvironment: 'node',
  collectCoverage: true,
  coverageReporters: ['html'],
  displayName: 'IoT Device Lib',
  testTimeout: 60000,
};

export default jestConfig;
