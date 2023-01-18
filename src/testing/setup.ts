import { DeviceClient, DeviceTwinModel, ServiceClient } from '@core';
import { IdentityManager, IdentityManagerOptions, setupFromEnv } from '@identity';

export type DeviceTestingDeps<T extends DeviceTwinModel = any> = [
  DeviceClient<T>,
  ServiceClient,
  IdentityManager,
];

export const setupTestingDeps = async <T extends DeviceTwinModel = any>(
  deviceId: string,
  modelId: string,
  identityManagerOverrides?: Partial<IdentityManagerOptions>,
): Promise<DeviceTestingDeps<T>> => {
  const identityManager = setupFromEnv(identityManagerOverrides);
  const deviceClient = await DeviceClient.create<T>(deviceId, modelId, { identityManager });
  const serviceClient = await ServiceClient.create(deviceId, { identityManager });

  return [
    deviceClient,
    serviceClient,
    identityManager,
  ];
};
