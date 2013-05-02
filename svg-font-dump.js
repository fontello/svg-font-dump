#!/usr/bin/env node

'use strict';

var fs      = require('fs');
var path    = require('path');
var crypto  = require('crypto');
var _       = require('lodash');
var yaml    = require('js-yaml');
var sax     = require('sax');
var ArgumentParser = require('argparse').ArgumentParser;

var svg_template =
    '<svg height="${height}px" width="${width}px"' +
    ' xmlns="http://www.w3.org/2000/svg">' + "\n" +
    '  <path d="${path}" transform="${transform}" />' + "\n" +
    '</svg>';


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

function font_dump(data, callback) {

  var result = []
    , path
    , width
    , height
    , scale
    , fontHorizAdvX
    , ascent
    , descent
    , unicode
    , name
    , transform
    , glyphSize = 1000
    , parser;

  parser = sax.parser(true/* strict */, {
    trim: true,
    normalize: true,
    lowercase: true,
    xmlns: true,
    position: false
  });

  parser.onopentag = function(node) {
    if (Object.keys(node.attributes).length) {
      // get horiz-adv-x from <font>
      if (node.name === 'font' && node.attributes['horiz-adv-x']) {
        fontHorizAdvX = node.attributes['horiz-adv-x'].value;
      }

      // get ascent from <font-face>
      if (node.name === 'font-face' && node.attributes.ascent) {
        ascent = +node.attributes.ascent.value;
      }

      // get descent from <font-face>
      if (node.name === 'font-face' && node.attributes.descent) {
        descent = -node.attributes.descent.value;
      }

      // each <glyph>
      if (node.name === 'glyph' && node.attributes.d) {
        // path
        path = node.attributes.d.value;

        // width
        width = node.attributes['horiz-adv-x'] ?
                    node.attributes['horiz-adv-x'].value :
                    fontHorizAdvX;

        // height
        height = ascent + descent;

        // scale
        scale = glyphSize / height;

        // unicode
        if (!node.attributes.unicode) { return; }

        // patch glyph codes spelling
        unicode = node.attributes.unicode.value.replace(/unicode="&#x([a-f0-9]+);"/g, 'unicode="0x$1"');

        // if 1 char -> direct definition
        unicode = unicode.length === 1 ?
                    unicode.charCodeAt(0) :
                    parseInt(unicode, 16);

        // name
        name = node.attributes['glyph-name'] ?
                    node.attributes['glyph-name'].value :
                    unicode.toString(16);

        // vertical mirror
        transform = 'translate(0 ' + (glyphSize / 2) + ') scale(1 -1) translate(0 ' + (-glyphSize / 2) + ')';
        // scale
        transform += ' scale(' + scale + ')';
        // descent shift
        transform += ' translate(0 ' + descent + ')';

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
      }
    }
  };

  parser.onend = function() {
    callback(result);
  };

  parser.write(data).close();
}

////////////////////////////////////////////////////////////////////////////////


var data, config;

try {
  data = fs.readFileSync(args.src_font, 'utf-8');
} catch (e) {
  console.error('Can\'t read font file ' + args.src_font);
}

try {
  config = yaml.load(fs.readFileSync(args.config, 'utf-8'));  
} catch (e) {
  console.error('Can\'t read config file ' + args.config);  
}

font_dump(data, function(glyphs) {

  var diff = [];

  console.log('Writing output:\n\n');

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

    glyph.svg = svg_template
      .replace('${path}', glyph.path)
      .replace('${transform}', glyph.transform)
      .replace('${width}', glyph.width)
      .replace('${height}', glyph.height);

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

});
