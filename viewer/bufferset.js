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
    
    computeVisibleRanges(ids) {
        var tmp;
        if ((tmp = this.visibleRanges.get(ids))) {
            return tmp;
        }

        const gl = this.gl;

        if (ids === null || ids.size === 0) {
            return [[0, this.nrIndices]];
        }

        function* _() {
            var oids;
            for (var i of ids) {
                if ((oids = this.geometryIdToIndex.get(i))) {
                    for (var j = 0; j < oids.length; ++j) {
                        yield [oids[j].start, oids[j].start + oids[j].length];
                    }
                }
            }
        };

        var r = Array.from(_()).sort();
        this.visibleRanges.set(ids, r);

        // 

        // console.log("visible", r);

        if (r.length) {
        
        var a = r[0][0], b = r[0][1];
        
        var old2 = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
        var tmp = new Float32Array(this.nrPositions); // not divided by 3?
        // console.log("nrPositions create", this.nrPositions);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, tmp);
        gl.bindBuffer(gl.ARRAY_BUFFER, old2);

        var old = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
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
        this.lineIndexBuffers.set(ids[0], {'buffer': lineIndexBuffer, 'count': newArr.length});
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, old);

        // console.log(origArr, newArr);
        }
        // this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, lineIndexBuffer);
        // s.gl.bufferData(this.gl.COPY_WRITE_BUFFER, (r[0][1] - r[0][0]) * 2, this.gl.STATIC_DRAW);
        // this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.COPY_WRITE_BUFFER, r[0][0] * 4, 0, buffer.nrIndices * 4);
        
        return r;
    }

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