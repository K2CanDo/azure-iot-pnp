export interface WritablePropertyAck<T = any> {
  value: T; // The value that was set
  ac: number; // Acknowledge status (http-status-codes)
  ad: string; // Acknowledge description
  av: number; // The deviceTwin version this acknowledgement is related to ($version)
}

export type WritableProperty<T = any> = T | WritablePropertyAck<T>;

export interface WritablePropertyAckPatch<T = any> {
  [property: string]: WritableProperty<T> | WritablePropertyAckPatch<T>;
}

export const isWritablePropertyResponse = (propertyValue: any): propertyValue is WritablePropertyAck =>
  typeof propertyValue === 'object'
  && 'ac' in propertyValue
  && 'ad' in propertyValue
  && 'av' in propertyValue
  && 'value' in propertyValue;

export const writablePropsContainerProp = '__writableProps';
const writablePropertyMap = new WeakMap<any, (string | symbol)[]>();
export const addWritableProps = (target: any, property: string | symbol) => {
  const props = writablePropertyMap.get(target) || [];

  props.push(property);

  writablePropertyMap.set(target, props);
};

export const writable: PropertyDecorator = (target, propertyKey) => {
  addWritableProps(target, propertyKey);
};
