class OctreeNode {
	constructor(x, y, z, width, height, depth) {
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.width = width;
		this.height = height;
		this.depth = depth;
		
		this.id = Math.floor(Math.random() * Math.floor(100000));
	}
	
	getBounds() {
		return [this.x, this.y, this.z, this.width, this.height, this.depth];
	}
	
	getMatrix() {
		if (this.matrix == null) {
			this.matrix = mat4.create();
			mat4.translate(this.matrix, this.matrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
			mat4.scale(this.matrix, this.matrix, [this.width, this.height, this.depth]);
		}
		return this.matrix;
	}
	
	traverse(fn, onlyLeafs) {
		if (this.leaf == true || !onlyLeafs) {
			fn(this);
		}
		if (this.quadrants == null) {
			return;
		}
		for (var node of this.quadrants) {
			node.traverse(fn, onlyLeafs);
		}
	}
	
	getCenter() {
		return vec4.fromValues(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, 1);
	}
	
	getBoundingSphereRadius() {
		return (Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2) + Math.pow(this.depth, 2))) / 2;
	}
	
	split(level) {
		if (level > 0) {
			this.leaf = false;
			this.quadrants = [];
			this.quadrants[0] = new OctreeNode(this.x, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[1] = new OctreeNode(this.x + this.width / 2, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[2] = new OctreeNode(this.x + this.width / 2, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[3] = new OctreeNode(this.x, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[4] = new OctreeNode(this.x, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[5] = new OctreeNode(this.x + this.width / 2, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[6] = new OctreeNode(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2);
			this.quadrants[7] = new OctreeNode(this.x, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2);

			for (var node of this.quadrants) {
				node.split(level - 1);
			}
		} else {
			this.leaf = true;
		}
	}
}

export default class Octree extends OctreeNode {
	constructor(bounds, depth) {
		super(bounds[0], bounds[1], bounds[2], bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]);
	}
}