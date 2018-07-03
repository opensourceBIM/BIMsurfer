/*
 * Executor allows to submit jobs for execution. Jobs are queued when the maxJobCount is exceeded.
 *
 * Quality of this code has not been tested well!
 */

export default class Executor {
	constructor(simultanous, maxJobCount) {
		this.jobCounter = 0;
		
		this.jobsToDo = {};
		this.idsToDo = [];
		this.jobsRunning = {};
		this.simultanous = simultanous;
		
		this.nrRunning = 0;
	}
	
	add(job) {
		job.id = this.jobCounter++;
		if (this.nrRunning < this.simultanous) {
			this.jobsRunning[job.id] = job;
			this.nrRunning++;
			var p = job.start();
			p.then(() => {
				this.jobDone(job);
			});
			return p;
		}
		this.jobsToDo[job.id] = job;
		this.idsToDo.push(job.id);
		return job.promise;
	}
	
	jobDone(job) {
		delete this.jobsRunning[job.id];
		this.nrRunning--;
		if (this.nrRunning == 0 && this.idsToDo.length == 0) {
			this.done();
			return;
		}
		if (this.idsToDo.length > 0 && this.nrRunning < this.simultanous) {
			var jobId = this.idsToDo.splice(0, 1)[0];
			var job = this.jobsToDo[jobId];
			this.jobsRunning[jobId] = job;
			this.nrRunning++;
			var p = job.start();
			p.then(() => {
				this.jobDone(job);
			});
		}
	}
	
	done() {
		this.resolve();
	}
	
	/*
	 * Will fire a promise when all jobs are done
	 */
	awaitTermination() {
		if (this.terminationPromise == null) {
			this.terminationPromise = new Promise((resolve, reject) => {
				this.resolve = resolve;
			});
		}
		return this.terminationPromise;
	}
}