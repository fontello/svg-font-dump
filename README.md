SVG font dumper
===============

This tool is used to dump SVG font into separate images.

Installation
-------
```bash
npm install -g svg-font-dump
```

Usage
-------
```bash
svg-font-dump -i ./my-svg-font.svg -o ./svg-font-dump -n
```

Options
-------
- `-i`, `--src_font` - Source font path **required**
- `-o`, `--glyphs_dir` - Glyphs output folder **required**, create folder if doesn't exist
- `-c`, `--config` - Font config file
- `-d`, `--diff_config` - Difference config output file
- `-f`, `--force` - Force override glyphs from config
- `-n`, `--names` - Try to guess new glyphs names

Authors
-------

- [Kir Belevich](https://github.com/deepsweet)
- [Vitaly Puzrin](https://github.com/puzrin)


License
-------
View the [LICENSE](https://github.com/fontello/svg-font-dump/blob/master/LICENSE) file
(MIT).
