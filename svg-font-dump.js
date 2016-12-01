#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var _ = require('lodash');
var yaml = require('js-yaml');
var SvgPath = require('svgpath');
var XMLDOMParser = require('xmldom').DOMParser;
var ArgumentParser = require('argparse').ArgumentParser;

var svgTemplate = _.template(
    '<svg height="<%= height %>" width="<%= width %>" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="<%= d %>" />' +
    '</svg>'
  );

var parser = new ArgumentParser({
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

var args = parser.parseArgs();

// //////////////////////////////////////////////////////////////////////////////

// Int to char, with fix for big numbers
// see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/fromCharCode
//
function fixedFromCharCode (code) {
  /* jshint bitwise: false */
  if (code > 0xffff) {
    code -= 0x10000;

    var surrogate1 = 0xd800 + (code >> 10);
    var surrogate2 = 0xdc00 + (code & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2);
  } else {
    return String.fromCharCode(code);
  }
}
// Char to Int, with fix for big numbers
//
function fixedCharCodeAt (chr) {
  /* jshint bitwise: false */
  var char1 = chr.charCodeAt(0);
  var char2 = chr.charCodeAt(1);

  if ((chr.length >= 2) &&
      ((char1 & 0xfc00) === 0xd800) &&
      ((char2 & 0xfc00) === 0xdc00)) {
    return 0x10000 + ((char1 - 0xd800) << 10) + (char2 - 0xdc00);
  } else {
    return char1;
  }
}

// Load glyphs data from SVG font
//
function loadSvgData (data) {
  var result = [];

  var xmlDoc = (new XMLDOMParser()).parseFromString(data, 'application/xml');

  var svgFont = xmlDoc.getElementsByTagName('font')[0];
  var svgFontface = xmlDoc.getElementsByTagName('font-face')[0];
  var svgGlyps = xmlDoc.getElementsByTagName('glyph');

  var fontHorizAdvX = svgFont.getAttribute('horiz-adv-x');
  var fontAscent = svgFontface.getAttribute('ascent');
  var fontUnitsPerEm = svgFontface.getAttribute('units-per-em') || 1000;

  var scale = 1000 / fontUnitsPerEm;

  _.each(svgGlyps, function (svgGlyph) {
    var d = svgGlyph.getAttribute('d');

    // FIXME
    // Now just ignore glyphs without image, however
    // that can be space. Does anyone needs it?
    if (!d) { return; }

    var unicode = svgGlyph.getAttribute('unicode');
    var name = svgGlyph.getAttribute('glyph-name') || ('glyph' + unicode);
    var width = svgGlyph.getAttribute('horiz-adv-x') || fontHorizAdvX;

    result.push({
      d: new SvgPath(d)
              .translate(0, -fontAscent)
              .scale(scale, -scale)
              .abs()
              .round(1)
              .rel()
              .round(1)
              .toString(),

      unicode: unicode,
      name: name,
      width: (width * scale).toFixed(1),
      height: 1000
    });
  });

  return result;
}

// Load glyphs data from fontello's config (custom icons only)
//
function loadFontelloData (data) {
  var result = [];

  _.each(data.glyphs, function (glyph) {
    // FIXME
    // Now just ignore glyphs without image, however
    // that can be space. Does anyone needs it?
    if (!(glyph.svg && glyph.svg.path)) { return; }

    result.push({
      // d: glyph.svg.path,
      d: new SvgPath(glyph.svg.path)
              .abs()
              .round(1)
              .rel()
              .round(1)
              .toString(),
      width: glyph.svg.width.toFixed(1),
      height: 1000,

      uid: glyph.uid,
      unicode: fixedFromCharCode(glyph.code),
      name: glyph.css || ('glyph' + glyph.code),
      search: glyph.search || []
    });
  });

  return result;
}

// //////////////////////////////////////////////////////////////////////////////

var data = null;
var config = null;
var diff = [];

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

var glyphs;

if (path.extname(args.src_font) === '.json') {
  glyphs = loadFontelloData(JSON.parse(data));
} else {
  glyphs = loadSvgData(data);
}

glyphs.forEach(function (glyph) {
  var exists = null;
  var glyphOut = {};

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

  var filename;

  if (args.names) {
    filename = glyph.name + '.svg';
  } else {
    if (glyph.unicode === +glyph.unicode) {
      filename = 'glyph__' + glyph.unicode.toString(16) + '.svg';
    } else {
      filename = 'glyph__' + glyph.unicode + '.svg';
    }
  }

  fs.writeFile(path.join(args.glyphs_dir, filename), glyph.svg);

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
