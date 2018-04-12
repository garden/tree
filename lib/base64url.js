exports.fromBase64 =
function base64urlFromBase64(b) {
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};
