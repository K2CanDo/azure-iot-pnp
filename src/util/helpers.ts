import { isWritablePropertyResponse } from '@pnp';
import { TWIN_COMPONENT_MARKER_KEY, TWIN_VERSION_KEY } from './markers';

/**
 * Concatenate a key-value tuple.
 */
export const combineSetting = ([key, value]: string[]): string => `${ key }=${ value }`;

/**
 * Filter DeviceTwin proprietary fields from the state json object.
 */
export const filterTwinMeta = (delta: any): [string, any][] =>
  Object.entries(delta || {})
    .filter(
      ([key]) =>
        key !== TWIN_VERSION_KEY
        && key !== TWIN_COMPONENT_MARKER_KEY
        && key !== 'update'
        && !key.startsWith('$'),
    );

/**
 * Filter pnp component marker and normalize writable property responses
 */
export const normalizeComponentState = <T = any>(delta: any): T =>
  Object.fromEntries(
    Object.entries(delta)
      .filter(
        ([key]) =>
          key !== TWIN_VERSION_KEY
          && key !== TWIN_COMPONENT_MARKER_KEY
          && key !== 'update',
      )
      .map(([key, value]) => [key, normalizeWritablePropertyAck(value)]),
  ) as T;

/**
 * Normalize writable property responses e.g. use the response value instead of the whole object.
 *
 * @param prop
 */
export const normalizeWritablePropertyAck = (prop: any): any => isWritablePropertyResponse(prop) ? prop.value : prop;

/**
 * Helper for optional property inclusion. Used with spread operator, e.g.
 * ```typescript
 * const hurr = 'durr';
 *
 * const obj = {
 *   foo: bar,
 *   ...optionalProp(hurr)
 * }
 * ```
 * The variable name is used as property key.
 *
 * @param prop
 */
export const optionalProp = (prop: unknown) => prop ? { prop } : {};
