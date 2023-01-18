import { CaCertificateFetchError, CertificateEnrollmentError, CsrGenerationError, PrivateKeyGenerationError, ScepServerNotReachableError, } from '@core';
import { openssl, sscep } from '@util/command';
import { createDir, exists, readDir, readFile, removeDir, writeFile } from '@util/fs';
import { NtlmClient } from 'axios-ntlm';
import debug from 'debug';
import { parse as parseHtml } from 'node-html-parser';
import { basename, join } from 'path';
import { z } from 'zod';
import { CsrConfigOptionsSchema, generateConfig } from './csr-config';
import { DeviceIdentity } from './device-identity';
import type { ScepResponseParser, ScepServer } from './scep-server';

const log = debug(basename(__filename));
const TEMP_DIR_NAME = '.tmp';

/**
 * Default response parser to parse OneTimeCode html response from scep server.
 */
export const defaultScepResponseParser: ScepResponseParser = (response: string): string => {
  /* First two characters of the response are not utf-8 conform (��) and should be cut out*/
  const responseData = response.substring(2);
  const trimmedResponseBody = Buffer.from(responseData)
    .filter(value => value !== 0)
    .toString();

  log('[scepResponseParser|info] Response body: %O', trimmedResponseBody);
  const { childNodes } = parseHtml(responseData);
  const [htmlTag] = childNodes;
  const [, bodyTag] = htmlTag.childNodes;
  const [fontTag] = bodyTag.childNodes;
  const enrollmentPasswordEl = fontTag.childNodes[4];
  const [, passcodeEl] = enrollmentPasswordEl.childNodes;

  const passcode = passcodeEl.text.trim();

  log(`[scepResponseParser|info] Parsed Passcode: ${ passcode }`);

  return passcode;
};

/**
 * Fetch the OneTimePasscode from the scep-server (cert.iodent.com)
 */
export const getOneTimePasscode = async (options: ScepServer): Promise<string> => {
  const { otpUrl, username, password, responseParser = defaultScepResponseParser } = options;
  const client = NtlmClient({ username, password, workstation: '', domain: '' });

  log(`[getOneTimePasscode|info] Fetch one-time-passcode from ${ otpUrl } with username/password (${ username }/${ password })`);
  const response = await client.get(otpUrl);

  log('[getOneTimePasscode|info] Raw Response: %O', response);

  if (!response || !response.data) {
    throw new ScepServerNotReachableError(otpUrl);
  }

  return responseParser(response.data);
};

export const EnrollCertificateOptionsSchema = z.object({
  /**
   * Path where to store the enrolled certificate to
   */
  outDir: z.string(),

  /**
   * Endpoint where to fetch the certificate from
   */
  certUrl: z.string(),

  /**
   * Id of the device to enroll the certificate
   */
  deviceId: z.string(),

  csrConfig: CsrConfigOptionsSchema,
});

export type EnrollCertificateOptions = z.infer<typeof EnrollCertificateOptionsSchema>;

export const enrollCertificate = async (
  options: EnrollCertificateOptions & GetCaOptions,
): Promise<DeviceIdentity> => {
  const { outDir, certUrl, caDir, deviceId, csrConfig } = options;

  const tempDir = join(outDir, TEMP_DIR_NAME);
  await createDir(tempDir);

  const privateKeyPath = await generatePrivateKey(deviceId, join(outDir, `${ deviceId }.key`));
  const certPath = join(outDir, `${ deviceId }.cer`);

  if (!(await exists(outDir)) || !(await exists(certPath))) {

    log('[enrollCertificate|info] Enroll certificate to %s', outDir);

    const csrPath = await generateCsrRequest({
      privateKeyPath,
      outDir: tempDir,
      deviceId,
      config: csrConfig,
    });
    const [ca0, ca1] = await getCa({ caDir, certUrl });

    log('[enrollCertificate|info] Private Key path: %s', privateKeyPath);
    log('[enrollCertificate|info] CSR path: %s', csrPath);
    log('[enrollCertificate|info] CA paths: %s, %s', ca0, ca1);

    const sscepOptions = [
      ['-u', certUrl],
      ['-k', privateKeyPath],
      ['-r', csrPath],
      ['-c', ca0],
      ['-e', ca1],
      ['-l', certPath],
      ['-E', '3des'],
      ['-S', 'sha1'],
    ];

    log('[enrollCertificate|info] Execute enrollment command');
    await sscep(
      'enroll',
      ...sscepOptions,
    );

    await removeDir(tempDir);

    if (!(await exists(outDir))) {
      throw new CertificateEnrollmentError(outDir);
    }
  }

  log('[enrollCertificate|info] Certificate successfully created: %s', outDir);
  return {
    deviceId,
    cert: await readFile(certPath),
    key: await readFile(privateKeyPath),
  };
};

