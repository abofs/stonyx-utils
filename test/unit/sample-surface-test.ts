/**
 * Sample surface guard.
 *
 * Keeps test/sample/ honest as the canonical usage reference:
 *  1. every package.json#exports subpath resolves to the built entry, so the
 *     samples exercise what consumers install, not src/;
 *  2. every runtime export of every subpath is imported by some sample;
 *  3. every sample file is imported by some *-test.ts, so no sample goes
 *     unexecuted;
 *  4. every module specifier in a sample is one a consumer can write: the
 *     package name or one of its exports subpaths, a relative path that stays
 *     inside test/sample/, or another package. A self-reference to an
 *     unexported subpath, or a relative path out to src/ or dist/, fails.
 *
 * (2) and (3) credit only imports that survive compilation. Each file is run
 * through ts.transpileModule and the emitted import declarations are read, so
 * an import that TypeScript and tsx erase credits nothing: `import type`,
 * `import { type X }`, and a value import whose binding is never used as a
 * value (unused, used only in types, shadowed, or only a property name).
 * Comments and string literals are not imports either. (4) reads the source,
 * so a type-only import must be consumer-writable too.
 *
 * Limits, covered elsewhere: (2) proves a name is imported and used, not what
 * the call did (the behavioural sample tests assert on that); it sees runtime
 * exports only, so nothing requires a sample to import each type-only export
 * (`pnpm typecheck` only checks that the type imports samples do make
 * resolve); and it counts top-level exports, not class methods.
 *
 * Package-agnostic: it reads the name and exports map from package.json and
 * locates the repo by the working directory, not by this file's location, so
 * it can be copied unchanged into a repo that runs tests from compiled output
 * (e.g. dist-test/). Run it from the repo root, as `pnpm test` does.
 */
import QUnit from 'qunit';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const { module, test } = QUnit;

type ExportTarget = string | { default?: string; import?: string };

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string;
  exports: Record<string, ExportTarget>;
};

const subpaths = Object.entries(pkg.exports).map(([key, target]) => ({
  specifier: key === '.' ? pkg.name : `${pkg.name}/${key.replace(/^\.\//, '')}`,
  entry: (typeof target === 'string' ? target : (target.import ?? target.default ?? '')).replace(/^\.\//, ''),
}));

function listFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith(suffix))
    .map((file) => join(dir, file));
}

const sampleDir = join(root, 'test', 'sample');
const sampleFiles = listFiles(sampleDir, '.ts');
const testFiles = listFiles(join(root, 'test'), '-test.ts');

/**
 * Resolve a specifier the way an ESM consumer does. Runs in a child process
 * because tsx compiles this file to CommonJS, where import.meta.resolve is
 * unavailable. The eval module's parent URL is the repo root, so the package
 * self-references through its own exports map.
 */
function resolveAsConsumer(specifier: string): string {
  const url = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', 'process.stdout.write(import.meta.resolve(process.argv[1]))', specifier],
    { cwd: root, encoding: 'utf8' },
  );
  return fileURLToPath(url);
}

/**
 * The import declarations left in a file after TypeScript compiles it, so an
 * import the runtime never performs is not an import. Re-exports
 * (`export … from`) load their module too, so they count.
 */
function emittedImports(file: string): (ts.ImportDeclaration | ts.ExportDeclaration)[] {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return ts
    .createSourceFile(file, outputText, ts.ScriptTarget.Latest)
    .statements.filter(
      (node): node is ts.ImportDeclaration | ts.ExportDeclaration =>
        ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && !!node.moduleSpecifier),
    );
}

function specifierOf(declaration: ts.ImportDeclaration | ts.ExportDeclaration): string {
  return (declaration.moduleSpecifier as ts.StringLiteral).text;
}

/**
 * Runtime export names a file imports from `specifier` and uses. A namespace
 * import (`import * as ns`) or a re-export credits nothing, so they fail
 * closed rather than crediting every export.
 */
