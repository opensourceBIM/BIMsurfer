/*
 * To be completed, not used
 */
export default class WorkForce {
	
	constructor() {
		this.workers = [];
		
		for (var i=0; i<navigator.hardwareConcurrency; i++) {
			var worker = new Worker("geometryworker.js");
			this.workers.push(worker);
		}
	}
	
	acquireWorker() {
		
	}
}