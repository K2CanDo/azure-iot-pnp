import { AnonymousCredential, BlobUploadCommonResponse, BlockBlobClient, BlockBlobParallelUploadOptions, newPipeline, Pipeline, } from '@azure/storage-blob';
import { DeviceIdentity, IdentityManager } from '@identity';
import { Client, Message, Twin } from 'azure-iot-device';
import { clientFromConnectionString } from 'azure-iot-device-mqtt';
import { DeviceMethodRequest, DeviceMethodResponse } from 'azure-iot-device/dist/device_method';
import { ProvisioningDeviceClient, RegistrationResult } from 'azure-iot-provisioning-device';
import { Mqtt as ProvisioningProtocol } from 'azure-iot-provisioning-device-mqtt';
import { X509Security } from 'azure-iot-security-x509';
import debug from 'debug';
import { basename } from 'path';
import { Observable, ReplaySubject } from 'rxjs';
import type { BlobUploadStatus } from './blob-upload-status';
import { NoModelIdAssignedError } from './errors';
import { filterTwinMeta } from './helpers';
import { TWIN_COMPONENT_MARKER, TWIN_VERSION_KEY } from './markers';
import { PnPComponent, PnPComponentConstructor, PnPComponentState } from './pnp-component';
import type { Telemetry } from './telemetry';
import { WritableProperty, WritablePropertyAckPatch } from './writable-property';

const log = debug(basename(__filename));

export type WritablePropertyChangeHandler<T = any> = (
  delta: Partial<T>,
  version: number,
) => Promise<void> | void | Partial<WritableProperty> | Promise<Partial<WritableProperty>>;

export type PropertyChangeHandler<T = any> = (
  delta: Partial<T>,
  version: number,
) => Promise<void> | void;

export type TwinSection = Record<string, unknown>;

export interface TwinComponent extends TwinSection {
  [propertyKey: string]: WritableProperty | number | string | TwinSection;
}

export interface DeviceTwinModel {
  [componentKey: string]: TwinComponent | TwinSection;
}

const DEFAULT_CONNECTION_RETRIES = 3;
const DEFAULT_MESSAGE_TYPE_ID = 'x-message-type';

export interface DeviceClientMeta {
  messageTypeIdentifier: string;
}

export interface DeviceClientOptions {
  /**
   * Reference to the {@link IdentityManager} used with this {@link DeviceClient} instance
   */
  identityManager?: IdentityManager;
  /**
   * Number of retries when trying to connect to the IoT Hub Provisioning Service and IoT Hub instance
   */
  connectionRetries?: number;
  meta?: DeviceClientMeta;
}

const DEFAULT_DEVICE_CLIENT_OPTIONS: DeviceClientOptions = {
  meta: {
    messageTypeIdentifier: DEFAULT_MESSAGE_TYPE_ID,
  }
};

const retry = (promise: Promise<any>, retries: number = DEFAULT_CONNECTION_RETRIES) => {
  const retryHandler = (currentRetry: number, totalRetries: number) => (error: Error) => {
    log(`[static create|error] Attempt ${ currentRetry }/${ totalRetries } - Error occurred when creating device instance: %o`, error);
    return promise;
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    promise.catch(retryHandler(attempt, retries));
  }

  return promise;
};

/**
 * Device client to communicate with IoDent
 */
export class DeviceClient<DeviceModel extends DeviceTwinModel> {
  identity: DeviceIdentity = null;
  identityManager: IdentityManager;
  readonly options: Omit<DeviceClientOptions, 'identityManager'>;
  #client: Client;
  #twin: Twin;
  #connected$ = new ReplaySubject<void>(1);
  #disconnected$ = new ReplaySubject<Error | void>(1);
  #message$ = new ReplaySubject<string>(1);
  #error$ = new ReplaySubject<Error>(1);
  #desiredPropsVersion$ = new ReplaySubject<number>(1);
  #components = new Map<string, PnPComponent<any>>();
  #propertyChangeHandlers = new Map<string, WritablePropertyChangeHandler>();

  private constructor(public deviceId: string, public modelId: string, options: DeviceClientOptions) {
    const { identityManager, ...opts } = options;
    this.identityManager = identityManager;
    this.options = {
      ...DEFAULT_DEVICE_CLIENT_OPTIONS,
      ...opts,
    };
  }

