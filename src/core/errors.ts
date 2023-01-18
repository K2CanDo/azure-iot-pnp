export class NoModelIdAssignedError extends Error {
  constructor(deviceId: string) {
    super(`The device [${ deviceId }] has no modelId assigned to it and can therefore not utilize pnp components`);
  }
}

export class DeviceCertificateNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Certificate for device ${ deviceId } not found.`);
  }
}

export class DevicePrivateKeyNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Private key for device ${ deviceId } not found`);
  }
}

export class DeviceIdentityCreationError extends Error {
  constructor(deviceId: string, message?: string) {
    super(`Failed to create device identity for ${ deviceId }${ message ? ': ' + message : '' }`);
  }
}

export class ScepServerNotReachableError extends Error {
  constructor(serverUrl: string) {
    super(`Could not reach scep server [${ serverUrl }]`);
  }
}

export class CaCertificateFetchError extends Error {
  constructor(serverUrl: string) {
    super(`Could not fetch ca certificates from [${ serverUrl }]`);
  }
}

export class CsrGenerationError extends Error {
  constructor(path: string) {
    super(`Could not generate CSR in path ${ path }`);
  }
}

export class PrivateKeyGenerationError extends Error {
  constructor(path: string) {
    super(`Could not generate private key in path ${ path }`);
  }
}

export class CertificateEnrollmentError extends Error {
  constructor(path: string) {
    super(`Could not enroll the certificate and store to path ${ path }`);
  }
}
