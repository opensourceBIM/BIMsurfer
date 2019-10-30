import {AbstractBufferSet} from "./abstractbufferset.js";
import {AvlTree} from "./collections/avltree.js";

/**
 * @ignore
 */
export class BufferSet extends AbstractBufferSet {
    
    constructor(viewer, settings, hasTransparency, color, sizes) {
		super(viewer);

        this.settings = settings;
        this.positions = settings.quantizeVertices ? new Int16Array(sizes.vertices) : new Float32Array(sizes.vertices);
        this.positionsIndex = 0;
        this.normals = settings.quantizeNormals ? new Int8Array(sizes.normals) : new Float32Array(sizes.normals);
        this.normalsIndex = 0;
        this.pickColors = new Uint8Array(sizes.pickColors * 4);
        this.pickColorsIndex = 0;
        this.indices = new Uint32Array(sizes.indices), // The optimal buffer size is most definitely above the Uint16 threshold, so always use Uint32Array
        this.lineIndices = new Uint32Array(sizes.lineIndices), // The optimal buffer size is most definitely above the Uint16 threshold, so always use Uint32Array
        this.indicesIndex = 0;
        this.lineIndicesIndex = 0;
        this.nrIndices = 0;
        this.nrLineIndices = 0;
        this.hasTransparency = hasTransparency;
        this.color = color;
        this.bytes = 0;
        
        this.uniqueIdToIndex = new AvlTree(viewer.inverseUniqueIdCompareFunction);
    };
}