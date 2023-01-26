import { BlockBlobParallelUploadOptions } from '@azure/storage-blob';
import { BlobUploadStatus, DeviceClient, DeviceTwinModel, PropertyChangeHandler, WritablePropertyChangeHandler } from '@core';
import { normalizeComponentState } from '@util/helpers';
import { TELEMETRY_COMPONENT_MARKER_KEY } from '@util/markers';
import { DeviceMethodRequest, DeviceMethodResponse } from 'azure-iot-device/dist/device_method';
import debug from 'debug';
import { basename } from 'path';
import { WritableProperty, WritablePropertyAckPatch } from './writable-property';

const log = debug(basename(__filename));

export interface PnPComponentState {
  [propertyKey: string]: WritableProperty | number | string | PnPComponentState;
}

export type PnPComponentConstructor<T extends PnPComponent<PnPComponentState>> =
  new(deviceClient: DeviceClient<DeviceTwinModel>) => T;

export interface FileUploadOptions extends BlockBlobParallelUploadOptions {
  fileName?: string;
}

/**
 * Base-class encapsulating azure iot plug and play specific functionality
 *
 * @see https://whdentalwerk.atlassian.net/wiki/spaces/DIS/pages/38443024402/PnP+Components
 */
export abstract class PnPComponent<T extends PnPComponentState> {
  protected constructor(
    public readonly deviceClient: DeviceClient<{ [componentKey: string]: T }>,
    public readonly componentKey: string,
    public readonly writeableProperties: string[] = [],
  ) {
  }

  /**
   * Add a handler to react on changes to the component state in general.
   * The handler's return value has no impact on property reporting whatsoever
   */
  onComponentChange(changeHandler: PropertyChangeHandler<Partial<T>>): void {
    log(`[info|${ this.componentKey }] Setup property component change handler for component ${ this.componentKey }`);
    this.deviceClient.addComponentChangeHandler(this.componentKey, changeHandler);
  }

  /**
   * Add a handler to react on component property changes.
   * If the handler returns an {@link WritablePropertyAckPatch} it will be used as
   * or incorporated in the property ack sent back to the service.
   */
  onWritablePropertyChange<Prop = any>(propertyKey: string, changeHandler: WritablePropertyChangeHandler<Prop>): void {
    log(`[info|${ this.componentKey }] Setup property change handler for writable property ${ propertyKey } on component ${ this.componentKey }`);
    this.deviceClient.addComponentPropertyChangeHandler(this.componentKey, propertyKey, changeHandler);
  }

  /**
   * Sends a telemetry message with the given type and payload.
   */
  async sendTelemetry<Payload = Record<string, unknown> | string>(type: string, payload?: Payload): Promise<void> {
    log(`[info|${ this.componentKey }] Send telemetry '${ type }'${
      payload
        ? 'with content ' + JSON.stringify(payload)
        : ''
    }`);
    await this.deviceClient.sendTelemetry({ type, payload });
  }

  /**
   * Sends a component-related telemetry message with the given type and payload
   */
  async sendComponentTelemetry<Payload = Record<string, unknown> | string>(type: string, payload?: Payload): Promise<void> {
    const properties = {
      // To associate telemetry with a component it needs to carry this marker
      [TELEMETRY_COMPONENT_MARKER_KEY]: this.componentKey,
    };

    log(`[info|${ this.componentKey }] Send component telemetry '${ type }'${
      payload
        ? 'with content ' + JSON.stringify(payload)
        : ''
    }`);
    await this.deviceClient.sendTelemetry({ type, payload, properties });
  }

  /**
   * Reports the component's state
   */
  async reportState(dataOrUpdate: Partial<T> | WritablePropertyAckPatch | ((currentState: T) => Partial<T> | WritablePropertyAckPatch)): Promise<void> {
    if (typeof dataOrUpdate === 'function') {
      log(`[info|${ this.componentKey }] Retrieve state to execute updating function`);
      const state = await this.getReportedState();
      const data = dataOrUpdate(state);
      log(`[info|${ this.componentKey }] Report properties: ${ JSON.stringify(data) }`);
      return this.deviceClient.reportComponentProperties(this.componentKey, data);
    }

    log(`[info|${ this.componentKey }] Report properties: ${ JSON.stringify(dataOrUpdate) }`);
    return this.deviceClient.reportComponentProperties(this.componentKey, dataOrUpdate);
  }

  /**
   * Fetches the currently reported component state
   */
  async getReportedState(): Promise<T | null> {
    const reportedProps = await this.deviceClient.getReportedProperties();
    return reportedProps[this.componentKey]
      ? normalizeComponentState<T>(reportedProps[this.componentKey])
      : null;
  }

  /**
   * Fetches the currentyl reported component state
   */
  async getDesiredState(): Promise<Partial<T | null>> {
    const desiredProps = await this.deviceClient.getDesiredProperties();
    return desiredProps[this.componentKey]
      ? normalizeComponentState<T>(desiredProps[this.componentKey])
      : null;
  }

  /**
   * Clears the component state e.g. completely removing the component property from the device twin
   */
  async clear(): Promise<void> {
    log(`[info|${ this.componentKey }] Clear reported properties`);

    return this.deviceClient.reportProperties({ [this.componentKey]: null });
  }

  uploadFile(filePath: string, options: FileUploadOptions = {}): Promise<BlobUploadStatus> {
    const { fileName, ...blockBlobOptions } = options;
    const blobName = fileName ?? basename(filePath);

    return this.deviceClient.upload(filePath, blobName, blockBlobOptions);
  }

  /**
   * Register a command handler
   */
  onCommand(
    commandName: string,
    callback: (request: DeviceMethodRequest, response: DeviceMethodResponse) => void,
  ): void {
    log(`[info|${ this.componentKey }] Register component command: ${ commandName }`);
    this.deviceClient.onCommand(commandName, callback);
  }

  /**
   * Register a component command handler
   */
  onComponentCommand(
    commandName: string,
    callback: (request: DeviceMethodRequest, response: DeviceMethodResponse) => void,
  ): void {
    const componentCommandName = `${ this.componentKey }*${ commandName }`;
    log(`[info|${ this.componentKey }] Register component command: ${ componentCommandName }`);
    // Commands defined on components are prefixed with the component name followed by an asterisk
    return this.onCommand(componentCommandName, callback);
  }
}
