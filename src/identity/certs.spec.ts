import { EnvVariable, getEnv } from '@util/environment';
import { removeDir } from '@util/fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { enrollCertificate, getOneTimePasscode } from './certs';

const username = getEnv(EnvVariable.ScepUsername);
const password = getEnv(EnvVariable.ScepPassword);
const SCEP_OTP_ENDPOINT = getEnv(EnvVariable.ScepServerOtpUrl);
const SCEP_CERT_ENDPOINT = getEnv(EnvVariable.ScepServerCertUrl);

const OTP_PASSWORD_LENGTH = 8;

describe('certs', () => {
  it('should return a valid one-time-password', async () => {
    const passcode = await getOneTimePasscode({
      username,
      password,
      otpUrl: SCEP_OTP_ENDPOINT,
      certUrl: SCEP_CERT_ENDPOINT,
    });

    expect(passcode).toBeTruthy();
    expect(passcode).toHaveLength(OTP_PASSWORD_LENGTH);
  });

  it('should retrieve a certificate for the provided deviceId', async () => {
    const deviceId = 'unit-test-device-cert';
    const tempPath = resolve(tmpdir(), 'certs', deviceId);
    const passcode = await getOneTimePasscode({
      username,
      password,
      otpUrl: SCEP_OTP_ENDPOINT,
      certUrl: SCEP_CERT_ENDPOINT,
    });
    const { cert } = await enrollCertificate({
      deviceId,
      csrConfig: {
        passcode,
        countryName: 'AT',
        organizationalUnitName: 'MyOrg',
        localityName: 'MyHome',
      },
      outDir: tempPath,
      certUrl: SCEP_CERT_ENDPOINT,
      caDir: resolve(tmpdir(), 'ca'),
    });

    expect(cert.length).toBeGreaterThan(10);
    await removeDir(tempPath);
  }, 100000);
});
