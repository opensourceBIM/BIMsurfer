import {BufferSet} from "./bufferset.js";

/**
 * BufferManager keeps track of (CPU side) buffers, these buffers are eventually flushed to the GPU.
 * 
 * This class should be considered abstract. It contains all code that is shared by the implementations:
 * 	- BufferManagerPerColor (keeps a buffer alive per unique color)
 *  - BufferManagerTransparencyOnly (keeps two buffers alive, one for opaque objects and one for transparent)
 *  
 *  Because of allocation costs, buffers are reused. Flushed buffers will reset their indices (resetBuffer), subsequently overwriting old data.
 */
export class BufferManager {
	constructor(viewer, settings, renderer, bufferSetPool) {
		this.viewer = viewer;
		this.settings = settings;
		this.renderer = renderer;
		this.bufferSetPool = bufferSetPool;
		
		/*
		 * Speed/size tradeoff. Allocating huge buffers here means less calls to the GPU to flush, but especially when using the BufferManagerPerColor, 
		 * models with a lot of unique colors could potentially create a lot of buffers, each of MAX_BUFFER_SIZE. Smaller buffers also results in more updates 
		 * to the screen (good for progress indication)
		 */
		this.MAX_BUFFER_SIZE = 900000; // In number of vertex numbers, must be a multiple of 9

		// An average factor, amount of index numbers per vertex number
		this.indicesVerticesFactor = 0.5;
		
		// An average factor, amount of color numbers per vertex number
		this.colorBufferFactor = 1.33;
		
		// Map of buffers
		this.bufferSets = new Map();
		
		this.defaultSizes = {
			vertices: this.MAX_BUFFER_SIZE,
			normals: this.MAX_BUFFER_SIZE,
			indices: this.MAX_BUFFER_SIZE * this.indicesVerticesFactor,
			lineIndices: this.MAX_BUFFER_SIZE * this.indicesVerticesFactor,
			colors: this.MAX_BUFFER_SIZE * this.colorBufferFactor,
			pickColors: this.MAX_BUFFER_SIZE * this.colorBufferFactor
		};
	}

	/*
	 * Determines whether flushing is necessary, there are two reasons for flushing:
	 * - The given sizes are not going to fit in the buffer
	 * - The given sizes do not fit in a default buffer, in this case an exclusive buffer is given
	 */
	shouldFlush(sizes, buffer) {
		var result = 
			(sizes.vertices + (buffer != null ? buffer.positionsIndex : 0) > this.MAX_BUFFER_SIZE) || 
			(sizes.indices + (buffer != null ? buffer.indicesIndex : 0) > this.MAX_BUFFER_SIZE * this.indicesVerticesFactor) ||
			(sizes.lineIndices + (buffer != null ? buffer.lineIndicesIndex : 0) > this.MAX_BUFFER_SIZE * this.indicesVerticesFactor) ||
			(sizes.pickColors + (buffer != null ? buffer.pickColorsIndex : 0) > this.MAX_BUFFER_SIZE * this.colorBufferFactor);
		
		// Not storing the results in a variable resulted in this always returning something that evaluates to false...
		
		return result;
	}
	
	getDefaultByteSize() {
		var result = 
			this.defaultSizes.vertices * (this.settings.quantizeVertices ? 2 : 4) +
			this.defaultSizes.normals * (this.settings.quantizeNormals ? 1 : 4) +
			this.defaultSizes.indices * 4 +
			this.defaultSizes.lineIndices * 4;

		return result;
	}
	
	/*
	 * Get a buffer based on the given arguments, different implementations might not use all arguments
	 */
	getBufferSet(transparency, color, sizes) {
		if (this.shouldFlush(sizes, null)) {
			// The amount of geometry is more than the default buffer size, so this geometry gets its own buffer which also gets flushed right away
			var bufferSet = this.createBufferSet(transparency, color, sizes);
			// The renderer is responsable for flushing this buffer after it's populated, this flag tells it to do so
			bufferSet.needsToFlush = true;
			// We return immediately, and do _not_ store this buffer in the map, no need to
			return bufferSet;
		}
		var key = this.getKey(transparency, color, sizes);

		var bufferSet = this.bufferSets.get(key);
		if (bufferSet == null) {
			// Create a new buffer according to the defaults and store it in the buffers Map
			bufferSet = this.createBufferSetPooled(transparency, color, this.defaultSizes);
			this.bufferSets.set(key, bufferSet);
		} else {
			if (this.shouldFlush(sizes, bufferSet)) {
				// In this case we flush the buffer right away (it's already populated with data). We then reset it and return immediately after this.
				this.renderer.flushBuffer(bufferSet);
				this.resetBuffer(bufferSet);
			}
		}
		return bufferSet;
	}
	
	/*
	 * Default implementation to create a buffer, subclasses can add other buffers
	 */
	createBufferSet(hasTransparency, color, sizes) {
		return new BufferSet(this.viewer, this.settings, hasTransparency, color, sizes);
	}
	
	createBufferSetPooled(hasTransparency, color, sizes) {
		var bufferSet = this.bufferSetPool.lease(this, hasTransparency, color, sizes);
		bufferSet.hasTransparency = hasTransparency;
		bufferSet.color = color;
		return bufferSet;
	}
	
	clear() {
		for (var bufferSet of this.bufferSets.values()) {
			this.bufferSetPool.release(bufferSet);
		}
		this.bufferSets = null;
	}
	
	resetBuffer(bufferSet) {
		if (bufferSet.reset) {
			bufferSet.reset(this.viewer);
		}
	}
	
	getAllBuffers() {
		return this.bufferSets.values();
	}
}