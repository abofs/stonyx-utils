import { getTimestamp } from '@stonyx/utils/date';
import { kebabCaseToCamelCase } from '@stonyx/utils/string';
import { objToJson } from '@stonyx/utils/object';
import { promises as fsp } from 'fs';
import path from 'path';

export async function createFile(filePath, data, options={}) {
  try {
    filePath = path.resolve(filePath);

    await createDirectory(path.dirname(filePath));
    await fsp.writeFile(filePath, options.json ? objToJson(data) : data, 'utf8');
  } catch (error) {
    throw new Error(error);
  }
}

export async function updateFile(filePath, data, options={}) {
  try {
    await fsp.access(filePath);

    const swapFile = `${filePath}.temp-${getTimestamp()}`;
    await fsp.writeFile(swapFile, options.json ? objToJson(data) : data);
    await fsp.rename(swapFile, filePath);
  } catch (error) {
    
    throw new Error(error);
  }
}

export async function copyFile(sourcePath, targetPath, options={}) {
  try {
    sourcePath = path.resolve(sourcePath);
    targetPath = path.resolve(targetPath);
    await fsp.access(sourcePath);
  } catch (error) {
    throw new Error(error);
  }

  try {
    await fsp.access(targetPath);
    if (!options.overwrite) return false;
  } catch {}

  try {
    await fsp.copyFile(sourcePath, targetPath);
  } catch (error) {
    throw new Error(error);
  }

  return true;
}

export async function readFile(filePath, options={}) {
  try {
    filePath = path.resolve(filePath);
    
    await fsp.access(filePath);
    const fileData = await fsp.readFile(filePath, 'utf8');

    return options.json ? JSON.parse(fileData) : fileData;
  } catch (error) {
    const { missingFileCallback } = options;

    if (error.code === 'ENOENT' && missingFileCallback) {
      return missingFileCallback(filePath);
    }

    throw new Error(error);
  }
}

export async function deleteFile(filePath, options) {
  try {
    filePath = path.resolve(filePath);
    
    await fsp.access(filePath);
  } catch (error) {
    if (options?.ignoreAccessFailure) return;
    throw error;
  }

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

export async function fileExists(filePath) {
  try {
    filePath = path.resolve(filePath);
    await fsp.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}
