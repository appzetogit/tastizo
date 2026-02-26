/**
 * Google Polyline Algorithm Encoder
 * Encodes array of [lat, lng] or {lat, lng} to encoded string for Firebase/Google Maps.
 */

function encodeSignedNumber(num) {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  let result = "";
  while (sgn >= 0x20) {
    result += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
    sgn >>= 5;
  }
  result += String.fromCharCode(sgn + 63);
  return result;
}

/**
 * Encode coordinates to Google encoded polyline string.
 * @param {Array<[lat, lng]|{lat, lng}>} coordinates - Array of [lat, lng] or { lat, lng }
 * @returns {string} Encoded polyline string
 */
export function encodePolyline(coordinates) {
  if (!coordinates || coordinates.length === 0) return "";
  let prevLat = 0;
  let prevLng = 0;
  let result = "";
  for (const pt of coordinates) {
    const lat = Array.isArray(pt) ? pt[0] : pt.lat;
    const lng = Array.isArray(pt) ? pt[1] : pt.lng;
    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);
    result += encodeSignedNumber(lat5 - prevLat);
    result += encodeSignedNumber(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return result;
}
