import { PathLike, promises as fsPromises } from 'fs';
import mkDir from 'mkdirp';
import rimraf from 'rimraf';

const { access, readFile: fsReadFile, writeFile: fsWriteFile, readdir, mkdtemp } = fsPromises;

/**
 * Check if file exists
 */
export const exists = (path: PathLike): Promise<boolean> =>
  access(path)
    .then(() => true)
    .catch(() => false);

/**
 * Remove a directory
 */
export const removeDir = (path: PathLike): Promise<void> => new Promise(res => rimraf(path, () => res()));

/**
 * Create a directory
 */
export const createDir = (path: PathLike): Promise<void> => mkDir(path);

/**
 * Returns a list of filenames in the specified directory
 */
export const readDir = (path: PathLike): Promise<string[]> => readdir(path);

/**
 * Reads a file in utf-8 format
 */
export const readFile = (path: PathLike): Promise<string> => fsReadFile(path, 'utf-8');

/**
 * Writes string file data to a file
 */
export const writeFile = (path: PathLike, data: string): Promise<void> => fsWriteFile(path, data);

export const createTmpDir = (prefix: string): Promise<string> => mkdtemp(prefix, { encoding: 'utf-8' });
