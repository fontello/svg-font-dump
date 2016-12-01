'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

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
  src_font: null,
  glyphs_dir: null,
  diff_config: null,
  force: null,
  names: null
};

function loadSvgFont (fontPath) {
  let data;

  try {
    data = fs.readFileSync(fontPath, 'utf-8');
  } catch (e) {
    console.error(`Can\'t read font file ${fontPath}`);
    process.exit(1);
  }

  return data;
}

function loadConfig (configPath) {
  let config;

  if (configPath) {
    try {
      config = yaml.load(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error(`Can\'t read config file ${configPath}`);
      process.exit(1);
    }
  } else {
    config = {
      glyphs: []
    };
  }

  return config;
}

function createConfigTemplate (diffConfigPath, diffGlyphs = []) {
  if (diffConfigPath) {
    console.log('No diff config path passed');
    process.exit(1);
  }

  if (!diffGlyphs) {
    console.log('No new glyphs, skip writing diff');
    process.exit(1);
  }

  const contents = yaml.dump({ glyphs: diffGlyphs }, { flowLevel: 3, styles: { '!!int': 'hexadecimal' } });

  return fs.writeFileSync(diffConfigPath, contents);
}

module.exports = function svgFontDump (options) {
  // Merge options with default options
  options = Object.assign({}, DEF_OPTIONS, options);

  const data = loadSvgFont(options.src_font);
  const config = loadConfig(options.config);

  const diff = [];

  const glyphs = path.extname(options.src_font) === '.json'
    ? loadFontelloData(JSON.parse(data))
    : loadSvgData(data);

  glyphs.forEach(function (glyph) {
    let exists = false;

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

    if (exists) {
      // glyph exists in config, but we forced dump
      const glyphName = path.join(options.glyphs_dir, (exists.file || exists.css) + '.svg');

      fs.writeFileSync(glyphName, glyph.svg);
      console.log((glyph.unicode.toString(16)) + ' - Found, but override forced');
      return;
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

    fs.writeFileSync(path.join(options.glyphs_dir, filename), glyph.svg);

    diff.push(glyphOut);
  });

  // Create config template for new glyphs, if option set
  if (options.diff_config) {
    createConfigTemplate(options.diff_config, diff);
  }
};
