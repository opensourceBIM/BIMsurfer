import {FatLineRenderer} from "./fatlinerenderer.js";
import {AvlTree} from "./collections/avltree.js";

var counter = 1;

/**
 * @ignore
 */
export class AbstractBufferSet {
    
    constructor(viewer) {
    	this.viewer = viewer;
        // Unique id per bufferset, easier to use as Map key
        this.id = counter++;
        
        this.dirty = true;
    }

    /**
     *  Creates new buffers, but is more efficient than joinConsecutiveRanges, funky buffer layers looks this way because we can directly send it to the GPU with multiDrawElementsWEBGL
     */
    joinConsecutiveRangesAsBuffers(input) {
    	var result = {
    		offsets: new Int32Array(input.pos),
    		counts: new Int32Array(input.pos),
    		pos: 0
    	};
		for (var i=0; i<input.pos; i++) {
			var offset = input.offsets[i];
			var totalCount = input.counts[i];
			while (i < input.pos && input.offsets[i] + input.counts[i] == input.offsets[i + 1]) {
				i++;
				totalCount += input.counts[i];
			}
			result.offsets[result.pos] = offset;
			result.counts[result.pos] = totalCount;
			result.pos++;
		}
//		console.log("Joined", input.pos, result.pos);
    	return result;
    }
    
    /**
     * More efficient version of complementRanges, but also creates new buffers.
     */
    complementRangesAsBuffers(input) {
    	if (input.pos == 0) {
    		// Special case, inverting all
    		return {
    			counts: new Int32Array([this.nrIndices]),
    			offsets: new Int32Array([0]),
    			pos: 1
    		}
    	}
    	var maxNrRanges = this.uniqueIdToIndex.size / 2;
    	var complement = {
    		counts: new Int32Array(maxNrRanges),
    		offsets: new Int32Array(maxNrRanges),
    		pos: 0
    	};
    	var previousIndex = 0;
    	for (var i=0; i<=input.pos; i++) {
    		if (i == input.pos) {
    			if (offset + count != this.nrIndices) {
    				// Complement the last range
        			complement.offsets[complement.pos] = previousIndex;
        			complement.counts[complement.pos] = this.nrIndices - previousIndex;
        			complement.pos++;
    			}
    			continue;
    		}
    		var count = input.counts[i];
    		var offset = input.offsets[i];
    		var newCount = offset - previousIndex;
    		if (newCount > 0) {
    			complement.offsets[complement.pos] = previousIndex;
    			complement.counts[complement.pos] = offset - previousIndex;
    			complement.pos++;
    		}
    		previousIndex = offset + count;
    	}
    	// TODO trim buffers?
//    	console.log(complement.pos, complement.counts.length);
    	return complement;
    }

    /**
     * When changing colors, a lot of data is read from the GPU. It seems as though all of this reading is sync, making it a bottle-neck 
     * When wrapping abstractbufferset calls that read from the GPU buffer in batchGpuRead, the complete bufferset is read into memory once, and is removed afterwards  
     */
    batchGpuRead(gl, toCopy, bounds, fn) {
    	if (this.objects) {
    		// Reuse, no need to batch
            fn();
            return;
    	}

    	if (bounds == null) {
    		throw "Not supported anymore";
    		bounds = {
    			startIndex: 0,
    			endIndex: this.nrIndices,
    			minIndex: 0,
    			maxIndex: this.nrPositions
    		};
    	}
    	
    	this.batchGpuBuffers = {
   			indices: new Uint32Array(bounds.endIndex - bounds.startIndex),
   			bounds: bounds
       	};

        let restoreElementBinding = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        let restoreArrayBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, bounds.startIndex * 4, this.batchGpuBuffers.indices, 0, bounds.endIndex - bounds.startIndex);

        for (var name of toCopy) {
            let buffer = this[name];
            let bytes_per_elem = window[buffer.js_type].BYTES_PER_ELEMENT;
            let gpu_data = new window[buffer.js_type]((bounds.maxIndex - bounds.minIndex) * buffer.components);

            this.batchGpuBuffers[name] = gpu_data;
            
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.getBufferSubData(gl.ARRAY_BUFFER, bounds.minIndex * buffer.components * bytes_per_elem, gpu_data, 0, gpu_data.length);
        }

        fn();

