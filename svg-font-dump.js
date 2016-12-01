#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const _ = require('lodash');
const yaml = require('js-yaml');
const ArgumentParser = require('argparse').ArgumentParser;

const fixedCharCodeAt = require('./lib/utils/fixedCharCodeAt');
const loadSvgData = require('./lib/utils/loadSvgData');
const loadFontelloData = require('./lib/utils/loadFontelloData');

const svgTemplate = _.template(
    '<svg height="<%= height %>" width="<%= width %>" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="<%= d %>" />' +
    '</svg>'
  );

const parser = new ArgumentParser({
  version: require('./package.json').version,
  addHelp: true,
  description: 'Dump SVG font to separate glyphs'
});
parser.addArgument([ '-c', '--config' ], { help: 'Font config file' });
parser.addArgument([ '-i', '--src_font' ], { help: 'Source font path', required: true });
parser.addArgument([ '-o', '--glyphs_dir' ], { help: 'Glyphs output folder', required: true });
parser.addArgument([ '-d', '--diff_config' ], { help: 'Difference config output file' });
parser.addArgument([ '-f', '--force' ], { help: 'Force override glyphs from config', action: 'storeTrue' });
parser.addArgument([ '-n', '--names' ], { help: 'Try to guess new glyphs names', action: 'storeTrue' });

const args = parser.parseArgs();

let data = null;
let config = null;
const diff = [];

try {
  data = fs.readFileSync(args.src_font, 'utf-8');
} catch (e) {
  console.error('Can\'t read font file ' + args.src_font);
  process.exit(1);
}

if (args.config) {
  try {
    config = yaml.load(fs.readFileSync(args.config, 'utf-8'));
  } catch (e) {
    console.error('Can\'t read config file ' + args.config);
    process.exit(1);
  }
} else {
  config = { glyphs: [] };
}

let glyphs;

if (path.extname(args.src_font) === '.json') {
  glyphs = loadFontelloData(JSON.parse(data));
} else {
  glyphs = loadSvgData(data);
}

glyphs.forEach(function (glyph) {
  let exists = null;
  let glyphOut = {};

  // Convert multibyte unicode char to number
  glyph.unicode = fixedCharCodeAt(glyph.unicode);

  // if got config from existing font, then write only missed files
  if (config) {
    exists = _.find(config.glyphs, function (element) {
      // console.log('---' + element.from + '---' + glyph.unicode)
      return (element.from || element.code) === glyph.unicode;
    });

    if (exists && !args.force) {
      console.log((glyph.unicode.toString(16)) + ' exists, skipping');
      return;
    }
  }

  // Fix for FontForge: need space between old and new polyline
  glyph.d = glyph.d.replace(/zm/g, 'z m');

  glyph.svg = svgTemplate({
    d: glyph.d,
    width: glyph.width,
    height: glyph.height
  });

  if (exists) {
    // glyph exists in config, but we forced dump

    fs.writeFileSync(path.join(args.glyphs_dir, (exists.file || exists.css) + '.svg'), glyph.svg);
    console.log((glyph.unicode.toString(16)) + ' - Found, but override forced');
    return;
  }

  // Completely new glyph

  glyphOut = {
    css: glyph.name,
    code: glyph.unicode,
    uid: glyph.uid || crypto.randomBytes(16).toString('hex'),
    search: glyph.search || []
  };

  console.log((glyph.unicode.toString(16)) + ' - NEW glyph, writing...');

  let filename;

  if (args.names) {
    filename = glyph.name + '.svg';
  } else {
    if (glyph.unicode === +glyph.unicode) {
      filename = 'glyph__' + glyph.unicode.toString(16) + '.svg';
    } else {
      filename = 'glyph__' + glyph.unicode + '.svg';
    }
  }

  fs.writeFileSync(path.join(args.glyphs_dir, filename), glyph.svg);

  diff.push(glyphOut);
});

// Create config template for new glyphs, if option set
if (args.diff_config) {
  if (!diff.length) {
    console.log('No new glyphs, skip writing diff');
    process.exit(1);
  }

  fs.writeFileSync(
    args.diff_config,
    yaml.dump({ glyphs: diff }, { flowLevel: 3, styles: { '!!int': 'hexadecimal' } })
  );
}
