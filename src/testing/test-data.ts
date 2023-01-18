import { default as cuid } from 'cuid';

/**
 * Generate a random deviceId for use in test-cases
 */
export const generateDeviceId = (prefix?: string): string => (prefix ? `${ prefix }-` : '') + cuid();
