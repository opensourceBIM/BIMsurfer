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
	constructor(settings, renderer, bufferSetPool) {
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
			(sizes.pickColors + (buffer != null ? buffer.pickColorsIndex : 0) > this.MAX_BUFFER_SIZE * this.colorBufferFactor);
		
		// Not storing the results in a variable resulted in this always returning something that evaluates to false...
		
		return result;
	}
	
	getDefaultByteSize() {
		var result = 
			this.defaultSizes.vertices * (this.settings.quantizeVertices ? 2 : 4) +
			this.defaultSizes.normals * (this.settings.quantizeNormals ? 1 : 4) +
			this.defaultSizes.indices * 4;

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
		var bufferSet = {
			positions: this.settings.quantizeVertices ? new Int16Array(sizes.vertices) : new Float32Array(sizes.vertices),
			positionsIndex: 0,
			normals: this.settings.quantizeNormals ? new Int8Array(sizes.normals) : new Float32Array(sizes.normals),
			normalsIndex: 0,
			pickColors: new Uint32Array(sizes.pickColors),
			pickColorsIndex: 0,
			indices: new Uint32Array(sizes.indices), // The optimal buffer size is most definitely above the Uint16 threshold, so always use Uint32Array
			indicesIndex: 0,
			nrIndices: 0,
			hasTransparency: hasTransparency,
			color: color,
			bytes: 0,
			geometryIdToIndex: new Map(),
			// @todo not a class so this does not work well
			computeVisibleRanges: (self, ids, gl) => {
				var tmp;
				if ((tmp = self.visibleRanges.get(ids))) {
					return tmp;
				}

				if (ids === null || ids.size === 0) {
					return [[0, self.nrIndices]];
				}

				function* _() {
					var oids;
					for (var i of ids) {
						if ((oids = self.geometryIdToIndex.get(i))) {
							for (var j = 0; j < oids.length; ++j) {
								yield [oids[j].start, oids[j].start + oids[j].length];
							}
						}
					}
				};

				var r = Array.from(_()).sort();
				self.visibleRanges.set(ids, r);

				// 

				// console.log("visible", r);

				if (r.length) {
				
				var a = r[0][0], b = r[0][1];
				
				var old2 = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
				var tmp = new Float32Array(self.nrPositions); // not divided by 3?
				// console.log("nrPositions create", self.nrPositions);
				gl.bindBuffer(gl.ARRAY_BUFFER, self.positionBuffer);
				gl.getBufferSubData(gl.ARRAY_BUFFER, 0, tmp);
				gl.bindBuffer(gl.ARRAY_BUFFER, old2);

				var old = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, self.indexBuffer);
				var origArr = new Uint32Array(b-a);
				gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, a * 4, origArr, 0, origArr.length);

				/* for (var idx of origArr) {
					console.log(idx, tmp[idx*3+0], tmp[idx*3+1], tmp[idx*3+2]);
				} */

				var newArr = new Uint32Array((b-a) * 2);
				var j = 0;
				for (var i = 0; i < origArr.length; i += 3) {
					newArr[j++] = origArr[i  ];
					newArr[j++] = origArr[i+1];
					newArr[j++] = origArr[i+1];
					newArr[j++] = origArr[i+2];
					newArr[j++] = origArr[i+2];
					newArr[j++] = origArr[i  ];
				}
				var lineIndexBuffer = gl.createBuffer();
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
				gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, newArr, gl.STATIC_DRAW);
				self.lineIndexBuffers.set(ids[0], {'buffer': lineIndexBuffer, 'count': newArr.length});
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, old);

				// console.log(origArr, newArr);
				}
				// this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, lineIndexBuffer);
				// s.gl.bufferData(this.gl.COPY_WRITE_BUFFER, (r[0][1] - r[0][0]) * 2, this.gl.STATIC_DRAW);
				// this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.COPY_WRITE_BUFFER, r[0][0] * 4, 0, buffer.nrIndices * 4);
				
				return r;
			}
		};
		return bufferSet;
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
		bufferSet.positionsIndex = 0;
		bufferSet.normalsIndex = 0;
		bufferSet.pickColorsIndex = 0;
		bufferSet.indicesIndex = 0;
		bufferSet.nrIndices = 0;
		bufferSet.bytes = 0;
	}
	
	getAllBuffers() {
		return this.bufferSets.values();
	}
}