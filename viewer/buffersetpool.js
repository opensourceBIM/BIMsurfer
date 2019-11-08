/**
 * Keeps track of a collections of buffersets that can be reused. The main reason is that we don't have to allocate new memory for each new bufferset
 */
export class BufferSetPool {
	constructor(maxPoolSize, stats) {
		this.maxPoolSize = maxPoolSize;
		this.stats = stats;
		
		this.currentPoolSize = 0;
		
		this.available = new Set();
		this.used = new Set();
		
		window.buffersetpool = this;
	}
	
	lease(bufferManager, hasTransparency, color, sizes) {
		if (this.currentPoolSize >= this.maxPoolSize) {
			throw "Maximum pool size exceeded";
		}
		
		if (this.available.size > 0) {
			var bufferSet = this.available.keys().next().value;
			this.used.add(bufferSet);
			this.available.delete(bufferSet);
			this.stats.setParameter("BufferSet pool", "Used", this.used.size);
			this.stats.setParameter("BufferSet pool", "Available", this.available.size);
			this.stats.setParameter("BufferSet pool", "Total memory", this.currentPoolSize * bufferManager.getDefaultByteSize());
			
			return bufferSet;
		}
		var newBufferSet = bufferManager.createBufferSet(hasTransparency, color, sizes);
		this.currentPoolSize++;
		this.used.add(newBufferSet);
		this.stats.setParameter("BufferSet pool", "Used", this.used.size);
		this.stats.setParameter("BufferSet pool", "Available", this.available.size);
		this.stats.setParameter("BufferSet pool", "Total memory", this.currentPoolSize * bufferManager.getDefaultByteSize());
		return newBufferSet;
	}
	
	release(bufferSet) {
		this.used.delete(bufferSet);
		this.available.add(bufferSet);
		
		this.stats.setParameter("BufferSet pool", "Used", this.used.size);
		this.stats.setParameter("BufferSet pool", "Available", this.available.size);
		
		bufferSet.positionsIndex = 0;
		bufferSet.normalsIndex = 0;
		bufferSet.indicesIndex = 0;
		bufferSet.nrIndices = 0;
		bufferSet.colorsIndex = 0;
	}
	
	cleanup() {
		this.available.clear();
		this.used.clear();
		this.currentPoolSize = 0;
		this.stats.setParameter("BufferSet pool", "Used", this.used.size);
		this.stats.setParameter("BufferSet pool", "Available", this.available.size);
		this.stats.setParameter("BufferSet pool", "Total memory", 0);
	}
}