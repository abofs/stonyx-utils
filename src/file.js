import { getTimestamp } from '@stonyx/utils/date';
import { kebabCaseToCamelCase } from '@stonyx/utils/string';
import { promises as fsp } from 'fs';
import path from 'path';

export async function createFile(filePath, data) {
  try {
    await fsp.writeFile(filePath, data, 'utf8');
  } catch (error) {
    throw new Error(error);
  }
}

export async function updateFile(filePath, data) {
  try {
    await fsp.access(filePath);

    const swapFile = `${filePath}.temp-${getTimestamp()}`;
    await fsp.writeFile(swapFile, data);
    await fsp.rename(swapFile, file);
  } catch (error) {
    
    throw new Error(error);
  }
}

export async function readFile(filePath, { json, missingFileCallback }) {
  try {
    filePath = path.resolve(filePath);
    
    await fsp.access(filePath);
    const fileData = await fsp.readFile(filePath, 'utf8');

    return json ? JSON.parse(fileData) : fileData;
  } catch (error) {
    if (error.code === 'ENOENT' && missingFileCallback) missingFileCallback(filePath);

    throw new Error(error);
  }
}

export async function deleteFile(filePath) {
  await fsp.unlink(filePath);
}

export async function deleteDirectory(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function createDirectory(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function forEachFileImport(dir, callback, options={}) {
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

    if (!stats.isFile() || !file.endsWith('.js')) continue;

    const prefix = process.platform === 'win32' ? 'file://' : '';
    const rawName = file.replace('.js', '');
    const name = options.rawName ? rawName : kebabCaseToCamelCase(rawName);
    const exported = await import(prefix + path.resolve(filePath));
    const output = !options.fullExport ? exported.default : exported;

    callback(output, { name, stats, path: filePath });
  }
}