  /**
   * The DeviceTwin's current desired properties version
   */
  get desiredPropsVersion$(): Observable<number> {
    return this.#desiredPropsVersion$.asObservable();
  }

  /**
   * Stream of errors occurring during the connection
   */
  get error$(): Observable<Error> {
    return this.#error$.asObservable();
  }

  /**
   * Stream that emits upon connection to the IoT Hub
   */
  get connected$(): Observable<void> {
    return this.#connected$.asObservable();
  }

  /**
   * Stream that emits upon disconnect from the IoT Hub
   */
  get disconnected$(): Observable<Error | void> {
    return this.#disconnected$.asObservable();
  }

  /**
   * Creates an instance of {@link DeviceClient} and automatically provisions and connects it to the Azure IoT Hub
   *
   * @param deviceId  Unique identifier of the device (Contains the company specific prefix)
   * @param modelId   Full identifier of the model to use for azure iot plug and play
   * @param options   Options passed to the {@link DeviceClient } constructor
   */
  static async create<T extends DeviceTwinModel>(
    deviceId: string,
    modelId: string,
    options: DeviceClientOptions,
  ): Promise<DeviceClient<T>> {
    log('[static create|info] Create device client with deviceId %s and modelId %s', deviceId, modelId);

    const instance = new DeviceClient<T>(deviceId, modelId, options);
    await retry(instance.connect(), options.connectionRetries ?? DEFAULT_CONNECTION_RETRIES);

    return instance;
  }

  /**
   * Registers and initializes a PnP component with the device client
   *
   * @param componentCtor Constructor of the PnPComponent
   */
  registerComponent<C extends PnPComponent<PnPComponentState>>(componentCtor: PnPComponentConstructor<C>): C {
    if (!this.modelId) {
      throw new NoModelIdAssignedError(this.deviceId);
    }

    const instance = new componentCtor(this);

    this.#components.set(instance.componentKey, instance);

    return instance;
  }

  /**
   * Add a handler to react on pnp component property changes
   */
  addComponentPropertyChangeHandler(componentKey: string, propertyKey: string, handler: WritablePropertyChangeHandler): void {
    this.#propertyChangeHandlers.set(`${ componentKey }|${ propertyKey }`, handler);
  }

  addComponentChangeHandler(componentKey: string, handler: PropertyChangeHandler): void {
    this.#propertyChangeHandlers.set(componentKey, handler);
  }