        // Restoring after fn() because potentially fn is creating linebuffers
        gl.bindBuffer(gl.ARRAY_BUFFER, restoreArrayBinding);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreElementBinding);

        this.batchGpuBuffers = null;
    }

    /*
     * Create a line renderer from instance data, this does not use the GPU batching
     */
    createLineRendererFromInstance(gl, a, b) {
        const lineRenderer = new FatLineRenderer(this.viewer, gl, {
            quantize: this.positionBuffer.js_type !== Float32Array.name
        }, this.unquantizationMatrix);

        lineRenderer.init(b - a);
        
        const positions = new window[this.positionBuffer.js_type](this.positionBuffer.N);
        const indices = new window[this.indexBuffer.js_type](b-a);
        
        // @todo: get only part of positions [min(indices), max(indices)]
        var restoreArrayBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, positions);
        
        var restoreElementBinding = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, a * 4, indices, 0, indices.length);
        
        const s = new Set();
        
        for (let i = 0; i < indices.length; i += 3) {
            let abc = indices.subarray(i, i + 3);

            for (let j = 0; j < 3; ++j) {
                let ab = [abc[j], abc[(j+1)%3]];
                ab.sort();
                let abs = ab.join(":");

                if (s.has(abs)) {
                    s.delete(abs);
                } else {
                    s.add(abs);
                }
            }
        }
        
        for (let e of s) {
            let [a,b] = e.split(":");
            let A = positions.subarray(a * 3).subarray(0,3);
            let B = positions.subarray(b * 3).subarray(0,3);
            lineRenderer.pushVertices(A, B);
        }			

        lineRenderer.finalize();            

        gl.bindBuffer(gl.ARRAY_BUFFER, restoreArrayBinding);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreElementBinding);

        return lineRenderer;
    }
    
    createLineRenderer(gl, uniqueId, a, b) {
        const lineRenderer = new FatLineRenderer(this.viewer, gl, {
            quantize: this.positionBuffer.js_type !== Float32Array.name
        }, this.unquantizationMatrix);

		if (this.lineIndexBuffer != null) {
			debugger;

			// TODO this is where we are
			// Problem here is that the buffer is now already created on the GPU, but we need to convert it to a fatlinerenderer...
			// So we could either generate the line render buffers as fat lines already (taking more network), but real quick to send to GPU, or
			// Not store the data on the GPU when loading, but as a CPU buffer, and then just iterating over the CPU data when creating a LineRenderer using the normal code
			// This last option sucks if we want to always do line rendering of all objects
			// 2 triangles of data per line is a lot...

			lineRenderer.init(this.lineIndexBuffer.N);
			const bounds = this.batchGpuBuffers.bounds;
			const vertexOffset = -bounds.minIndex * 3;
			for (let e of s) {
				const a = Math.floor(e / 67108864);
				const b = e - a * 67108864;
				const as = vertexOffset + a * 3;
				const bs = vertexOffset + b * 3;
				let A = gpu_data.subarray(as, as + 3);
				let B = gpu_data.subarray(bs, bs + 3);
				lineRenderer.pushVertices(A, B);
			}
			lineRenderer.finalize();

			return lineRenderer;
		} else {
			let index = this.uniqueIdToIndex.get(uniqueId);
			let idx = index[0];
			let [offset, length] = [idx.start, idx.length];
			let [minIndex, maxIndex] = [idx.minIndex, idx.maxIndex];

			let numVertices = maxIndex - minIndex + 1;
			let gpu_data = this.batchGpuBuffers["positionBuffer"];

			const bounds = this.batchGpuBuffers.bounds;
			
			var size = 0;
			
			// A more efficient (and certainly more compact) version that used bitshifting was working fine up until 16bits, unfortunately JS only does bitshifting < 32 bits, so now we have this crappy solution
			
			var indexOffset = offset - bounds.startIndex;
			
			const s = new Set();
			
			const indices = this.batchGpuBuffers.indices;
			for (var i=0; i<length; i+=3) {
				for (let j = 0; j < 3; ++j) {
					let a = indices[indexOffset + i + j];
					let b = indices[indexOffset + i + (j+1)%3];
					
					if (a > b) {
						const tmp = a;
						a = b;
						b = tmp;
					}

					// First tried to do this with bit shifting, but bit shifting in JS is 32bit
					const abs = a * 67108864 + b; // 2^26=67108864. A maximum of 52 bits is used, staying just under 2^53, which is the max safe int
					if (s.has(abs)) {
						s.delete(abs);
					} else {
						s.add(abs);
					}
				}
			}
			
			lineRenderer.init(s.size);
			const vertexOffset = -bounds.minIndex * 3;
			for (let e of s) {
				const a = Math.floor(e / 67108864);
				const b = e - a * 67108864;
				const as = vertexOffset + a * 3;
				const bs = vertexOffset + b * 3;
				let A = gpu_data.subarray(as, as + 3);
				let B = gpu_data.subarray(bs, bs + 3);
				lineRenderer.pushVertices(A, B);
			}
			
			lineRenderer.finalize();

			return lineRenderer;
		}
    }

    getBounds(id_ranges) {
    	var bounds = {};
    	for (const idRange of id_ranges) {
    		const oid = idRange[0];
    		const range = idRange[1];
    		let idx = this.uniqueIdToIndex.get(oid)[0];
    		if (bounds.startIndex == null || range[0] < bounds.startIndex) {
    			bounds.startIndex = range[0];
    		}
    		if (bounds.endIndex == null || range[1] > bounds.endIndex) {
    			bounds.endIndex = range[1];
    		}
    		if (bounds.minIndex == null || idx.minIndex < bounds.minIndex) {
    			bounds.minIndex = idx.minIndex;
    		}
    		if (bounds.maxIndex == null || idx.maxIndex + 1 > bounds.maxIndex) {
    			// This one seems to be wrong
    			bounds.maxIndex = idx.maxIndex + 1;
    		}
    	}
    	return bounds;
    }

    computeVisibleInstances(ids_with_or_without, gl) {
    	const ids = ids_with_or_without.with ? ids_with_or_without.with : ids_with_or_without.without;
        const exclude = "without" in ids_with_or_without;
        
		const ids_str = exclude + ':' + ids.frozen;

        {
            var cache_lookup;
            if ((cache_lookup = this.visibleRanges.get(ids_str))) {
                return cache_lookup;
            }
        }

        let ranges = {instanceIds: [], hidden: exclude, somethingVisible: null};
        this.objects.forEach((ob, i) => {
            if (ids !== null && ids.has(ob.id)) {
                // @todo, for large lists of objects, this is not efficient
                ranges.instanceIds.push(i);
            }
        });

        if (ranges.instanceIds.length == this.objects.length) {
            ranges.instanceIds = [];
            ranges.hidden = !ranges.hidden;
        }

        ranges.somethingVisible = ranges.hidden
            ? ranges.instanceIds.length < this.objects.length
            : ranges.instanceIds.length > 0;

        this.visibleRanges.set(ids_str, ranges);

        if (!exclude && ranges.instanceIds.length && this.lineIndexBuffers.size === 0) {
            let lineRenderer = this.createLineRendererFromInstance(gl, 0, this.indexBuffer.N);
            // This will result in a different dequantization matrix later on, not sure why
            lineRenderer.croid = this.croid;
            this.objects.forEach((ob) => {
                lineRenderer.matrixMap.set(ob.id, ob.matrix);
                this.lineIndexBuffers.set(ob.id, lineRenderer);
            });
        }

        return ranges;
    }
    
    // generator function that yields ranges in this buffer for the selected ids
    * _(uniqueIdToIndex, ids) {
        var oids;
        for (var i of ids) {
    		if ((oids = uniqueIdToIndex.get(i))) {
    			for (var j = 0; j < oids.length; ++j) {
    				yield [i, [oids[j].start, oids[j].start + oids[j].length]];
    			}
    		}
        }
    }

    getIdRanges(oids) {
    	var iterator1 = this.uniqueIdToIndex.keys();
    	var iterator2 = oids[Symbol.iterator]();
    	const id_ranges = this.uniqueIdToIndex
    	? Array.from(this.findUnion(iterator1, iterator2)).sort((a, b) => (a[1][0] > b[1][0]) - (a[1][0] < b[1][0]))
    			// If we don't have this mapping, we're dealing with a dedicated
    			// non-instanced bufferset for one particular overriden object
    			: [[this.uniqueId & 0x8FFFFFFF, [0, this.nrIndices]]];
    	return id_ranges;
    }
    
    /**
     * Generator function that yields ranges in this buffer for the selected ids
     * This one tries to do better than _ by utilizing the fact (requirement) that both uniqueIdToIndex and ids are numerically ordered beforehand
     * Basically it only iterates through both iterators only once. Could be even faster with a real TreeMap, but we don't have it available
     */
    * findUnion(iterator1, iterator2) {
    	var next1 = iterator1.next();
    	var next2 = iterator2.next();
    	while (!next1.done && !next2.done) {
    		const diff = this.viewer.uniqueIdCompareFunction(next1.value, next2.value);
    		if (diff == 0) {
    			const uniqueId1 = next1.value;
    			var indices = this.uniqueIdToIndex.get(uniqueId1);
    			for (var j = 0; j < indices.length; ++j) {
    				const mapping = indices[j];
    				yield [uniqueId1, [mapping.start, mapping.start + mapping.length]];
    			}
    			next1 = iterator1.next();
    			next2 = iterator2.next();
    		} else {
    			if (diff < 0) {
    				next1 = iterator1.next();
    			} else {
    				next2 = iterator2.next();
    			}
    		}
    	}
    }
	
    computeVisibleRangesAsBuffers(ids_with_or_without, gl) {
    	if (this.dirty) {
    		// TODO maybe we can reuse something here?
//    		console.log("Clearing visible ranges cache", this.visibleRanges.size);
    		this.visibleRanges.clear();
    		this.dirty = false;
    	}
    	var ids = ids_with_or_without.with ? ids_with_or_without.with : ids_with_or_without.without;
    	var exclude = "without" in ids_with_or_without;
    	
    	const ids_str = exclude + ':' +  ids.frozen;
    	
    	{
    		var cache_lookup;
    		if ((cache_lookup = this.visibleRanges.get(ids_str))) {
    			return cache_lookup;
    		}
    	}
    	
    	if (ids === null || ids.size === 0) {
    		let result =  {
    			counts: new Int32Array([this.nrIndices]),
    			offsets: new Int32Array([0]),
    			pos: 1
    		};
    		this.visibleRanges.set(ids_str, result);
    		return result;
    	}
    	
//    	console.log(this.uniqueIdToIndex);
//    	console.log(ids);
//    	
//    	for (var a of this.uniqueIdToIndex.keys()) {
//    		console.log(a);
//    	}
    	
    	var iterator1 = this.uniqueIdToIndex.keys();
    	var iterator2 = ids._set[Symbol.iterator]();
    	
    	var id_ranges = null;
    	if (this.uniqueIdToIndex) {
    		id_ranges = Array.from(this.findUnion(iterator1, iterator2)).sort((a, b) => (a[1][0] > b[1][0]) - (a[1][0] < b[1][0]));
    	} else {
			// If we don't have this mapping, we're dealing with a dedicated
			// non-instanced bufferset for one particular overriden object
			id_ranges = [[this.uniqueId & 0x8FFFFFFF, [0, this.nrIndices]]];
    	}
    	
    	var result = {
    		counts: new Int32Array(id_ranges.length),
    		offsets: new Int32Array(id_ranges.length),
    		pos: id_ranges.length
    	};
    	
    	var c = 0;
    	for (const range of id_ranges) {
    		const realRange = range[1];
    		result.offsets[c] = realRange[0];
    		result.counts[c] = realRange[1] - realRange[0];
    		c++;
    	}
    	
    	result = this.joinConsecutiveRangesAsBuffers(result);
    	
    	if (exclude) {
    		let complement = this.complementRangesAsBuffers(result);
    		// store in cache
    		this.visibleRanges.set(ids_str, complement);
    		return complement;
    	}
    	
    	// store in cache
    	this.visibleRanges.set(ids_str, result);

    	// Create fat line renderings for these elements. This should (a) 
    	// not in the draw loop (b) maybe in something like a web worker
    	
    	let bounds = this.getBounds(id_ranges);
    	
    	this.batchGpuRead(gl, ["positionBuffer"], bounds, () => {
    		id_ranges.forEach((range, i) => {
    			let [id, [a, b]] = range;
    			if (this.lineIndexBuffers.has(id)) {
    				return;
    			}
    			let lineRenderer = this.createLineRenderer(gl, id, a, b);
    			this.lineIndexBuffers.set(id, lineRenderer);
    		});
    	});
    	
    	return result;
    }
    
	reset() {
		this.positionsIndex = 0;
		this.normalsIndex = 0;
		this.pickColorsIndex = 0;
		this.indicesIndex = 0;
		this.nrIndices = 0;
		this.bytes = 0;
		this.visibleRanges = new Map();
		this.uniqueIdToIndex = new AvlTree(viewer.inverseUniqueIdCompareFunction);
		this.lineIndexBuffers = new Map();
	}

	copy(gl, uniqueId) {
        let returnDictionary = {};

        if (this.objects) {
            return this.copyEmpty();
        } else {
    		let idx = this.uniqueIdToIndex.get(uniqueId)[0];
    		let [offset, length] = [idx.start, idx.length];
    		
			const indices = new Uint32Array(length);
			
			let [minIndex, maxIndex] = [idx.minIndex, idx.maxIndex];

			let bounds = this.batchGpuBuffers.bounds;

			for (let i=0; i<length; i++) {
    			indices[i] = this.batchGpuBuffers.indices[-bounds.startIndex + offset + i] - minIndex;
    		}
    		
    		let numVertices = maxIndex - minIndex + 1;
    		
    		let toCopy = ["positionBuffer", "normalBuffer", "colorBuffer", "pickColorBuffer"];
    		
    		for (var name of toCopy) {
    			let buffer = this[name];
    			let gpu_data = this.batchGpuBuffers[name];
    			let new_gpu_data = new window[buffer.js_type](numVertices * buffer.components);

				// @todo this can probably be a combination of subarray() and set()
    			var vertexOffset = (-bounds.minIndex + minIndex) * buffer.components;
    			for (let j=0; j<numVertices * buffer.components; j++) {
    				new_gpu_data[j] = gpu_data[vertexOffset + j];
        		}
    			
    			let shortName = name.replace("Buffer", "") + "s";
    			returnDictionary[shortName] = new_gpu_data;
    			returnDictionary["nr" + shortName.substr(0,1).toUpperCase() + shortName.substr(1)] = new_gpu_data.length;
    		}
    		
    		returnDictionary.isCopy = true;
    		returnDictionary["indices"] = indices;
    		returnDictionary["nrIndices"] = indices.length;
        }

		return returnDictionary;
	}

	setColor(gl, uniqueId, clr) {
        // Reusing buffer sets always results in a copy
        if (this.objects) {
            return false;
        }

        // Switching transparency states results in a copy
		if (clr.length == 4 && this.hasTransparency != (clr[3] < 1.)) {
			return false;
		}

		var oldColors, newColors, clrArray;

		if (clr.length == 4) {
			let factor = this.colorBuffer.js_type == Uint8Array.name ? 255. : 1.;
			clrArray = new window[this.colorBuffer.js_type](4);
			for (let i = 0; i < 4; ++i) {
				clrArray[i] = clr[i] * factor;
			}
		} else {
			newColors = clr;
		}

		const idxs = this.uniqueIdToIndex.get(uniqueId);
		if (idxs == null) {
			return;
		}
		for (var idx of idxs) {
			let [offset, length] = [idx.color, idx.colorLength];
			let bytes_per_elem = window[this.colorBuffer.js_type].BYTES_PER_ELEMENT;
			
			// Assumes there is just one index pair, this is for now always the case.
			oldColors = new window[this.colorBuffer.js_type](length);

			if (clr.length == 4) {
				newColors = new window[this.colorBuffer.js_type](length);
				for (let i = 0; i < length; i += 4) {
					newColors.set(clrArray, i);
				}
			}

    		var restoreArrayBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    		gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    		let bounds = this.batchGpuBuffers.bounds;
			let gpu_data = this.batchGpuBuffers.colorBuffer;
			// @todo this can probably be a combination of subarray() and set()
			for (let j=0; j<length; j++) {
				oldColors[j] = gpu_data[offset - (bounds.minIndex * 4) + j];
    		}
    		gl.bufferSubData(gl.ARRAY_BUFFER, offset * bytes_per_elem, newColors, 0, length);
    		gl.bindBuffer(gl.ARRAY_BUFFER, restoreArrayBinding);
		}

		return oldColors;
	}
}