import AbstractBufferSet from "./abstractbufferset.js";

export default class FrozenBufferSet extends AbstractBufferSet {
    constructor(
        originalBuffer,
        positionBuffer, normalBuffer, colorBuffer, pickColorBuffer, indexBuffer,				
        color, colorHash,
        nrIndices, nrNormals, nrPositions, nrColors,
        vao, vaoPick,
        hasTransparency, reuse, owner, manager,

        // in case of reuse
        objects, instanceMatricesBuffer, instanceNormalMatricesBuffer, instancePickColorsBuffer, roid, croid, indexType)
    {
        super();

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