  /**
   * Report properties via the DeviceTwin
   */
  async reportProperties(updatePartial: Partial<any>): Promise<void> {
    return new Promise<void>((resolve, reject) =>
      this.#twin.properties.reported.update(updatePartial, err => {
        if (err) {
          return reject(err);
        }

        return resolve();
      }),
    );
  }

  /**
   * Clears all reported properties from the DeviceTwin
   *
   * @param filterPredicate
   */
  async clearReportedProperties(filterPredicate: (key: string) => boolean = () => true): Promise<void> {
    const twinState = await this.getReportedProperties();

    const clearPartial = Object.keys(twinState)
      .filter(filterPredicate)
      .reduce((acc, key) => {
        acc[key] = null;
        return acc;
      }, {});

    await this.reportProperties(clearPartial);
  }

  async getReportedProperties(): Promise<DeviceModel> {
    this.#twin = await this.#client.getTwin();
    return Object.fromEntries(filterTwinMeta(this.#twin.properties.reported)) as DeviceModel;
  }

  /**
   * Returns the device's desired properties
   */
  async getDesiredProperties(): Promise<DeviceModel> {
    this.#twin = await this.#client.getTwin();
    return Object.fromEntries(filterTwinMeta(this.#twin.properties.desired)) as DeviceModel;
  }

  /**
   * Send telemetry data via IoT Hub
   *
   * @param telemetryDef Message definition
   */
  async sendTelemetry<T = Record<string, unknown> | string>(telemetryDef: Telemetry): Promise<void> {
    const message = this.#createMessage(telemetryDef);

    await this.#client.sendEvent(message);
  }

  onCommand(
    methodName: string,
    callback: (request: DeviceMethodRequest, response: DeviceMethodResponse) => void,
  ): void {
    this.#client.onDeviceMethod(methodName, callback);
  }

  /**
   * Report component-specific properties via DeviceTwin
   *
   * @param componentKey
   * @param componentPropUpdatePartial
   */
  async reportComponentProperties<T extends TwinComponent>(
    componentKey: keyof DeviceModel,
    componentPropUpdatePartial: Partial<T> | WritablePropertyAckPatch<T>,
  ): Promise<void> {
    return this.reportProperties({
      [componentKey]: {
        ...TWIN_COMPONENT_MARKER,
        ...componentPropUpdatePartial,
      },
    });
  }

  /**
   * Connect device to IoT Hub
   *
   * @param modelId Id of the PnP model to be used
   */
  async connect(modelId: string = this.modelId): Promise<void> {
    if (!this.#client) {
      log('[connect|info] No client instantiated yet');
      log('[connect|info] Generate device identity files');
      this.identity = await this.identityManager.generateDeviceIdentity(this.deviceId, modelId);

      log('[connect|info] Start provisioning device %s', this.deviceId);
      const connectionString = await this.#provision(modelId);

      log('[connect|info] Setup client with connectionString %s', connectionString);
      this.#client = await this.#setupClient(connectionString, modelId);

      this.#client.on('connect', () => this.#connected$.next());
      this.#client.on('disconnect', error => this.#disconnected$.next(error));
      this.#client.on('message', message => this.#message$.next(message));
      this.#client.on('error', error => this.#error$.next(error));

      log('[connect|info] Open client connection');
      await this.#client.open();
      this.#twin = await this.#client.getTwin();

      log('[connect|info] Setup Twin change handling');
      this.#twin.on('properties.desired', async (changes: Record<string, unknown> & { [TWIN_VERSION_KEY]: number }) => {
        const version = changes[TWIN_VERSION_KEY] as number;
        this.#desiredPropsVersion$.next(version);

        // Filter $version and component marker from changed properties
        const changedComponents = filterTwinMeta(changes);

        if (this.#components.size) {
          await this.#handleChangedComponentProperties(version, changedComponents);
        }
      });
    } else {
      log('[connect|info] Client already instantiated. Reuse and open connection.');
      await this.#client.setOptions({ modelId });
      await this.#client.open();
    }

    this.disconnected$.subscribe(() => this.connect(modelId));
  }

  /**
   * Disconnect device from IoT Hub
   */
  async disconnect(): Promise<void> {
    log('[disconnect|info] Disconnect client for device %s', this.deviceId);
    await this.#client.close(() => this.#disconnected$.next());
  }

  async upload(localFilePath: string, desiredBlobName: string, uploadOptions?: BlockBlobParallelUploadOptions): Promise<BlobUploadStatus> {
    log('[upload|info] Upload file %s to %s with options %j', localFilePath, desiredBlobName, uploadOptions);
    const blobInfo = await this.#client.getBlobSharedAccessSignature(desiredBlobName);

    const pipeline: Pipeline = newPipeline(new AnonymousCredential(), {
      retryOptions: { maxTries: 4 },
      keepAliveOptions: { enable: false },
    });

    const { hostName, containerName, blobName, sasToken } = blobInfo;
    const blobUrl = `https://${ hostName }/${ containerName }/${ blobName }${ sasToken }`;

    const blobClient = new BlockBlobClient(blobUrl, pipeline);

    let blobUploadStatus: BlobUploadStatus;

    try {
      const uploadStatus: BlobUploadCommonResponse = await blobClient.uploadFile(localFilePath, uploadOptions);

      blobUploadStatus = {
        success: true,
        statusCode: uploadStatus._response.status,
        description: `Successfully uploaded ${ desiredBlobName }`,
      };

    } catch (err) {
      blobUploadStatus = {
        success: false,
        statusCode: err.code,
        description: err.message,
      };
    }

    log('[upload|info] Notify blob upload status');
    await this.#client.notifyBlobUploadStatus(
      blobInfo.correlationId,
      blobUploadStatus.success,
      blobUploadStatus.statusCode,
      blobUploadStatus.description,
    );

    return blobUploadStatus;
  }

  /**
   * Provision device via Azure DPS
   *
   * @returns connectionString to the corresponding IoT Hub
   */
  async #provision(modelId?: string): Promise<string> {
    const securityClient = new X509Security(this.deviceId, this.identity);

    const provisioningDeviceClient = ProvisioningDeviceClient.create(
      this.identityManager.options.provisioningHost,
      this.identityManager.options.idScope,
      new ProvisioningProtocol(),
      securityClient,
    );

    if (modelId) {
      log('[provision|info] Set modelId %s', modelId);
      provisioningDeviceClient.setProvisioningPayload({ modelId });
    }

    const registrationResult: RegistrationResult = await new Promise((resolve, reject) => {
      provisioningDeviceClient.register((error, result) => {
        if (error) {
          return reject(error);
        } else if (!result) {
          reject(new Error('Could not connect'));
        }
        log('[provision|info] Successfully provisioned device %s: %j', this.deviceId, result);
        return resolve(result);
      });
    });

    return `HostName=${ registrationResult.assignedHub };DeviceId=${ registrationResult.deviceId };x509=true`;
  }

  /**
   * PnP conform desired property change handler.
   * Executes registered change handlers if present and returns respective IoT PnP conform objects.
   *
   * @private
   */
  async #handleChangedComponentProperties(version: number, changedComponents: [string, any][]) {
    for (const [componentKey, component] of this.#components.entries()) {
      const componentChangeHandler = this.#propertyChangeHandlers.get(componentKey);

      for (const [changedComponentKey, changedComponentPartial] of changedComponents) {
        // only react on changes to this very component
        if (changedComponentKey !== componentKey) {
          continue;
        }

        log('[#handleChangedComponentProperties|info] There is a component registered for an occured twin change [%s]', componentKey);
        if (componentChangeHandler) {
          await componentChangeHandler(changedComponentPartial, version);
        }

        const changedComponentProperties = filterTwinMeta(changedComponentPartial);

        for (const [propertyKey, propertyValue] of changedComponentProperties) {
          // Only acknowledge property change if it is defined as a writeable property
          if (component.writeableProperties.includes(propertyKey)) {
            // eslint-disable-next-line max-len
            log('[#handleChangedComponentProperties|info] Automatically handle writable property ack for property %s and value %s', propertyKey, propertyValue);
            const changeHandler = this.#propertyChangeHandlers.get(propertyKey);

            try {
              const result = changeHandler && (await changeHandler(propertyValue, version));
              log('[#handleChangedComponentProperties|info] Result of custom writable property change handler %j', result);

              const propertyChangeAckPatch: WritablePropertyAckPatch = {
                [propertyKey]: {
                  value: propertyValue,
                  ac: 200,
                  ad: `Successfully updated (${ propertyKey }) to (${ propertyValue })`,
                  av: version,
                  ...result,
                },
              };

              await this.reportComponentProperties(componentKey, propertyChangeAckPatch);
            } catch {
              const propertyChangeAckPatch: WritablePropertyAckPatch = {
                [propertyKey]: {
                  value: propertyValue,
                  ac: 400,
                  ad: `Updating (${ propertyKey }) state to (${ propertyValue }) failed`,
                  av: version,
                },
              };
              log('[#handleChangedComponentProperties|error] Property change of %s failed', propertyKey);
              await this.reportComponentProperties(componentKey, propertyChangeAckPatch);
            }
          }
        }
      }
    }
  }

  /**
   * Set up the client to communicate with the IoT Hub
   *
   * @private
   */
  async #setupClient(connectionString: string, modelId?: string): Promise<Client> {
    const client = clientFromConnectionString(connectionString);
    const { cert, key } = this.identity;

    await client.setOptions({
      cert,
      key,
      modelId,
    });

    return client;
  }

  /**
   * Create an IoDent telemetry conform message object
   *
   * @private
   */
  #createMessage = ({ type, payload, properties }: Telemetry): Message => {
    const message = new Message(JSON.stringify(payload ?? {})); // message must not be empty otherwise it will not be routed correctly

    // Necessary to be set explicitly to enable content based message routing in IoT Hub
    message.contentEncoding = 'utf-8';
    message.contentType = 'application/json';

    // set message-type property for routing
    message.properties.add(this.options.meta.messageTypeIdentifier, type);

    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        message.properties.add(key, value);
      }
    }

    return message;
  };
}
