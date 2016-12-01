'use strict';

const XMLDOMParser = require('xmldom').DOMParser;
const SvgPath = require('svgpath');

/**
 * Load glyphs data from SVG font
 */
module.exports = function loadSvgData (data) {
  const result = [];

  const xmlDoc = (new XMLDOMParser()).parseFromString(data, 'application/xml');

  const svgFont = xmlDoc.getElementsByTagName('font')[0];
  const svgFontface = xmlDoc.getElementsByTagName('font-face')[0];
  const svgGlyps = xmlDoc.getElementsByTagName('glyph');

  const fontHorizAdvX = svgFont.getAttribute('horiz-adv-x');
  const fontAscent = svgFontface.getAttribute('ascent');
  const fontUnitsPerEm = svgFontface.getAttribute('units-per-em') || 1000;

  const scale = 1000 / fontUnitsPerEm;

  svgGlyps.forEach((svgGlyph) => {
    const d = svgGlyph.getAttribute('d');

    // FIXME
    // Now just ignore glyphs without image, however
    // that can be space. Does anyone needs it?
    if (!d) {
      return;
    }

    const unicode = svgGlyph.getAttribute('unicode');
    const name = svgGlyph.getAttribute('glyph-name') || ('glyph' + unicode);
    const width = svgGlyph.getAttribute('horiz-adv-x') || fontHorizAdvX;

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
};
