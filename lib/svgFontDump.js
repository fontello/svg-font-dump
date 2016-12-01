'use strict';

const fs = require('mz/fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const co = require('co');
const mkdirp = require('mkdirp-then');

const fixedCharCodeAt = require('./utils/fixedCharCodeAt');
const loadSvgData = require('./utils/loadSvgData');
const loadFontelloData = require('./utils/loadFontelloData');

const svgTemplate = (width, height, d) => `
  <svg height="${height}" width="${width}" xmlns="http://www.w3.org/2000/svg">
    <path d="${d}" />
  </svg>
`;

const DEF_OPTIONS = {
  config: null,
  font: null,
  outputDir: null,
  diffConfig: null,
  force: false,
  names: false
};

function loadSvgFont (fontPath) {
  return fs.readFile(fontPath, 'utf-8')
    .catch(() => {
      throw new Error(`Can\'t read font file ${fontPath}`);
    });
}

function loadConfig (configPath) {
  if (!configPath) {
    return {glyphs: []};
  }

  return fs.readFile(configPath, 'utf-8')
    .then(yaml.load)
    .catch(() => {
      throw new Error(`Can\'t read config file ${configPath}`);
    });
}

function createConfigTemplate (diffConfigPath, diffGlyphs = []) {
  if (!diffConfigPath) {
    throw new Error('No diff config path passed');
  }

  if (!diffGlyphs.length) {
    // TODO: message
    // return new Error('No new glyphs, skip writing diff');
    return;
  }

  const options = {
    flowLevel: 3,
    styles: {
      '!!int': 'hexadecimal'
    }
  };

  const contents = yaml.dump({glyphs: diffGlyphs}, options);

  return fs.writeFile(diffConfigPath, contents)
    .catch(() => {
      throw new Error(`Can\'t save new config template`);
    });
}

module.exports = co.wrap(function* svgFontDump (options) {
  // Merge options with default options
  options = Object.assign({}, DEF_OPTIONS, options);

  const data = yield loadSvgFont(options.font);
  const config = yield loadConfig(options.config);

  const diff = [];

  // Create output directory if doesn't exist
  yield mkdirp(options.outputDir)
    .catch(() => {
      throw new Error(`Can\'t create glyph output directory ${options.outputDir}`);
    });

  const glyphs = path.extname(options.font) === '.json'
    ? loadFontelloData(JSON.parse(data))
    : loadSvgData(data);

  yield glyphs.map(function (glyph) {
    let exists = null;

    // Convert multibyte unicode char to number
    glyph.unicode = fixedCharCodeAt(glyph.unicode);

    // if got config from existing font, then write only missed files
    if (config) {
      exists = config.glyphs.find((element) => {
        // console.log('---' + element.from + '---' + glyph.unicode)
        return (element.from || element.code) === glyph.unicode;
      });

      if (exists && !options.force) {
        console.log((glyph.unicode.toString(16)) + ' exists, skipping');
        return;
      }
    }

    // Fix for FontForge: need space between old and new polyline
    glyph.d = glyph.d.replace(/zm/g, 'z m');

    glyph.svg = svgTemplate(glyph.width, glyph.height, glyph.d);

    // If glyph exists in config, but we forced dump
    if (exists) {
      const glyphName = path.join(options.outputDir, (exists.file || exists.css) + '.svg');
      console.log((glyph.unicode.toString(16)) + ' - Found, but override forced');
      return fs.writeFile(glyphName, glyph.svg);
    }

    // Completely new glyph
    const glyphOut = {
      css: glyph.name,
      code: glyph.unicode,
      uid: glyph.uid || crypto.randomBytes(16).toString('hex'),
      search: glyph.search || []
    };

    console.log((glyph.unicode.toString(16)) + ' - NEW glyph, writing...');

    let filename;

    if (options.names) {
      filename = glyph.name + '.svg';
    } else {
      if (glyph.unicode === +glyph.unicode) {
        filename = 'glyph__' + glyph.unicode.toString(16) + '.svg';
      } else {
        filename = 'glyph__' + glyph.unicode + '.svg';
      }
    }

    return fs.writeFile(path.join(options.outputDir, filename), glyph.svg)
      .then(() => {
        diff.push(glyphOut);
      });
  });

  // Create config template for new glyphs, if option set
  if (options.diffConfig) {
    yield createConfigTemplate(options.diffConfig, diff);
  }
});
