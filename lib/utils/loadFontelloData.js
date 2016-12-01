const SvgPath = require('svgpath');

const fixedFromCharCode = require('./fixedFromCharCode');

// Load glyphs data from fontello's config (custom icons only)
module.exports = function loadFontelloData (data) {
  const result = [];

  data.glyphs.forEach((glyph) => {
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
};
