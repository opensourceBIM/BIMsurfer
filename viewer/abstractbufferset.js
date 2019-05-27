import {FatLineRenderer} from "./fatlinerenderer.js";

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
    	var maxNrRanges = this.geometryIdToIndex.size / 2;
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

    createLineRenderer(gl, objectId, a, b) {
        const lineRenderer = new FatLineRenderer(this.viewer, gl, {
            quantize: this.positionBuffer.js_type !== Float32Array.name
        }, this.unquantizationMatrix);

        const m = new Map();
        
		let idx = this.geometryIdToIndex.get(objectId)[0];
		let [offset, length] = [idx.start, idx.length];
		
		let [minIndex, maxIndex] = [idx.minIndex, idx.maxIndex];

		let numVertices = maxIndex - minIndex + 1;
		let gpu_data = this.batchGpuBuffers["positionBuffer"];

		const bounds = this.batchGpuBuffers.bounds;
		
		var size = 0;
		
		// A more efficient (and certainly more compact) version that used bitshifting was working fine up until 16bits, unfortunately JS only does bitshifting < 32 bits, so now we have this crappy solution
		
		var indexOffset = offset - bounds.startIndex;
		
		const s = new Set();
        
		for (var i=0; i<length; i+=3) {
            let abc = [
            	this.batchGpuBuffers.indices[indexOffset + i], 
            	this.batchGpuBuffers.indices[indexOffset + i + 1], 
            	this.batchGpuBuffers.indices[indexOffset + i + 2]];
	
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
        
        lineRenderer.init(s.size, maxIndex);
        const vertexOffset = -bounds.minIndex * 3;
        for (let e of s) {
            let [a,b] = e.split(":");
            const as = vertexOffset + a * 3;
        	const bs = vertexOffset + b * 3;
            let A = gpu_data.subarray(as, as + 3);
    		let B = gpu_data.subarray(bs, bs + 3);
    		lineRenderer.pushVertices(A, B);
        }
        
        lineRenderer.finalize();

        return lineRenderer;
    }

    getBounds(id_ranges) {
    	var bounds = {};
    	for (const idRange of id_ranges) {
    		const oid = idRange[0];
    		const range = idRange[1];
    		let idx = this.geometryIdToIndex.get(oid)[0];
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
        var ids = Object.values(ids_with_or_without)[0];
        var exclude = "without" in ids_with_or_without;
        
		var ids_str = exclude + ':' +  ids.frozen;

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
        	var id = 0; // TODO !!
            let lineRenderer = this.createLineRenderer(gl, id, 0, this.indexBuffer.N);
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
    * _(geometryIdToIndex, ids) {
        var oids;
        for (var i of ids) {
    		if ((oids = geometryIdToIndex.get(i))) {
    			for (var j = 0; j < oids.length; ++j) {
    				yield [i, [oids[j].start, oids[j].start + oids[j].length]];
    			}
    		}
        }
    }

    getIdRanges(oids) {
    	var iterator1 = this.geometryIdToIndex.keys();
    	var iterator2 = oids[Symbol.iterator]();
    	const id_ranges = this.geometryIdToIndex
    	? Array.from(this.findUnion(iterator1, iterator2)).sort((a, b) => (a[1][0] > b[1][0]) - (a[1][0] < b[1][0]))
    			// If we don't have this mapping, we're dealing with a dedicated
    			// non-instanced bufferset for one particular overriden object
    			: [[this.objectId & 0x8FFFFFFF, [0, this.nrIndices]]];
    	return id_ranges;
    }
    
    /**
     * Generator function that yields ranges in this buffer for the selected ids
     * This one tries to do better than _ by utilizing the fact (requirement) that both geometryIdToIndex and ids are numerically ordered beforehand
     * Basically it only iterates through both iterators only once. Could be even faster with a real TreeMap, but we don't have it available
     */
    * findUnion(iterator1, iterator2) {
    	var next1 = iterator1.next();
    	var next2 = iterator2.next();
    	while (!next1.done && !next2.done) {
    		if (next1.value == next2.value) {
    			const i = next1.value;
    			var oids = this.geometryIdToIndex.get(i);
    			for (var j = 0; j < oids.length; ++j) {
    				yield [i, [oids[j].start, oids[j].start + oids[j].length]];
    			}
    			next1 = iterator1.next();
    			next2 = iterator2.next();
    		} else {
    			if (next1.value < next2.value) {
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
    	var ids = Object.values(ids_with_or_without)[0];
    	var exclude = "without" in ids_with_or_without;
    	
    	const ids_str = exclude + ':' +  ids.frozen;
    	
    	{
    		var cache_lookup;
    		if ((cache_lookup = this.visibleRanges.get(ids_str))) {
    			return cache_lookup;
    		}
    	}
    	
    	if (ids === null || ids.size === 0) {
    		return {
    			counts: new Int32Array([this.nrIndices]),
    			offsets: new Int32Array([0]),
    			pos: 1
    		};
    	}

    	var iterator1 = this.geometryIdToIndex.keys();
    	var iterator2 = ids._set[Symbol.iterator]();

    	const id_ranges = this.geometryIdToIndex
    	? Array.from(this.findUnion(iterator1, iterator2)).sort((a, b) => (a[1][0] > b[1][0]) - (a[1][0] < b[1][0]))
    			// If we don't have this mapping, we're dealing with a dedicated
    			// non-instanced bufferset for one particular overriden object
    			: [[this.objectId & 0x8FFFFFFF, [0, this.nrIndices]]];
    	
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
		this.geometryIdToIndex = new Map();
		this.lineIndexBuffers = new Map();
	}

	copy(gl, objectId) {
        let returnDictionary = {};

        if (this.objects) {
            return this.copyEmpty();
        } else {
    		let idx = this.geometryIdToIndex.get(objectId)[0];
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

	setColor(gl, objectId, clr) {
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

		for (var idx of this.geometryIdToIndex.get(objectId)) {
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