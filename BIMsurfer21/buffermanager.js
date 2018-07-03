/*
 * BufferManager keeps track of (CPU side) buffers, these buffers are eventually flushed to the GPU.
 * 
 * This class should be considered abstract. It contains all code that is shared by the implementations:
 * 	- BufferManagerPerColor (keeps a buffer alive per unique color)
 *  - BufferManagerTransparencyOnly (keeps two buffers alive, one for opaque objects and one for transparent)
 *  
 *  Because of allocation costs, buffers are reused. Flushed buffers will reset their indices (resetBuffer), subsequently overwriting old data.
 */

export default class BufferManager {
	constructor(settings, renderer) {
		this.settings = settings;
		this.renderer = renderer;
		
		/*
		 * Speed/size tradeoff. Allocating huge buffers here means less calls to the GPU to flush, but especially when using the BufferManagerPerColor, 
		 * models with a lot of unique colors could potentially create a lot of buffers, each of MAX_BUFFER_SIZE. Smaller buffers also results in more updates 
		 * to the screen (good for progress indication)
		 */		
		this.MAX_BUFFER_SIZE = 45000; // In number of vertex numbers, must be a multiple of 9

		// An average factor, amount of index numbers per vertex number
		this.indicesVerticesFactor = 0.5;
		
		// An average factor, amount of color numbers per vertex number
		this.colorBufferFactor = 1.33;
		
		// Map of buffers
		this.buffers = new Map();
		
		this.defaultSizes = {
			vertices: this.MAX_BUFFER_SIZE,
			normals: this.MAX_BUFFER_SIZE,
			indices: this.MAX_BUFFER_SIZE * this.indicesVerticesFactor,
			colors: this.MAX_BUFFER_SIZE * this.colorBufferFactor
		};
	}

	/*
	 * Determines whether flushing is necessary, there are two reasons for flushing:
	 * - The given sizes are not going to fit in the buffer
	 * - The given sizes do not fit in a default buffer, in this case an exclusive buffer is given
	 */
	shouldFlush(sizes, buffer) {
		var result = (sizes.vertices + (buffer != null ? buffer.positionsIndex : 0) > this.MAX_BUFFER_SIZE) || 
		(sizes.indices + (buffer != null ? buffer.indicesIndex : 0) > this.MAX_BUFFER_SIZE * this.indicesVerticesFactor);
		
		// Not storing the results in a variable resulted in this always returning something that evaluates to false...
		
		return result;
	}
	
	/*
	 * Get a buffer based on the given arguments, different implementations might not use all arguments
	 */
	getBuffer(transparency, color, sizes) {
		if (this.shouldFlush(sizes, null)) {
			// The amount of geometry is more than the default buffer size, so this geometry gets its own buffer which also gets flushed right away
			var buffer = this.createBuffer(transparency, color, sizes);
			// The renderer is responsable for flushing this buffer after it's populated, this flag tells it to do so
			buffer.needsToFlush = true;
			// We return immediately, and do _not_ store this buffer in the map, no need to
			return buffer;
		}
		var key = this.getKey(transparency, color, sizes);

		var buffer = this.buffers.get(key);
		if (buffer == null) {
			// Create a new buffer according to the defaults and store it in the buffers Map
			buffer = this.createBuffer(transparency, color, this.defaultSizes);
			this.buffers.set(key, buffer);
		} else {
			if (this.shouldFlush(sizes, buffer)) {
				// In this case we flush the buffer right away (it's already populated with data). We than reset it and return immediately after this.
				this.renderer.flushBuffer(buffer);
				this.resetBuffer(buffer);
			}
		}
		return buffer;
	}
	
	/*
	 * Default implementation to create a buffer, subclasses can add other buffers
	 */
	createBuffer(hasTransparency, color, sizes) {
		var buffer = {
			positions: this.settings.quantizeVertices ? new Int16Array(sizes.vertices) : new Float32Array(sizes.vertices),
			positionsIndex: 0,
			normals: this.settings.quantizeNormals ? new Int8Array(sizes.normals) : new Float32Array(sizes.normals),
			normalsIndex: 0,
			indices: new Uint32Array(sizes.indices), // The optimal buffer size is most definitely above the Uint16 threshold, so always use Uint32Array
			indicesIndex: 0,
			nrIndices: 0,
			hasTransparency: hasTransparency,
			color: color
		};
		return buffer;
	}
	
	clear() {
		this.buffers = null;
	}
	
	resetBuffer(buffer) {
		buffer.positionsIndex = 0;
		buffer.normalsIndex = 0;
		buffer.indicesIndex = 0;
		buffer.nrIndices = 0;
	}
	
	getAllBuffers() {
		return this.buffers.values();
	}
}