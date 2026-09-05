import { kebabCaseToCamelCase } from './string.js';
import { objToJson } from './object.js';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

interface FileOptions {
  json?: boolean;
}

interface ReadFileOptions extends FileOptions {
  missingFileCallback?: (filePath: string) => string | Record<string, unknown>;
  encoding?: BufferEncoding | null;
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

/**
 * Atomically replace the contents of an existing file.
 *
 * Writes to a swap file that is a **sibling** of the target — so `rename` stays
 * on one filesystem and therefore stays atomic — then renames it over the
 * target. The swap name carries `process.pid` and a short random token rather
 * than a timestamp: a whole-second token collided between concurrent callers,
 * which made one caller throw `ENOENT` and the other silently persist bytes it
 * had not written (abofs/stonyx-utils#44).
 *
 * Concurrency contract: **last writer wins**. Unique swap names remove the
 * `ENOENT` and the byte-level clobber, but overlapping calls on one path still
 * race on which value lands last. `updateFile` does not serialize, and callers
 * needing a serialization guarantee must supply their own — an in-process queue
 * would not provide one across processes anyway.
 *
 * The target's mode is read before the write and reapplied to the swap file, so
 * the rename does not widen a deliberately restrictive file (a `0600` database
 * would otherwise become `0666 & ~umask`). Other inode-bound metadata — ACLs,
 * extended attributes, hard links, ownership — is *not* carried across; the
 * target gets a new inode by construction.
 *
 * `rename` is atomic against concurrent *readers*, not against power loss:
 * there is no `fsync`, so this is namespace atomicity, not crash durability.
 * If the target is a symlink it is replaced by a regular file — the link's
 * destination is never written through.
 *
 * Swap files are cleaned up on every failure path this function controls, but
 * a process killed between the write and the rename leaves a permanently
 * distinct `<path>.temp-<pid>-<token>` sibling that nothing reclaims. No
 * sweeper ships with this module; `*.temp-*` siblings of a target are safe for
 * a consumer to delete.
 */
export async function updateFile(filePath: string, data: string | Record<string, unknown>, options: FileOptions = {}): Promise<void> {
  try {
    filePath = path.resolve(filePath);

    await fsp.access(filePath);

    // The swap file becomes the target's inode, so it has to carry the target's
    // permission bits or a routine save silently widens them.
    const { mode } = await fsp.stat(filePath);
    const targetMode = mode & 0o7777;

    // pid + random token, never a timestamp: the swap name is a uniqueness
    // token, and whole seconds cannot discriminate between concurrent callers.
    // The token is deliberately short — a full 36-char UUID pushed the name
    // overhead to 48 characters and made ~210-character basenames fail
    // ENAMETOOLONG on a 255-byte NAME_MAX. 6 CSPRNG bytes as base64url is 8
    // characters carrying 48 bits, where the first 8 hex characters of a UUID
    // would be the same width but only 32 bits; at 32 bits a 1000-sample
    // distinctness check collides about once in 8,600 runs. `wx` below makes
    // any residual collision loud rather than corrupting.
    const swapFile = `${filePath}.temp-${process.pid}-${randomBytes(6).toString('base64url')}`;

    // Which stage failed, so the catch can tell "the open collided" from "the
    // open succeeded and something later failed" — see the catch.
    let created = false;

    try {
      // `wx` turns any residual name collision into a loud EEXIST rather than a
      // silent overwrite of another caller's swap bytes. `mode` here is masked
      // by the umask, so it only narrows — the fchmod below sets the exact bits.
      //
      // The open is deliberately separate from the write. Everything after this
      // line addresses the *descriptor*, never the path again, so an attacker
      // with write access to the directory cannot redirect it: unlinking the
      // swap path and replacing it with a symlink after this point leaves the
      // handle bound to the original inode. `fsp.chmod(swapFile, ...)` on the
      // path did not have that property — it followed such a symlink and
      // widened an arbitrary victim file with this process's privileges
      // (abofs/stonyx-utils#45, Phase 3 HIGH-3).
      const handle = await fsp.open(swapFile, 'wx', targetMode);
      created = true;

      try {
        await handle.writeFile(options.json ? objToJson(data) : String(data), 'utf8');

        // fchmod(2) on the descriptor, not chmod(2) on the path. Needed at all
        // because the `mode` above is umask-masked and therefore only narrows:
        // a 0666 target would come back 0644 under the usual 022.
        await handle.chmod(targetMode);
      } catch (writeError) {
        await handle.close().catch(() => { /* best effort — the write error wins */ });

        throw writeError;
      }

      // Not in a `finally`: a close failure is a write failure (the flush can
      // land here), so it has to surface rather than be swallowed — which is
      // what `fsp.writeFile` did when it owned this close.
      await handle.close();

      await fsp.rename(swapFile, filePath);
    } catch (swapError) {
      // Leave no orphan behind, and never let the cleanup mask the real error.
      //
      // Exactly one case is not ours to remove: the `wx` open lost a race, so
      // the swap file is another writer's and unlinking it would reintroduce
      // #44. That is EEXIST *from the write stage* — both halves matter.
      //   - Code alone is not enough: `rename` surfaces EEXIST on Windows and
      //     some network filesystems, and that file is one we created.
      //   - Stage alone is not enough: `rename` is the only stage after the
      //     open that can raise EEXIST at all, and by then the file is ours —
      //     so a stage flag that answered "did the write finish?" would send
      //     an ENOSPC/EDQUOT/EIO mid-write down the skip path and reinstate
      //     the orphaned partial payload this PR exists to close. `created` is
      //     set the instant the `wx` open returns, which is the only reading
      //     of the stage that means "this call owns the path".
      const lostTheOpenRace = !created && isNodeError(swapError) && swapError.code === 'EEXIST';

      if (!lostTheOpenRace) {
        await fsp.unlink(swapFile).catch(() => { /* best effort — original error wins */ });
      }

      throw swapError;
    }
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

export async function readFile(filePath: string, options: ReadFileOptions & { encoding: null }): Promise<Buffer>;
export async function readFile(filePath: string, options: ReadFileOptions & { json: true }): Promise<Record<string, unknown>>;
export async function readFile(filePath: string, options?: ReadFileOptions): Promise<string>;
export async function readFile(filePath: string, options: ReadFileOptions = {}): Promise<string | Buffer | Record<string, unknown>> {
  try {
    filePath = path.resolve(filePath);

    await fsp.access(filePath);
    const encoding = options.encoding === undefined ? 'utf8' : options.encoding;
    const fileData = await fsp.readFile(filePath, { encoding: encoding as BufferEncoding | null });

    if (encoding === null) return fileData as Buffer;
    if (options.json) return JSON.parse(fileData as string) as Record<string, unknown>;
    return fileData as string;
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

export function deleteFileSync(filePath: string, options?: DeleteFileOptions): void {
  try {
    filePath = path.resolve(filePath);
    fs.accessSync(filePath);
  } catch (error) {
    if (options?.ignoreAccessFailure) return;
    throw error;
  }
  fs.unlinkSync(filePath);
}

export async function deleteDirectory(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function createDirectory(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export function createReadStream(filePath: string, options?: Parameters<typeof fs.createReadStream>[1]): fs.ReadStream {
  return fs.createReadStream(path.resolve(filePath), options);
}

export function createWriteStream(filePath: string, options?: Parameters<typeof fs.createWriteStream>[1]): fs.WriteStream {
  return fs.createWriteStream(path.resolve(filePath), options);
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

    if (!stats.isFile() || !(file.endsWith('.js') || file.endsWith('.ts'))) continue;

    const prefix = process.platform === 'win32' ? 'file://' : '';
    const rawName = file.replace(/\.(js|ts)$/, '');
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
