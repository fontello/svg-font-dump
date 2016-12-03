'use strict';

/**
 * Char to Int, with fix for big numbers
 */
module.exports = function fixedCharCodeAt (chr) {
  /* jshint bitwise: false */
  const char1 = chr.charCodeAt(0);
  const char2 = chr.charCodeAt(1);

  if ((chr.length >= 2) &&
      ((char1 & 0xfc00) === 0xd800) &&
      ((char2 & 0xfc00) === 0xdc00)) {
    return 0x10000 + ((char1 - 0xd800) << 10) + (char2 - 0xdc00);
  } else {
    return char1;
  }
};
