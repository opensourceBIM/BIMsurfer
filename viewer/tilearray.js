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
		
        this.level = 1;
        
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
    constructor(viewer, index) {
        this.viewer = viewer;
        this.index = index;
        var tmp = {};
        this.index.forEach((tile) => {
            if (!(tile.id in tmp)) {
                let mi = new Float32Array(tile.bounds.slice(0,3));
                let ma = new Float32Array(tile.bounds.slice(3,6));
                let size = vec3.subtract(vec3.create(), ma, mi);
                tmp[tile.id] = new TileArrayNode(tile.id, mi[0], mi[1], mi[2], size[0], size[1], size[2]);
                tmp[tile.id].urls = []
            }
            tmp[tile.id].urls.push(tile.url);
        });
        this.tiles = Object.values(tmp);
        this.tiles.forEach((tile, i) => {
            tile.number = i + 1;
        });
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
        this.layer.registerLoader(node.number);
        this.layer.loaderToNode[node.number] = node;
        node.stats = {
            triangles: 0,
            drawCallsPerFrame: 0
        };
        
        node.gpuBufferManager = new GpuBufferManager(this.viewer);
        
        this.viewer.stats.inc("Tiling", "Loading");
        this.viewer.dirty = true;
        node.loadingStatus = 2;
        
        this.viewer.loadFiles(node.id, node.number, node.urls, this.layer).then(()=>{
            node.loadingStatus = 3;
            this.layer.done(node.number);
        });
	}
};