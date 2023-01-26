import { EnvVariable, getEnv } from '@core';
import { execFile } from 'child_process';
import debug from 'debug';
import { basename, normalize } from 'path';
import { promisify } from 'util';

const SSCEP_EXECUTABLE_BIN = 'sscep';
const OPENSSL_EXECUTABLE_BIN = 'openssl';

const SSCEP_PATH = normalize(getEnv(EnvVariable.SscepPath, SSCEP_EXECUTABLE_BIN));
const OPENSSL_PATH = normalize(getEnv(EnvVariable.OpensslPath, OPENSSL_EXECUTABLE_BIN));
const log = debug(basename(__filename));

/**
 * Execute any command on the terminal.
 */
export const executeCommand = async (command, ...params: (string | string[])[]): Promise<void> => {
  const args = params.flat();

  try {
    log('[executeCommand|info] Execute command %s with args: %j', command, args);
    await promisify(execFile)(command, args);
  } catch (e) {
    // eslint-disable-next-line max-len
    log('[executeCommand|error] Could not execute %s. Make sure the executable is reachable globally or via the corresponding environment variable', command);
    throw e;
  }
};

export const openssl = (...params: (string | string[])[]): Promise<void> => executeCommand(OPENSSL_PATH, ...params);
export const sscep = (...params: (string | string[])[]): Promise<void> => executeCommand(SSCEP_PATH, ...params);
