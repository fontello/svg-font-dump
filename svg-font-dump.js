#!/usr/bin/env node

'use strict';

var fs      = require('fs');
var path    = require('path');
var crypto  = require('crypto');
var _       = require('lodash');
var yaml    = require('js-yaml');
var DOMParser      = require('xmldom').DOMParser;
var ArgumentParser = require('argparse').ArgumentParser;

var svg_template = _.template(
    '<svg height="<%= height %>" width="<%= width %>" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="<%= d %>"<% if (transform) { %> transform="<%= transform %>"<% } %>/>' +
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
parser.addArgument([ '-f', '--force' ], { help: 'Force override glyphs from config', action: 'storeTrue'});
parser.addArgument([ '-n', '--names' ], { help: 'Try to guess new glyphs names', action: 'storeTrue'});

var args = parser.parseArgs();


////////////////////////////////////////////////////////////////////////////////

// Int to char, with fix for big numbers
// see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/fromCharCode
//
//function fixedFromCharCode(code) {
//  /*jshint bitwise: false*/
//  if (code > 0xffff) {
//    code -= 0x10000;
//
//    var surrogate1 = 0xd800 + (code >> 10)
//      , surrogate2 = 0xdc00 + (code & 0x3ff);
//
//    return String.fromCharCode(surrogate1, surrogate2);
//  } else {
//    return String.fromCharCode(code);
//  }
//}
// Char to Int, with fix for big numbers
//
function fixedCharCodeAt(chr) {
  /*jshint bitwise: false*/
  var char1 = chr.charCodeAt(0)
    , char2 = chr.charCodeAt(1);

  if ((chr.length >= 2) &&
      ((char1 & 0xfc00) === 0xd800) &&
      ((char2 & 0xfc00) === 0xdc00)) {
    return 0x10000 + ((char1 - 0xd800) << 10) + (char2 - 0xdc00);
  } else {
    return char1;
  }
}


function font_dump(data) {

  var result = []
    , fontHorizAdvX
    , ascent
    , descent

    , glyphSize = 1000

    , doc;

  doc = (new DOMParser()).parseFromString(data, "application/xml");

  var font = doc.getElementsByTagName('font')[0];
  var fontFace = font.getElementsByTagName('font-face')[0];

  fontHorizAdvX = +font.getAttribute('horiz-adv-x');
  ascent        = +fontFace.getAttribute('ascent');
  descent       = -fontFace.getAttribute('descent');

  _.each(font.getElementsByTagName('glyph'), function(glyph) {

    // Ignore empty glyphs (with empty code or path)
    if (!glyph.hasAttribute('d')) { return; }
    if (!glyph.hasAttribute('unicode')) { return; }

    var d = glyph.getAttribute('d');

    var unicode = glyph.getAttribute('unicode');

    var name = glyph.getAttribute('glyph-name') || ('glyph' + unicode);

    //
    // Rescale & Transform from scg fomt to svg image coordinates
    // !!! Transforms go in back order !!!
    //

    var width = glyph.getAttribute('horiz-adv-x') || fontHorizAdvX;
    var height = ascent + descent;
    var scale = glyphSize / height;

    // vertical mirror
    var transform = 'translate(0 ' + (glyphSize / 2) + ') scale(1 -1) translate(0 ' + (-glyphSize / 2) + ')';

    if (scale !== 1) {
      // scale size, only when needed
      transform += ' scale(' + scale + ')';
      // recalculate width & height
      width = width * scale;
      height = height * scale;
    }
    // descent shift
    transform += ' translate(0 ' + descent + ')';


    result.push({
      d: d,
      transform: transform,
      unicode: unicode,
      name: name,
      width: width,
      height: height
    });
  });

  return result;
}

////////////////////////////////////////////////////////////////////////////////


var data, config, diff = [];

try {
  data = fs.readFileSync(args.src_font, 'utf-8');
} catch (e) {
  console.error('Can\'t read font file ' + args.src_font);
  process.exit(1);
}

try {
  config = yaml.load(fs.readFileSync(args.config, 'utf-8'));
} catch (e) {
  console.error('Can\'t read config file ' + args.config);
  process.exit(1);
}

var glyphs = font_dump(data);

glyphs.forEach(function(glyph) {

  var exists,
      glyph_out = {};

  // Convert multibyte unicode char to number
  glyph.unicode = fixedCharCodeAt(glyph.unicode);

  // if got config from existing font, then write only missed files
  if (config) {
    exists = _.find(config.glyphs, function(element) {
      //console.log('---' + element.from + '---' + glyph.unicode)
      return (element.from || element.code) === glyph.unicode;
    });

    if (exists && !args.force) {
      console.log((glyph.unicode.toString(16)) + ' exists, skipping');
      return;
    }
  }

  // Fix for FontForge: need space between old and new polyline
  glyph.d = glyph.d.replace(/zm/g, 'z m');

  glyph.svg = svg_template({
    d         : glyph.d,
    transform : glyph.transform,
    width     : glyph.width,
    height    : glyph.height
  });

  if (exists) {
    // glyph exists in config, but we forced dump

    fs.writeFileSync(path.join(args.glyphs_dir, (exists.file || exists.css) + '.svg'), glyph.svg);
    console.log((glyph.unicode.toString(16)) + ' - Found, but override forced');
    return;
  }

  // Completely new glyph

  glyph_out = {
    css: glyph.name,
    code: '0x' + glyph.unicode.toString(16),
    uid: crypto.randomBytes(16).toString('hex'),
    search: []
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

  diff.push(glyph_out);

});

// Create config template for new glyphs, if option set
if (args.diff_config) {

  if (!diff.length) {
    console.log("No new glyphs, skip writing diff");
    return;
  }

  fs.writeFileSync(args.diff_config, yaml.dump({glyphs: diff}));
}
