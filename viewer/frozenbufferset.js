import AbstractBufferSet from "./abstractbufferset.js";

export default class FrozenBufferSet extends AbstractBufferSet {
    constructor(
        originalBuffer,
        positionBuffer, normalBuffer, colorBuffer, pickColorBuffer, indexBuffer,				
        color, colorHash,
        nrIndices, nrNormals, nrPositions, nrColors,
        vao, vaoPick,
        hasTransparency, reuse, owner, manager)
    {
        super();

        this.geometryIdToIndex = originalBuffer.geometryIdToIndex;
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
    }
}