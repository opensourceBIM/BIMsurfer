import AbstractBufferSet from "./abstractbufferset.js";

export default class FrozenBufferSet extends AbstractBufferSet {
    constructor(
    	viewer,
        originalBuffer,
        positionBuffer, normalBuffer, colorBuffer, pickColorBuffer, indexBuffer,				
        color, colorHash,
        nrIndices, nrNormals, nrPositions, nrColors,
        vao, vaoPick,
        hasTransparency, reuse, owner, manager,

        // in case of reuse
        objects, instanceMatricesBuffer, instanceNormalMatricesBuffer, instancePickColorsBuffer, roid, croid, indexType)
    {
        super(viewer);

        this.geometryIdToIndex = originalBuffer ? originalBuffer.geometryIdToIndex : null;
        // @todo make these something like LRU caches?
        this.visibleRanges = new Map();
        this.lineIndexBuffers = new Map();

        this.positionBuffer = positionBuffer;
        this.normalBuffer = normalBuffer;
        this.colorBuffer = colorBuffer;
        this.pickColorBuffer = pickColorBuffer;
        this.indexBuffer = indexBuffer;

        this.color = color;
        this.colorHash = colorHash;

        this.nrIndices = nrIndices;
        this.nrNormals = nrNormals;
        this.nrPositions = nrPositions;
        this.nrColors = nrColors;

        this.vao = vao;
        this.vaoPick = vaoPick;

        this.hasTransparency = hasTransparency;
        this.reuse = reuse;
        this.owner = owner;
        this.manager = manager;

        if (reuse) {
        	this.objects = objects;
        	this.instanceMatricesBuffer = instanceMatricesBuffer;
        	this.instanceNormalMatricesBuffer = instanceNormalMatricesBuffer;
        	this.instancePickColorsBuffer = instancePickColorsBuffer;
        	this.roid = roid;
        	this.croid = croid;
        	this.indexType = indexType;
        	this.nrProcessedMatrices = objects ? objects.length : null;
        }
    }

    shallowCopy() {
        let b = new FrozenBufferSet(
        	this.viewer,
            null,
            // multiply
            this.positionBuffer,
            this.normalBuffer,
            this.colorBuffer,
            this.pickColorBuffer,
            this.indexBuffer,

            null,
            null,

            this.indexBuffer.N,
            this.normalBuffer.N,
            this.positionBuffer.N,
            this.colorBuffer.N,

            // vaos
            null,
            null,

            this.hasTransparency,
            this.reuse,
            this.owner,
            this.manager,

            this.objects,
            this.instanceMatricesBuffer,
            this.instanceNormalMatricesBuffer,
            this.instancePickColorsBuffer,
            this.roid,
            this.croid,
            this.indexType
        );
        return b;
    }

    buildVao(gl, settings, programInfo, pickProgramInfo) {

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