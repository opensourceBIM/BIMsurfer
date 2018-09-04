import GpuBufferManager from "./gpubuffermanager.js"

// @todo this is the same class as OctreeNode minus the functions
class TileArrayNode {
    constructor(id, x, y, z, width, height, depth) {
        this.parent = null;
        this.id = id;		
        this.leaf = true;
        		
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.nrObjects = 0;
		
		this.width = width;
		this.height = height;
		this.depth = depth;
		
        this.level = 0;
        
        this.center = vec4.fromValues(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, 1);
		this.radius = (Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2) + Math.pow(this.depth, 2))) / 2;
		
		this.matrix = mat4.create();
		mat4.translate(this.matrix, this.matrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
		mat4.scale(this.matrix, this.matrix, [this.width, this.height, this.depth]);
		
		this.bounds = [this.x, this.y, this.z, this.width, this.height, this.depth];
        this.largestFaceArea = width * height;
        
        this.loadingStatus = 0;
    }

    getCenter() {
		return this.center;
	}
	
	getBoundingSphereRadius() {
		return this.radius;
    }
    
    getMatrix() {
        return this.matrix;
    }
}

export default class TileArray {
    constructor(viewer, baseUrl, index) {
        this.viewer = viewer;
        this.baseUrl = baseUrl;
        this.index = index;
        this.tiles = this.index.map((tile, i) => {
            let mi = new Float32Array(tile.bounds.slice(0,3));
            let ma = new Float32Array(tile.bounds.slice(3,6));
            let size = vec3.subtract(vec3.create(), ma, mi);
            let node = new TileArrayNode(tile.id, mi[0], mi[1], mi[2], size[0], size[1], size[2]);
            node.url = tile.url;
            node.number = i + 1;
            return node;
        })
    }

    traverse(fn) {
        this.tiles.forEach(function(tile) {
            fn(tile, tile.level);
        });
    }

    loadTile(node, executor) {
		if (!this.layer.enabled) {
			return;
		}
		if (node.loadingStatus != 0) {
			return;
        }

        // @todo this needs some cleaning up
        this.viewer.layers[1].registerLoader(node.number);
        this.viewer.layers[1].loaderToNode[node.number] = node;
        node.stats = this.viewer.stats;
        
		node.loadingStatus = 1;
        node.gpuBufferManager = new GpuBufferManager(this.viewer);
        
        this.viewer.stats.inc("Tiling", "Loading");
        this.viewer.dirty = true;
        node.loadingStatus = 2;
		
		const model = new xeogl.GLTFModel({
            id: node.id,
            src: `${this.baseUrl}/${node.url}`,
            lambertMaterials: true,
            quantizeGeometry: false,
            viewer: this.viewer,
            layer: this.viewer.layers[1],
            loaderId: node.number,
            fire: (evt) => {
                if (evt === "loaded") {
                    console.log("Loaded", node.id);

                    this.viewer.stats.dec("Tiling", "Loading");
                    this.viewer.stats.inc("Tiling", "Loaded");
                    
                    node.loadingStatus = 3;

                    this.layer.done(node.number);
                }
            }
        });
	}
};