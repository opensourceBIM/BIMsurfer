/*
 * Generic utils
 */

export default class Utils {
	static hash(input) {
		  var hash = 0, i, chr;
		  if (input.length === 0) return hash;
		  for (i = 0; i < input.length; i++) {
		    chr   = input.charCodeAt(i);
		    hash  = ((hash << 5) - hash) + chr;
		    hash |= 0; // Convert to 32bit integer
		  }
		  return hash;
	}
}