export const GeneratePrivateKeyOptionsSchema = z.object({
  /**
   * Length of the key
   */
  keyLength: z.number(),
});

export type GeneratePrivateKeyOptions = z.infer<typeof GeneratePrivateKeyOptionsSchema>;

const defaultPrivateKeyOptions: GeneratePrivateKeyOptions = {
  keyLength: 2048,
};

/**
 * Generate a private key for a device
 */
export const generatePrivateKey = async (
  deviceId: string,
  path: string,
  options: GeneratePrivateKeyOptions = defaultPrivateKeyOptions,
): Promise<string> => {
  const { keyLength } = options;

  log('[generatePrivateKey|info] Private key path: %s', path);

  if (!(await exists(path))) {
    const opensslOptions = [
      ['-out', path],
      keyLength.toString(),
    ];

    log('[generatePrivateKey|info] Execute genrsa command with options %j', opensslOptions);
    await openssl(
      'genrsa',
      ...opensslOptions,
    );

    if (!(await exists(path))) {
      throw new PrivateKeyGenerationError(path);
    }
  }

  log('[generatePrivateKey|info] Private key successfully generated: %s', path);
  return path;
};

export const GetCaOptionsSchema = z.object({
  /**
   * Path to the directory where to store the ca certificates
   */
  caDir: z.string(),

  /**
   * Url to the scep endpoint where to fetch the certificate from
   */
  certUrl: z.string(),
});

export type GetCaOptions = z.infer<typeof GetCaOptionsSchema>;

export const getCa = async (options: GetCaOptions): Promise<string[]> => {
  const { caDir, certUrl } = options;
  const caCertPath = join(caDir, 'iot-ca.cer');

  log('[getCa|info] Ca certificates path: %s', caCertPath);

  let caCertPaths = [];
  if (await exists(caDir)) {
    caCertPaths = await readDir(caDir);
  } else {
    await createDir(caDir);
  }

  if (!caCertPaths.length) {
    const sscepOptions = [
      ['-u', certUrl],
      ['-c', caCertPath],
    ];

    log('[getCa|info] Execute getca command with options %j', sscepOptions);
    await sscep(
      'getca',
      ...sscepOptions,
    );

    caCertPaths = await readDir(caDir);

    if (!caCertPaths.length) {
      throw new CaCertificateFetchError(certUrl);
    }
  }

  log('[getCa|info] Successfully fetched ca certificates and saved to %s', caDir);
  return caCertPaths.map(path => `${ caDir }/${ path }`);
};

export const CsrRequestOptionsSchema = z.object({
  /**
   * Path to the private key
   */
  privateKeyPath: z.string(),
  /**
   * Path to where to put the csr request
   */
  outDir: z.string(),
  /**
   * Csr request options
   */
  config: CsrConfigOptionsSchema,
  /**
   * Id of the device to generate a csr request for
   */
  deviceId: z.string(),
});

export type CsrRequestOptions = z.infer<typeof CsrRequestOptionsSchema>;

export const generateCsrRequest = async (options: CsrRequestOptions): Promise<string> => {
  const { privateKeyPath, outDir, deviceId, config } = options;

  log('[generateCsrRequest|info] Create Temp directory for device %s', deviceId);
  const deviceCsrPath = `${ outDir }/${ deviceId }.csr`;
  const scepConfigPath = join(outDir, 'scep.config');
  await writeFile(scepConfigPath, generateConfig(deviceId, config));

  if (!(await exists(deviceCsrPath))) {

    const opensslOptions = [
      ['-config', scepConfigPath],
      '-new',
      ['-key', privateKeyPath],
      ['-out', deviceCsrPath],
    ];

    log('[generateCsrRequest|info] Create CSR in path %s with options %j', deviceCsrPath, opensslOptions);
    await openssl(
      'req',
      ...opensslOptions,
    );

    if (!(await exists(deviceCsrPath))) {
      throw new CsrGenerationError(deviceCsrPath);
    }
  }

  log('[generateCsrRequest|info] Successfullly created CSR in %s', deviceCsrPath);

  return deviceCsrPath;
};

export const createTempScepConf = async (
  scepConfigPath: string,
  deviceId: string,
  passcode: string,
  dirPath: string,
): Promise<string> => {
  const scepConfig = await readFile(scepConfigPath);

  log('[createTempScepConf|info] Read dummy config file: %s', scepConfig);

  const result = scepConfig.replace('<UID>', deviceId).replace('<OTP>', passcode);

  const tempScepConfPath = join(dirPath, 'scep.conf');

  await writeFile(tempScepConfPath, result);

  log('[createTempScepConf|info] Temp scep config created: %s', tempScepConfPath);
  return tempScepConfPath;
};
