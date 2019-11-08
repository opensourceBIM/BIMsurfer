/**
 * Executor allows to submit jobs for execution. Jobs are queued when the maxJobCount is exceeded.
 *
 */
export class Executor {
	constructor(maxJobCount) {
		this.jobCounter = 0;
		
		this.jobsToDo = {};
		this.idsToDo = [];
		this.jobsRunning = {};
		this.maxJobCount = maxJobCount;
		
		this.nrRunning = 0;
		this.jobsDone = 0;
	}
	
	add(job) {
		job.id = this.jobCounter++;
		if (this.nrRunning < this.maxJobCount) {
			return this.startJob(job);
		}
		this.jobsToDo[job.id] = job;
		this.idsToDo.push(job.id);
		return job.promise;
	}
	
	jobDone(job) {
		delete this.jobsRunning[job.id];
		this.jobsDone++;
		this.nrRunning--;
		if (this.nrRunning == 0 && this.idsToDo.length == 0) {
			this.done();
			return;
		}
		if (this.idsToDo.length > 0 && this.nrRunning < this.maxJobCount) {
			var jobId = this.idsToDo.splice(0, 1)[0];
			var job = this.jobsToDo[jobId];
			this.startJob(job);
		}
	}

	updateProgress() {
		if (this.progressListener != null) {
			this.progressListener(100 * this.jobsDone / this.jobCounter);
		}
	}
	
	startJob(job) {
		this.jobsRunning[job.id] = job;
		this.nrRunning++;
		this.updateProgress();
		var r;
		var newPromise = new Promise((resolve, reject) => {
			r = resolve;
		});
		var p = job.start();
		p.then(() => {
			r();
			this.jobDone(job);
		});
		return newPromise;
	}
	
	done() {
		if (this.resolve != null) {
			this.resolve();
		}
	}
	
	/*
	 * Will fire a promise when all jobs are done, a problem with this atm is that it should fire after all handlers of the tasks its promise have been handled, not sure how to do that
	 */
	awaitTermination() {
		if (this.terminationPromise == null) {
			this.terminationPromise = new Promise((resolve, reject) => {
				this.resolve = resolve;
			});
		}
		return this.terminationPromise;
	}
	
	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
}