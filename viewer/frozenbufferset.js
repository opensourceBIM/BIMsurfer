import {AbstractBufferSet} from "./abstractbufferset.js";
import {Utils} from "./utils.js";

/**
 * @ignore
 */
export class FrozenBufferSet extends AbstractBufferSet {
    constructor(
    	viewer,
        originalBuffer,
        positionBuffer, normalBuffer, colorBuffer, pickColorBuffer, indexBuffer, lineIndexBuffer,				
        color, colorHash,
        nrIndices, nrLineIndices, nrNormals, nrPositions, nrColors,
        vao, vaoPick, lineRenderVao,
        hasTransparency, reuse, owner, manager, 

        // only in case of reuse
        roid, croid)
    {
        super(viewer);

        if (lineIndexBuffer == null) {
        	debugger;
        }
        
        if (originalBuffer) {
        	this.uniqueIdToIndex = originalBuffer.uniqueIdToIndex;
        }
        // @todo make these something like LRU caches?
        this.visibleRanges = new Map();
        this.lineIndexBuffers = new Map();

        this.positionBuffer = positionBuffer;
        this.normalBuffer = normalBuffer;
        this.colorBuffer = colorBuffer;
        this.pickColorBuffer = pickColorBuffer;
        this.indexBuffer = indexBuffer;
        this.lineIndexBuffer = lineIndexBuffer;

        this.color = color;
        this.colorHash = colorHash;

        this.nrIndices = nrIndices;
        this.nrLineIndices = nrLineIndices;
        this.nrNormals = nrNormals;
        this.nrPositions = nrPositions;
        this.nrColors = nrColors;

        this.vao = vao;
        this.vaoPick = vaoPick;
        this.lineRenderVao = lineRenderVao;

        this.hasTransparency = hasTransparency;
        this.reuse = reuse;
        this.owner = owner;
        this.manager = manager;
        
        this.roid = roid;
        this.croid = croid;
        this.indexType = indexBuffer.attrib_type;

        this.instanceMatricesBuffer = null;
        this.instanceNormalMatricesBuffer = null;
        this.instancePickColorsBuffer = null;
    }
    
    update(nrIndices, nrPositions, nrNormals, nrColors) {
        this.nrIndices = nrIndices;
        this.nrNormals = nrNormals;
        this.nrPositions = nrPositions;
        this.nrColors = nrColors;
        this.dirty = true;
    }

    finalize() {
    	
    }
    
