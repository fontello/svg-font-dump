'use strict';

/**
 * Int to char, with fix for big numbers
 * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/fromCharCode
 * @param  {[type]} code [description]
 * @return {String}
 */
module.exports = function fixedFromCharCode (code) {
  if (code > 0xffff) {
    code -= 0x10000;

    const surrogate1 = 0xd800 + (code >> 10);
    const surrogate2 = 0xdc00 + (code & 0x3ff);

    return String.fromCharCode(surrogate1, surrogate2);
  } else {
    return String.fromCharCode(code);
  }
};
