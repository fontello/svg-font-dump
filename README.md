SVG font dumper
===============

This tool is used to dump SVG font into separate images.

Installation
-------
```bash
// cli (normal usage)
npm install -g svg-font-dump

// programmatically (advanced usage)
npm install -S svg-font-dump
```

Usage
-------
```bash
svg-font-dump -i ./my-svg-font.svg -o ./svg-font-dump -n
```
CLI
-------
- `-i`, `--src-font` - Source font path **required**
- `-o`, `--glyphs-dir` - Glyphs output folder **required**, create folder if doesn't exist
- `-c`, `--config` - Font config file
- `-d`, `--diff-config` - Difference config output file
- `-f`, `--force` - Force override glyphs from config
- `-n`, `--names` - Try to guess new glyphs names

MODULE
-------
It's also possible to call the module programmatically, in case you want it ran in a build script.

`svgFontDump(options)`

Example:

```javascript
const path = require('path');
const svgFontDump = require('svg-font-dump');

svgFontDump({
  font: path.resolve('./my-svg-font.svg'),
  outputDir: path.resolve('./svg-font-dump'),
  name: true
})
 .then(() => { console.log('Icons seperated'); })
 .catch((e) => { console.error(e); });
```

Authors
-------

- [Kir Belevich](https://github.com/deepsweet)
- [Vitaly Puzrin](https://github.com/puzrin)


License
-------
View the [LICENSE](https://github.com/fontello/svg-font-dump/blob/master/LICENSE) file
(MIT).
