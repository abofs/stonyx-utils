import { getTimestamp } from './date.js';
import { kebabCaseToCamelCase } from './string.js';
import { objToJson } from './object.js';
import { promises as fsp } from 'fs';
import path from 'path';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

interface FileOptions {
  json?: boolean;
}

interface ReadFileOptions extends FileOptions {
  missingFileCallback?: (filePath: string) => string | Record<string, unknown>;
}

interface DeleteFileOptions {
  ignoreAccessFailure?: boolean;
}

interface ForEachFileImportOptions {
  ignoreAccessFailure?: boolean;
  recursive?: boolean;
  recursiveNaming?: boolean;
  rawName?: boolean;
  namePrefix?: string;
  fullExport?: boolean;
}

interface FileImportMeta {
  name: string;
  stats: import('fs').Stats;
  path: string;
}

export async function createFile(filePath: string, data: string | Record<string, unknown>, options: FileOptions = {}): Promise<void> {
  try {
    filePath = path.resolve(filePath);

    await createDirectory(path.dirname(filePath));
    await fsp.writeFile(filePath, options.json ? objToJson(data) : String(data), 'utf8');
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function updateFile(filePath: string, data: string | Record<string, unknown>, options: FileOptions = {}): Promise<void> {
  try {
    await fsp.access(filePath);

    const swapFile = `${filePath}.temp-${getTimestamp()}`;
    await fsp.writeFile(swapFile, options.json ? objToJson(data) : String(data), 'utf8');
    await fsp.rename(swapFile, filePath);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

interface CopyFileOptions {
  overwrite?: boolean;
}

export async function copyFile(sourcePath: string, targetPath: string, options: CopyFileOptions = {}): Promise<boolean> {
  try {
    sourcePath = path.resolve(sourcePath);
    targetPath = path.resolve(targetPath);
    await fsp.access(sourcePath);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  try {
    await fsp.access(targetPath);
    if (!options.overwrite) return false;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') { /* file doesn't exist — proceed with copy */ }
    else throw error;
  }

  try {
    await fsp.copyFile(sourcePath, targetPath);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  return true;
}

export async function readFile(filePath: string, options: ReadFileOptions & { json: true }): Promise<Record<string, unknown>>;
export async function readFile(filePath: string, options?: ReadFileOptions): Promise<string>;
export async function readFile(filePath: string, options: ReadFileOptions = {}): Promise<string | Record<string, unknown>> {
  try {
    filePath = path.resolve(filePath);

    await fsp.access(filePath);
    const fileData = await fsp.readFile(filePath, 'utf8');

    return options.json ? JSON.parse(fileData) as Record<string, unknown> : fileData;
  } catch (error) {
    const { missingFileCallback } = options;

    if (isNodeError(error) && error.code === 'ENOENT' && missingFileCallback) {
      return missingFileCallback(filePath);
    }

    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function deleteFile(filePath: string, options?: DeleteFileOptions): Promise<void> {
  try {
    filePath = path.resolve(filePath);

    await fsp.access(filePath);
  } catch (error) {
    if (options?.ignoreAccessFailure) return;
    throw error;
  }

  await fsp.unlink(filePath);
}

export async function deleteDirectory(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function createDirectory(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function forEachFileImport(dir: string, callback: (output: unknown, meta: FileImportMeta) => void | Promise<void>, options: ForEachFileImportOptions = {}): Promise<void> {
  if (typeof callback !== 'function') throw new Error('Callback must be valid function');

  try {
    await fsp.access(dir);
  } catch (error) {
    if (!options.ignoreAccessFailure) throw new Error(`Unable to access directory: ${dir}`);
    return;
  }

  const files = await fsp.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await fsp.stat(filePath);

    if (options.recursive && stats.isDirectory()) {
      const newOptions = { ...options };

      if (options.recursiveNaming) {
        const pathPrefix = options.rawName ? file : `${kebabCaseToCamelCase(file)}`;
        newOptions.namePrefix = options.namePrefix ? `${options.namePrefix}${pathPrefix}/` : `${pathPrefix}/`;
      }

      await forEachFileImport(filePath, callback, newOptions);
      continue;
    }

    if (!stats.isFile() || !file.endsWith('.js')) continue;

    const prefix = process.platform === 'win32' ? 'file://' : '';
    const rawName = file.replace('.js', '');
    let name = options.rawName ? rawName : kebabCaseToCamelCase(rawName);

    if (options.namePrefix) name = `${options.namePrefix}${name}`;

    const exported = await import(prefix + path.resolve(filePath));
    const output = !options.fullExport ? exported.default : exported;

    callback(output, { name, stats, path: filePath });
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    filePath = path.resolve(filePath);
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
