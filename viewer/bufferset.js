import FatLineRenderer from './fatlinerenderer.js'

export default class BufferSet {
    
    constructor(settings, hasTransparency, color, sizes) {
        this.settings = settings;
        this.positions = settings.quantizeVertices ? new Int16Array(sizes.vertices) : new Float32Array(sizes.vertices);
        this.positionsIndex = 0;
        this.normals = settings.quantizeNormals ? new Int8Array(sizes.normals) : new Float32Array(sizes.normals);
        this.normalsIndex = 0;
        this.pickColors = new Uint32Array(sizes.pickColors);
        this.pickColorsIndex = 0;
        this.indices = new Uint32Array(sizes.indices), // The optimal buffer size is most definitely above the Uint16 threshold, so always use Uint32Array
        this.indicesIndex = 0;
        this.nrIndices = 0;
        this.hasTransparency = hasTransparency;
        this.color = color;
        this.bytes = 0;
        this.geometryIdToIndex = new Map();
        // @todo make these something like LRU caches?
        this.visibleRanges = new Map();
        this.lineIndexBuffers = new Map();
    };
    
    computeVisibleRanges(ids_with_or_without, gl) {
		var ids = Object.values(ids_with_or_without)[0];
		var exclude = "without" in ids_with_or_without;

		// Wow set equality is really broken. This is going to hurt performance.
		var ids_str = Array.from(ids || []);
		ids_str.sort();
		ids_str = Object.keys(ids_with_or_without)[0] + ':' +  ids_str.join(',');

        {
            var cache_lookup;
            if ((cache_lookup = this.visibleRanges.get(ids_str))) {
                return cache_lookup;
            }
        }

        if (ids === null || ids.size === 0) {
            return [[0, this.nrIndices]];
        }

        // generator function that yields ranges in this buffer for the selected ids
        function* _(geometryIdToIndex) {
            var oids;
            for (var i of ids) {
                if ((oids = geometryIdToIndex.get(i))) {
                    for (var j = 0; j < oids.length; ++j) {
                        yield [i, [oids[j].start, oids[j].start + oids[j].length]];
                    }
                }
            }
        };

		const id_ranges = Array.from(_(this.geometryIdToIndex)).sort();
		const ranges = id_ranges.map((arr) => {return arr[1];});

		// @todo: are there any off-by-1 errors here?

		// join consecutive ranges
		while (true) {
			var removed = false;
			for (let i = 0; i < ranges.length - 1; ++i) {
				let a = ranges[i];
				let b = ranges[i+1];
				if (a[1] == b[0]) {
					ranges.splice(i, 2, [a[0], b[1]]);
					removed = true;
				}
			}
			if (!removed) {
				break;
			}
		}

		if (exclude) {
			// @todo: horribly inefficient, do not try this at home.
			var complement =  [[0, this.nrIndices]];
			ranges.forEach((range)=>{
				let [a, b] = range;
				const break_out_foreach = {};
				try {
					complement.forEach((originalRange, i)=>{
						let [o, p] = originalRange;
						if (a > o && a <= p) {
							complement.splice(i, 1, [o, a], [b, p]);
							throw break_out_foreach;
						}
					});
				} catch (e) {
					if (e !== break_out_foreach) {
						throw e;
					}
				}
			});

			// store in cache
			this.visibleRanges.set(ids_str, complement);

			return complement;
		}		

        // store in cache
        this.visibleRanges.set(ids_str, ranges);

		// Create fat line renderings for these elements. This should (a) be in
		// a separate function (b) not in the draw loop (c) maybe in something
		// like a web worker
        id_ranges.forEach((range, i) => {
            let [id, [a, b]] = range;

			const lineRenderer = new FatLineRenderer(gl);

			// not divided by 3?
			// @todo does not work with quantization yet.
            const positions = new Float32Array(this.nrPositions);
            const indices = new Uint32Array(b-a);
            
            // @todo: get only part of positions [min(indices), max(indices)]
            var restoreArrayBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, positions);
            
            var restoreElementBinding = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
            gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, a * 4, indices, 0, indices.length);

            for (var i = 0; i < indices.length; i += 3) {
                let a = positions.subarray(indices[i    ] * 3).subarray(0,3);
                let b = positions.subarray(indices[i + 1] * 3).subarray(0,3);
                let c = positions.subarray(indices[i + 2] * 3).subarray(0,3);
                lineRenderer.pushVertices(a, b);
                lineRenderer.pushVertices(b, c);
                lineRenderer.pushVertices(c, a);
            }

			lineRenderer.finalize();
            this.lineIndexBuffers.set(id, lineRenderer);

            gl.bindBuffer(gl.ARRAY_BUFFER, restoreArrayBinding);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, restoreElementBinding);
        });
       
        return ranges;
    }

    // @todo: this is not used yet
    flush(gpuBufferManager) {
		if (this.nrIndices == 0) {
			return;
        }
        
        this.gl = gpuBufferManager.gl;
        const viewer = gpuBufferManager.viewer;
		
		var programInfo = viewer.programManager.getProgram({
			picking: false,
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
		});

		var pickProgramInfo = viewer.programManager.getProgram({
			picking: true,
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: false,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: false
		});
		
		if (!this.settings.fakeLoading) {

			// Positions
			const positionBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, this.positions, this.gl.STATIC_DRAW, 0, this.positionsIndex);

			// Normals
			const normalBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, this.normals, this.gl.STATIC_DRAW, 0, this.normalsIndex);

			// Colors
			var colorBuffer;
			if (this.colors) {
				colorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				this.gl.bufferData(this.gl.ARRAY_BUFFER, this.colors, this.gl.STATIC_DRAW, 0, this.colorsIndex);
			}

			// Per-object pick vertex colors
			var pickColorBuffer;
			if (this.pickColors) {
				pickColorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, pickColorBuffer);
				this.gl.bufferData(this.gl.ARRAY_BUFFER, this.pickColors, this.gl.STATIC_DRAW, 0, this.pickColorsIndex);
			}

			// Indices
			const indexBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.indices, this.gl.STATIC_DRAW, 0, this.indicesIndex);

			// Normal drawing VAO
			var vao = this.gl.createVertexArray();
			this.gl.bindVertexArray(vao);

			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
				if (this.settings.quantizeVertices) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
			}
			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
				if (this.settings.quantizeNormals) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.BYTE, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
			}
			
			if (!this.settings.useObjectColors) {
				const numComponents = 4;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				if (this.settings.quantizeColors) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.UNSIGNED_BYTE, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
			}

			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

			this.gl.bindVertexArray(null);

			// Picking VAO

			var vaoPick = this.gl.createVertexArray();
			this.gl.bindVertexArray(vaoPick);

			// Positions
			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
				if (this.settings.quantizeVertices) {
					this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.vertexPosition);
			}

			// Per-object pick vertex colors
			if (this.pickColors) {
				const numComponents = 2;
				const type = this.gl.UNSIGNED_INT;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, pickColorBuffer);
				this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.vertexPickColor, numComponents, type, normalize, stride, offset);
				this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.vertexPickColor);
			}

			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

			this.gl.bindVertexArray(null);

			
            this.positionBuffer = positionBuffer;
            this.normalBuffer = normalBuffer;
            this.indexBuffer = indexBuffer;
            this.nrNormals = this.normalsIndex;
            this.nrPositions = this.positionsIndex;
            this.vao = vao;
            this.vaoPick = vaoPick;
            this.reuse = false;			
			
			if (this.settings.useObjectColors) {
				this.color = [this.color.r, this.color.g, this.color.b, this.color.a];
				this.colorHash = Utils.hash(JSON.stringify(this.color));
			} else {
				this.colorBuffer = colorBuffer;
				this.nrColors = this.colorsIndex;
			}

			if (this.pickColors) {
				this.pickColorBuffer = pickColorBuffer;
			}
			
			gpuBufferManager.pushBuffer(this);
			viewer.dirty = true;
		}
        
        // @todo better separation of concerns here
		gpuBufferManager.viewer.stats.inc("Primitives", "Nr primitives loaded", this.nrIndices / 3);
		if (gpuBufferManager.progressListener != null) {
			gpuBufferManager.progressListener(viewer.stats.get("Primitives", "Nr primitives loaded") + viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		gpuBufferManager.viewer.stats.inc("Data", "GPU bytes", this.bytes);
		gpuBufferManager.viewer.stats.inc("Data", "GPU bytes total", this.bytes);
		gpuBufferManager.viewer.stats.inc("Buffers", "Buffer groups");
	}
}