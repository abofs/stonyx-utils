# stonyx-utils

# TODO: Generate documentation for all utils

## Running the test suite
```
npm test
```

## File utils

TODO: Update documentation to instruct a broader audience

The File utils wrap the `path` and `fs` library to allow consuming classes to manipulate the local file system with full async/await support. Additionally it exposes the `forEachFileImport` method which lets us dynamically and flexibly import dependencies.

### Usage example

```js
  await forEachFileImport(targetDirectory, (exports, details) => {
    // Insert logic per export
  }, options);
```

### Valid Options

| Option | Type | Default | Description |
| :---: | :---: | :---: | :--- |
| `fullExport` | **Boolean** | *false* | When set to true, The `exports` parameter will be all exports, and not just the default one. |
| `rawName` | **Boolean** | *false* | When set to true, `forEachFileImport` will not convert the file name to be camelCase and leave it raw instead |
| `ignoreAccessFailure` | **Boolean** | *false* | When set to true, failure to load directory will be ignored |

## License

Apache — do what you want, just keep attribution.