function importedNames(file: string, specifier: string): string[] {
  const names: string[] = [];

  for (const declaration of emittedImports(file)) {
    if (!ts.isImportDeclaration(declaration) || specifierOf(declaration) !== specifier) continue;
    const clause = declaration.importClause;
    if (!clause) continue;
    if (clause.name) names.push('default');

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.push((element.propertyName ?? element.name).text);
    }
  }

  return names;
}

/** Files a test loads by relative path, resolved to their .ts source. */
function importedFiles(file: string): string[] {
  return emittedImports(file)
    .map(specifierOf)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => resolve(dirname(file), specifier).replace(/\.js$/, '.ts'));
}

/**
 * Every module specifier written in a file's source, type-only ones included:
 * import and export-from declarations, `import x = require()`, `import()`
 * calls and `import('…')` types. A non-literal `import()` is reported as such,
 * since what it loads cannot be checked.
 */
function writtenSpecifiers(file: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      found.push((node.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExternalModuleReference(node)) {
      found.push(ts.isStringLiteral(node.expression) ? node.expression.text : '<non-literal require>');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      found.push(argument && ts.isStringLiteralLike(argument) ? argument.text : '<non-literal import()>');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest));
  return found;
}

const exportedSpecifiers = new Set(subpaths.map(({ specifier }) => specifier));

/** Whether a consumer could write `specifier` in a copy of the sample `file`. */
function consumerCanWrite(file: string, specifier: string): boolean {
  if (specifier.startsWith('<')) return false;
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const target = relative(sampleDir, resolve(dirname(file), specifier));
    return target !== '' && !target.startsWith('..') && !isAbsolute(target);
  }
  if (specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)) return exportedSpecifiers.has(specifier);
  return true;
}

module('[Unit] Sample surface', function () {
  test('test/sample/ contains samples', function (assert) {
    assert.ok(sampleFiles.length > 0, `found ${sampleFiles.length} sample file(s)`);
    assert.ok(subpaths.length > 0, `package.json declares ${subpaths.length} export subpath(s)`);
  });

  test('every export subpath resolves to the built entry', function (assert) {
    for (const { specifier, entry } of subpaths) {
      assert.ok(entry.startsWith('dist/'), `${specifier} is declared as built output (${entry})`);
      const resolved = resolveAsConsumer(specifier);
      assert.strictEqual(relative(root, resolved).split(sep).join('/'), entry, `${specifier} -> ${entry}`);
    }
  });

  test('every runtime export is imported by a sample', async function (assert) {
    for (const { specifier } of subpaths) {
      const exported = Object.keys(await import(specifier));
      const imported = new Set(sampleFiles.flatMap((file) => importedNames(file, specifier)));
      const missing = exported.filter((name) => !imported.has(name));

      assert.ok(exported.length > 0, `${specifier} has runtime exports`);
      assert.deepEqual(missing, [], `every runtime export of ${specifier} is imported by a sample`);
    }
  });

  test('every sample is imported by a test', function (assert) {
    const imported = new Set(testFiles.flatMap(importedFiles));

    for (const file of sampleFiles) {
      const rel = relative(root, file).split(sep).join('/');
      assert.ok(imported.has(file), `${rel} is imported by a *-test.ts`);
    }
  });

  test('every sample imports only what a consumer can import', function (assert) {
    const written = sampleFiles.flatMap((file) => writtenSpecifiers(file).map((specifier) => ({ file, specifier })));
    const unwritable = written
      .filter(({ file, specifier }) => !consumerCanWrite(file, specifier))
      .map(({ file, specifier }) => `${relative(root, file).split(sep).join('/')}: ${specifier}`);

    assert.ok(
      written.some(({ specifier }) => exportedSpecifiers.has(specifier)),
      `the scan sees an import of ${pkg.name}`,
    );
    assert.deepEqual(unwritable, [], 'no sample imports an unexported subpath or a path outside test/sample/');
  });
});
