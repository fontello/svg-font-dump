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
    '<path d="<%= path %>" transform="<%= transform %>"/>' +
    '</svg>'
  );


var parser = new ArgumentParser({
  version: require('./package.json').version,
  addHelp: true,
  description: 'Dump SVG font to separate glyphs'
});
parser.addArgument(
  [ '-c', '--config' ],
  {
    help: 'Font config file'
  }
);
parser.addArgument(
  [ '-i', '--src_font' ],
  {
    help: 'Source font path',
    required: true
  }
);
parser.addArgument(
  [ '-o', '--glyphs_dir' ],
  {
    help: 'Glyphs output folder',
    required: true
  }
);
parser.addArgument(
  [ '-d', '--diff_config' ],
  {
    help: 'Difference config output file'
  }
);
parser.addArgument(
  [ '-f', '--force' ],
  {
    help: 'Force override glyphs from config',
    action: 'storeTrue'
  }
);

var args = parser.parseArgs();


////////////////////////////////////////////////////////////////////////////////

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
    var path = glyph.getAttribute('d');

    var unicode = glyph.getAttribute('unicode');

    if (!unicode) { return; }

    unicode = unicode.length === 1 ? unicode.charCodeAt(0) : unicode;

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
    // scale
    transform += ' scale(' + scale + ')';
    // descent shift
    transform += ' translate(0 ' + descent + ')';

    // recalculate width & height
    width = width * scale;
    height = height * scale;

    result.push({
      path: path,
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

  glyph.svg = svg_template({
    path :glyph.path,
    transform : glyph.transform,
    width : glyph.width,
    height : glyph.height
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

  fs.writeFile(path.join(args.glyphs_dir, glyph.name + '.svg'), glyph.svg);

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
