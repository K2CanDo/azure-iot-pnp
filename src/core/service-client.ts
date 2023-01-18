import { IdentityManager } from '@identity';
import { EnvVariable, getEnv } from '@util/environment';
import { DigitalTwinClient, IoTHubTokenCredentials, Registry, Twin } from 'azure-iothub';
import { ServiceClientOptions } from './service-client-options';

export class ServiceClient {

  private constructor(
    public readonly deviceId: string,
    private readonly registry: Registry,
    private readonly dtClient: DigitalTwinClient,
    private readonly identityManager: IdentityManager,
  ) {
  }

  static async create(deviceId: string, options?: Partial<ServiceClientOptions>): Promise<ServiceClient> {
    const connectionString = options?.connectionString ?? getEnv(EnvVariable.AzureIotHubConnectionString);

    const registry = await Registry.fromConnectionString(connectionString);
    const dtClient = new DigitalTwinClient(new IoTHubTokenCredentials(connectionString));
    const identityManager = options?.identityManager ?? new IdentityManager();

    return new ServiceClient(deviceId, registry, dtClient, identityManager);
  }

  async getTwin(): Promise<Twin> {
    const { responseBody: twin } = await this.registry.getTwin(this.deviceId);

    return twin;
  }

  async setDesiredState<T extends Record<string, any>>(update: T): Promise<void> {
    const twin = await this.getTwin();

    await twin.update({
      properties: {
        desired: update,
      },
    });
  };

  async invokeComponentCommand<T = any>(componentKey: string, commandName: string, data: T): Promise<void> {
    await this.dtClient.invokeComponentCommand(this.deviceId, componentKey, commandName, data);
  }

  async removeDevice(): Promise<void> {
    try {
      await this.registry.delete(this.deviceId);
    } catch {
      // do nothing if device could not be found
    }
  }

  async removeDeviceIdentity(): Promise<void> {
    await this.removeDevice();
    await this.identityManager.removeDeviceDir(this.deviceId);
  }
}
