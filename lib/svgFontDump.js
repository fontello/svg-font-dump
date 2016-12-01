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

module.exports = function svgFontDump (options) {
  options = Object.assign({}, DEF_OPTIONS, options);

  let data = null;
  let config = null;
  const diff = [];

  try {
    data = fs.readFileSync(options.src_font, 'utf-8');
  } catch (e) {
    console.error('Can\'t read font file ' + options.src_font);
    process.exit(1);
  }

  if (options.config) {
    try {
      config = yaml.load(fs.readFileSync(options.config, 'utf-8'));
    } catch (e) {
      console.error('Can\'t read config file ' + options.config);
      process.exit(1);
    }
  } else {
    config = { glyphs: [] };
  }

  let glyphs;

  if (path.extname(options.src_font) === '.json') {
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

      fs.writeFileSync(path.join(options.glyphs_dir, (exists.file || exists.css) + '.svg'), glyph.svg);
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
    if (!diff.length) {
      console.log('No new glyphs, skip writing diff');
      process.exit(1);
    }

    fs.writeFileSync(
      options.diff_config,
      yaml.dump({ glyphs: diff }, { flowLevel: 3, styles: { '!!int': 'hexadecimal' } })
    );
  }
};
