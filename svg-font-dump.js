#!/usr/bin/env node

'use strict';

var fs      = require('fs');
var path    = require('path');
var crypto  = require('crypto');
var _       = require('lodash');
var yaml    = require('js-yaml');
var SvgPath = require('svgpath');
var XMLDOMParser    = require('xmldom').DOMParser;


var svg_template = _.template(
    '<svg height="<%= height %>" width="<%= width %>" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="<%= d %>" />' +
    '</svg>'
  );





////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

if(require.main!=module){/*Use as a module*/module.exports={DumpSVG:DumpSVG}
}else{/*Use from the command line*/ 
var ArgumentParser  = require('argparse').ArgumentParser;

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
parser.addArgument([ '-x', '--numeric_names' ], { help: 'If truthy 1|true|yes|etc use Unicode number as the output filenames.svg' });

var args = parser.parseArgs();
DumpSVG(args)
}


////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

// Int to char, with fix for big numbers
// see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/fromCharCode
//
function fixedFromCharCode(code) {
  /*jshint bitwise: false*/
  if (code > 0xffff) {
    code -= 0x10000;

    var surrogate1 = 0xd800 + (code >> 10)
      , surrogate2 = 0xdc00 + (code & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2);
  } else {
    return String.fromCharCode(code);
  }
}
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


// Load glyphs data from SVG font
//
function load_svg_data(data) {

  var result = [];

  var xmlDoc = (new XMLDOMParser()).parseFromString(data, "application/xml");

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
      width: (width*scale).toFixed(1),
      height: 1000
    });
  });

  return result;
}


// Load glyphs data from fontello's config (custom icons only)
//
function load_fontello_data(data) {

  var result = [];

  _.each(data.glyphs, function (glyph) {

    // FIXME
    // Now just ignore glyphs without image, however
    // that can be space. Does anyone needs it?
    if (!(glyph.svg && glyph.svg.path)) { return; }

    result.push({
      //d: glyph.svg.path,
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

////////////////////////////////////////////////////////////////////////////////
function MakeDirectory(fp){/*Check or make a folder/folders. Input a path with forward slashes only, ending in "/". Returns the path or an empty string if it fails.*/fp=''+fp;var fp0=fp.replace(/\x5c/g,'/');try{if(fs.statSync(fp0).isDirectory()){return fp0}}catch(er){}var p=fp.indexOf('\\');var q=fp.indexOf('/',Math.max(3,p));var fp1=fp.substr(0,q).replace(/\x5c/g,'/');if(!fp1){return ''}var fp2=fp1+'\\'+fp.substr(Math.max(p,q)+1);var fp3=fp1.replace(/\x5c/g,'/');try{if(fs.statSync(fp3).isDirectory()){return MakeDirectory(fp2)}}catch(er){}try{fs.mkdirSync(fp3,process.umask())}catch(er){return ''}return MakeDirectory(fp2)}


function DumpSVG(args){
//just wrapped the remainder of the code in this function for module.exports
var data, config, diff = [];
if(args.i){args.src_font=args.i} // i/o seem appropriate property names Input/Output
if(args.o){args.glyphs_dir=args.o} //that match -i, -o for the CLI ~ use them if they are present on args
if(args.x){args.numeric_names=args.x} //added numeric_names option here and to the CLI options above
/*trim leading|trailing whitespace, push all slashes forward, ensure path ends with "/" */ 
var fp=(args.glyphs_dir.replace(/^\s+|\s+$/g,'').replace(/\x5c/g,'/')+'/').replace(/\x2f{2}$/,'/')
/*MakeDirectory checks folder exists, or tries to  make that directory tree if it does not*/
if(!MakeDirectory(fp)){console.log('Unable to find or make Output folder (-o). Check -o path and retry:'+fp);process.exit()}



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
  glyphs = load_fontello_data(JSON.parse(data));
} else {
  glyphs = load_svg_data(data);
}


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
    width     : glyph.width,
    height    : glyph.height
  });

  if (exists) {
    // glyph exists in config, but we forced dump
// not sure if args.numeric_names  needs to go here as well
    fs.writeFileSync(path.join(args.glyphs_dir, (exists.file || exists.css) + '.svg'), glyph.svg);
    console.log((glyph.unicode.toString(16)) + ' - Found, but override forced');
    return;
  }

  // Completely new glyph

  glyph_out = {
    css: glyph.name,
    code: glyph.unicode,
    uid: glyph.uid || crypto.randomBytes(16).toString('hex'),
    search: glyph.search || []
  };

  

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

if(args.numeric_names){filename=glyph.unicode+'.svg'} 
//use numeric_names, as set in args={x:1|numeric_names:true} or "-x yes" CLI option above
// moved log here, just wanted to see output paths
var SaveAs=path.join(args.glyphs_dir, filename)
console.log((glyph.unicode.toString(16)) + ' - NEW glyph, writing ~ '+SaveAs);

  fs.writeFile(SaveAs, glyph.svg);

  diff.push(glyph_out);

});

// Create config template for new glyphs, if option set
if (args.diff_config) {

  if (!diff.length) {
    console.log("No new glyphs, skip writing diff");
    return;
  }

  fs.writeFileSync(
    args.diff_config,
    yaml.dump({ glyphs: diff }, { flowLevel: 3, styles: { '!!int': 'hexadecimal' } })
  );
}


}