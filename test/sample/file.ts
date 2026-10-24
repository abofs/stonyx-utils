/**
 * Canonical usage of @stonyx/utils/file. Nothing runs at import time; every
 * function takes the directory to work in and touches nothing outside it.
 * Relative paths resolve against process.cwd().
 */
import {
  createFile,
  updateFile,
  copyFile,
  readFile,
  deleteFile,
  deleteFileSync,
  deleteDirectory,
  createDirectory,
  createReadStream,
  createWriteStream,
  forEachFileImport,
  fileExists,
} from '@stonyx/utils/file';
import { once } from 'node:events';
import { join } from 'node:path';

/**
 * Create a JSON file (parent directories are created for you), replace it
 * atomically, read it back, copy it, and delete files and directories.
 */
export async function manageConfigFile(dir: string): Promise<{
  saved: Record<string, unknown>;
  copied: boolean;
  copiedWithoutOverwrite: boolean;
  copiedWithOverwrite: boolean;
  fallback: string;
  existsAfterDelete: boolean;
  backupDirExistsAfterDelete: boolean;
}> {
  const configPath = join(dir, 'config', 'settings.json');
  const backupDir = join(dir, 'backup');
  const backupPath = join(backupDir, 'settings.json');

  await createFile(configPath, { port: 3000 }, { json: true });
  // updateFile requires the file to exist and swaps the new contents in atomically.
  await updateFile(configPath, { port: 4000 }, { json: true });
  const saved = await readFile(configPath, { json: true });

  await createDirectory(backupDir);
  const copied = await copyFile(configPath, backupPath);
  // An existing target is left alone (false) unless overwrite is set.
  const copiedWithoutOverwrite = await copyFile(configPath, backupPath);
  const copiedWithOverwrite = await copyFile(configPath, backupPath, { overwrite: true });

  // A missing file calls missingFileCallback instead of throwing.
  const fallback = await readFile(join(dir, 'missing.txt'), { missingFileCallback: () => 'default contents' });

  await deleteFile(configPath);
  // Sync variant; ignoreAccessFailure makes a missing file a no-op on either.
  deleteFileSync(join(dir, 'never-created.txt'), { ignoreAccessFailure: true });
  await deleteFile(join(dir, 'never-created.txt'), { ignoreAccessFailure: true });
  const existsAfterDelete = await fileExists(configPath);

  await deleteDirectory(backupDir);
  const backupDirExistsAfterDelete = await fileExists(backupDir);

  return {
    saved,
    copied,
    copiedWithoutOverwrite,
    copiedWithOverwrite,
    fallback,
    existsAfterDelete,
    backupDirExistsAfterDelete,
  };
}

/** Stream a file out and back in; both helpers resolve relative paths first. */
export async function streamLines(dir: string, lines: string[]): Promise<string> {
  const logPath = join(dir, 'events.log');

  const writer = createWriteStream(logPath);
  for (const line of lines) writer.write(`${line}\n`);
  writer.end();
  await once(writer, 'finish');

  let contents = '';
  for await (const chunk of createReadStream(logPath, { encoding: 'utf8' })) contents += chunk;

  deleteFileSync(logPath);

  return contents;
}

/**
 * Import every module in a directory tree. Names are camelCased from the file
 * name; recursiveNaming prefixes the subdirectory. The callback receives each
 * module's default export unless fullExport is set.
 */
export async function loadModules(dir: string): Promise<Record<string, unknown>> {
  const modelsDir = join(dir, 'models');

  await createFile(join(modelsDir, 'user-profile.js'), "export default { table: 'user_profiles' };\n");
  await createFile(join(modelsDir, 'billing', 'credit-card.js'), "export default { table: 'credit_cards' };\n");

  const loaded: Record<string, unknown> = {};
  await forEachFileImport(
    modelsDir,
    (model, { name }) => {
      loaded[name] = model;
    },
    { recursive: true, recursiveNaming: true },
  );

  await deleteDirectory(modelsDir);

  return loaded;
}
