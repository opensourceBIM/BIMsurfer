/**
 * This class will return the API address for a BIMserver Client
 */

export class Address {
	static getApiAddress() {
		var pathname = document.location.pathname;
		if (pathname.length > 16 && pathname.indexOf("/apps/bimsurfer3/") != -1) {
			// We assume that BIMsurfer 3 is being served from a BIMserver and that this is also the BIMserver we would like to connect to
			const href = document.location.href;
			return href.substring(0, href.indexOf("/apps/bimsurfer3/"));
		} else {
			// Return a default
			console.log("Trying to connect to http://localhost:8082, because we don't know where to find BIMserver", document.location);
			return "http://localhost:8082";
		}
	}
}