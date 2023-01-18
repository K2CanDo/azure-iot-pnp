import { DeviceCertificateNotFoundError, DeviceIdentityCreationError, DevicePrivateKeyNotFoundError } from '@core';
import { EnvVariable, getEnv } from '@util/environment';
import { createDir, readFile, removeDir } from '@util/fs';
import { validateCertificate } from '@util/validation';
import debug from 'debug';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { z } from 'zod';
import { enrollCertificate, GeneratePrivateKeyOptionsSchema, getOneTimePasscode, } from './certs';
import { CsrConfigOptions, CsrConfigOptionsSchema } from './csr-config';
import { DeviceIdentity } from './device-identity';
import { ScepServerSchema } from './scep-server';

export const IdentityManagerOptionsSchema = z.object({
  certsDir: z.string(),
  idScope: z.string(),
  provisioningHost: z.string(),
  scepServer: ScepServerSchema,
  config: CsrConfigOptionsSchema.optional(),
}).merge(GeneratePrivateKeyOptionsSchema);

export type IdentityManagerOptions = z.infer<typeof IdentityManagerOptionsSchema>;

const defaultIdentityManagerOptions: IdentityManagerOptions = {
  scepServer: {
    certUrl: '',
    otpUrl: '',
    username: '',
    password: '',
  },
  idScope: '',
  certsDir: resolve(tmpdir(), 'certs'),
  keyLength: 2048,
  provisioningHost: 'global.azure-devices-provisioning.net',
};

export const setupFromEnv = (overrides: Partial<IdentityManagerOptions> = {}): IdentityManager => {
  const envOptions: Partial<IdentityManagerOptions> = {
    scepServer: {
      certUrl: getEnv(EnvVariable.ScepServerCertUrl),
      otpUrl: getEnv(EnvVariable.ScepServerOtpUrl),
      username: getEnv(EnvVariable.ScepUsername),
      password: getEnv(EnvVariable.ScepPassword),
    },
    config: {
      localityName: getEnv(EnvVariable.ScepCertLocalityName),
      organizationalUnitName: getEnv(EnvVariable.ScepCertOrganizationalUnitName),
      countryName: getEnv(EnvVariable.ScepCertCountryName),
    },
    provisioningHost: getEnv(EnvVariable.AzureProvisioningHost, defaultIdentityManagerOptions.provisioningHost),
    idScope: getEnv(EnvVariable.AzureProvisioningIdScope),
  };

  return new IdentityManager({
    ...defaultIdentityManagerOptions,
    ...envOptions,
    ...overrides,
  });
};

export class IdentityManager {
  log = debug(IdentityManager.name);
  options: IdentityManagerOptions;

  constructor(options: Partial<IdentityManagerOptions> = {}) {
    this.options = {
      ...defaultIdentityManagerOptions,
      ...options,
    };

    this.log('Options: %o', this.options);
  }

  /**
   * Generate certificate and key for the device with specified deviceId.
   * Certificate will be generated in <certsDir>/<deviceId>/<deviceId>.cer|key
   */
  async generateDeviceIdentity(deviceId: string, modelId: string): Promise<DeviceIdentity> {
    let cert;
    let key;

    try {
      cert = await this.getDeviceCertificate(deviceId);
      key = await this.getDeviceKey(deviceId);
      validateCertificate(cert);
    } catch {
      try {
        const passcode = await getOneTimePasscode(this.options.scepServer);
        const identity = await this.enrollIdentityCertificate(deviceId, passcode);

        key = identity.key;
        cert = identity.cert;
      } catch (error) {
        throw new DeviceIdentityCreationError(deviceId, error.message);
      }
    }

    return {
      deviceId,
      modelId,
      cert,
      key,
    };
  }

  async enrollIdentityCertificate(deviceId: string, passcode: string, csrConfig: CsrConfigOptions = this.options.config): Promise<DeviceIdentity> {
    try {
      const caDir = await this.createCaDir();
      const deviceDir = await this.createDeviceDir(deviceId);

      return enrollCertificate({
        deviceId,
        csrConfig: {
          ...csrConfig,
          passcode,
        },
        certUrl: this.options.scepServer.certUrl,
        caDir,
        outDir: deviceDir,
      });
    } catch (error) {
      throw new DeviceIdentityCreationError(deviceId, error.message);
    }
  }

  /**
   * Remove the directory that holds all certificates managed by the {@link IdentityManager} effectively wiping the whole manager.
   */
  removeCertsDir(): Promise<void> {
    return removeDir(this.options.certsDir);
  }

  /**
   * Get device certificate from the device-specific directory
   */
  async getDeviceCertificate(deviceId: string): Promise<string> {
    const certPath = join(this.options.certsDir, deviceId, `${ deviceId }.cer`);

    try {
      return readFile(certPath);
    } catch {
      throw new DeviceCertificateNotFoundError(deviceId);
    }
  };

  /**
   * Get device private key form the device-specific directory
   */
  async getDeviceKey(deviceId: string): Promise<string> {
    const keyPath = join(this.options.certsDir, deviceId, `${ deviceId }.key`);

    try {
      return readFile(keyPath);
    } catch {
      throw new DevicePrivateKeyNotFoundError(deviceId);
    }
  };

  /**
   * Create the directory for the scep server's ca certificates if not already done and return its path.
   */
  async createCaDir(): Promise<string> {
    const caCertPath = join(this.options.certsDir, 'ca');

    await createDir(caCertPath);

    return caCertPath;
  };

  /**
   * Create the device's certificate directory.
   */
  async createDeviceDir(deviceId: string): Promise<string> {
    const deviceDir = join(this.options.certsDir, deviceId);

    await createDir(deviceDir);

    return deviceDir;
  };

  removeDeviceDir(deviceId: string): Promise<void> {
    const deviceDir = join(this.options.certsDir, deviceId);
    return removeDir(deviceDir);
  }
}