    // Sets reuse instances
    setObjects(gl, objects) {
        this.objects = objects;
        this.reuse = true;
        
        const N = this.nrProcessedMatrices = objects.length;

        var instanceMatrices = new Float32Array(N * 16);
        var instanceNormalMatrices = new Float32Array(N * 9);
        var instancePickColors = new Uint8Array(N * 4);

        for (var index=0; index<objects.length; index++) {
        	let object = objects[index];
        	instanceMatrices.set(object.matrix, index * 16);
        	instanceNormalMatrices.set(object.normalMatrix, index * 9);
        	instancePickColors.set(this.viewer.getPickColor(object.uniqueId), index * 4);
        }
        
        if (this.instanceMatricesBuffer === null) {
            this.instanceMatricesBuffer = Utils.createBuffer(gl, instanceMatrices, null, null, 16);
            this.instanceNormalMatricesBuffer = Utils.createBuffer(gl, instanceNormalMatrices, null, null, 9);
            this.instancePickColorsBuffer = Utils.createBuffer(gl, instancePickColors, null, null, 4);
        } else {
            let arrays = [instanceMatrices, instanceNormalMatrices, instancePickColors];
            let buffers = [this.instanceMatricesBuffer, this.instanceNormalMatricesBuffer, this.instancePickColorsBuffer];
            var restoreArrayBinding = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            arrays.forEach(function(a, idx) {
                let b = buffers[idx];
                gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW, 0);             
            });
            gl.bindBuffer(gl.ARRAY_BUFFER, restoreArrayBinding);
        }
    }

    copyEmpty() {
        let b = new FrozenBufferSet(
        	this.viewer,
            null,
            // multiply
            this.positionBuffer,
            this.normalBuffer,
            this.colorBuffer,
            this.pickColorBuffer,
			this.indexBuffer,
			this.lineIndexBuffer,

            null,
            null,

			this.indexBuffer.N,
			this.lineIndexBuffer ? this.lineIndexBuffer.N : 0,
            this.normalBuffer.N,
            this.positionBuffer.N,
            this.colorBuffer.N,

            // vaos
            null,
            null,
            null,

            this.hasTransparency,
            this.reuse,
            this.owner,
            this.manager,

            this.roid,
            this.croid
        );
        return b;
    }

    buildVao(gl, settings, programInfo, pickProgramInfo, lineProgramInfo) {

    	let bindLocationPairs = (locations) => {
            for (let [location, buffer] of locations) {
                gl.bindBuffer(buffer.gl_type, buffer);
                let fn = buffer.attrib_type == gl.FLOAT
                    ? gl.vertexAttribPointer
                    : gl.vertexAttribIPointer;
                fn.bind(gl)(location, buffer.components, buffer.attrib_type, buffer.normalize, buffer.stride, buffer.offset);
                gl.enableVertexAttribArray(location);
            }
        };

        // Regular drawing VAO
        var vao = this.vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        let locations = [
            [programInfo.attribLocations.vertexPosition, this.positionBuffer],
            [programInfo.attribLocations.vertexNormal, this.normalBuffer]
        ];
        if (!settings.useObjectColors) {
            locations.push([programInfo.attribLocations.vertexColor, this.colorBuffer]);
        }
        bindLocationPairs(locations);

        if (this.instanceMatricesBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceMatricesBuffer);
            for (let i = 0; i < 4; ++i) {
                gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices + i);
                gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + i, 4, gl.FLOAT, false, 64, 16 * i);
                gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + i, 1);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceNormalMatricesBuffer);
            for (let i = 0; i < 3; ++i) {
                gl.enableVertexAttribArray(programInfo.attribLocations.instanceNormalMatrices + i);
                gl.vertexAttribPointer(programInfo.attribLocations.instanceNormalMatrices + i, 3, gl.FLOAT, false, 36, 12 * i);
                gl.vertexAttribDivisor(programInfo.attribLocations.instanceNormalMatrices + i, 1);
            }

        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bindVertexArray(null);

        // Line render drawing VAO
        var lineRenderVao = this.lineRenderVao = gl.createVertexArray();
        gl.bindVertexArray(lineRenderVao);
        
        locations = [
            [lineProgramInfo.attribLocations.vertexPosition, this.positionBuffer]
        ];
        bindLocationPairs(locations);

        if (this.instanceMatricesBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceMatricesBuffer);
            for (let i = 0; i < 4; ++i) {
                gl.enableVertexAttribArray(lineProgramInfo.attribLocations.instanceMatrices + i);
                gl.vertexAttribPointer(lineProgramInfo.attribLocations.instanceMatrices + i, 4, gl.FLOAT, false, 64, 16 * i);
                gl.vertexAttribDivisor(lineProgramInfo.attribLocations.instanceMatrices + i, 1);
            }

            if (lineProgramInfo.attribLocations.instanceNormalMatrices) {
            	// Line renders do not use normals
            	gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceNormalMatricesBuffer);
            	for (let i = 0; i < 3; ++i) {
            		gl.enableVertexAttribArray(lineProgramInfo.attribLocations.instanceNormalMatrices + i);
            		gl.vertexAttribPointer(lineProgramInfo.attribLocations.instanceNormalMatrices + i, 3, gl.FLOAT, false, 36, 12 * i);
            		gl.vertexAttribDivisor(lineProgramInfo.attribLocations.instanceNormalMatrices + i, 1);
            	}
            }
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIndexBuffer);
        gl.bindVertexArray(null);
        
        // Picking VAO
        var vaoPick = this.vaoPick = gl.createVertexArray();
        gl.bindVertexArray(vaoPick);

        locations = [[pickProgramInfo.attribLocations.vertexPosition, this.positionBuffer]];
        if (this.pickColorBuffer) {
            locations.push([pickProgramInfo.attribLocations.vertexPickColor, this.pickColorBuffer]);
        }
        bindLocationPairs(locations);

        if (this.instanceMatricesBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceMatricesBuffer);
            for (let i = 0; i < 4; ++i) {
                gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices + i);
                gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + i, 4, gl.FLOAT, false, 64, 16 * i);
                gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + i, 1);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, this.instancePickColorsBuffer);
            gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instancePickColors);
            gl.vertexAttribIPointer(pickProgramInfo.attribLocations.instancePickColors, 4, gl.UNSIGNED_BYTE, false, 0, 0);
            gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instancePickColors, 1);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bindVertexArray(null);
    }
}