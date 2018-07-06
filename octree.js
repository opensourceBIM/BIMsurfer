class OctreeNode {
	constructor(x, y, z, width, height, depth, level) {
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.width = width;
		this.height = height;
		this.depth = depth;
		
		this.level = level;
		
		this.center = vec4.fromValues(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, 1);
		this.radius = (Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2) + Math.pow(this.depth, 2))) / 2;
		
		this.matrix = mat4.create();
		mat4.translate(this.matrix, this.matrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
		mat4.scale(this.matrix, this.matrix, [this.width, this.height, this.depth]);
		
		this.bounds = [this.x, this.y, this.z, this.width, this.height, this.depth];
	}
	
	getBounds() {
		return this.bounds;
	}
	
	getMatrix() {
		return this.matrix;
	}

	traverseBreathFirst(fn) {
		for (var node of this.breathFirstList) {
			fn(node);
		}
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
		return this.center;
	}
	
	getBoundingSphereRadius() {
		return this.radius;
	}
	
	split(level) {
		if (level > 0) {
			this.leaf = false;
			this.quadrants = [];
			var newLevel = this.level + 1;
			this.quadrants[0] = new OctreeNode(this.x, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[1] = new OctreeNode(this.x + this.width / 2, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[2] = new OctreeNode(this.x + this.width / 2, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[3] = new OctreeNode(this.x, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[4] = new OctreeNode(this.x, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[5] = new OctreeNode(this.x + this.width / 2, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[6] = new OctreeNode(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel);
			this.quadrants[7] = new OctreeNode(this.x, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel);

			for (var node of this.quadrants) {
				node.split(level - 1);
			}
		} else {
			this.leaf = true;
		}
	}
	
	prepareBreathFirstInternal(breathFirstList, fn, level) {
		if (this.level == level) {
			if (fn(this)) {
				breathFirstList.push(this);
			}
		}
		if (this.level > level) {
			return;
		}
		if (this.quadrants == null) {
			return;
		}
		for (var node of this.quadrants) {
			node.prepareBreathFirstInternal(breathFirstList, fn, level);
		}
	}
}

export default class Octree extends OctreeNode {
	constructor(bounds, maxDepth) {
		super(bounds[0], bounds[1], bounds[2], bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]);
		this.maxDepth = maxDepth;
		this.level = 0;
		this.split(maxDepth);
	}
	
	prepareBreathFirst(fn) {
		this.breathFirstList = [];
		for (var i=0; i<=this.maxDepth; i++) {
			this.prepareBreathFirstInternal(this.breathFirstList, fn, i);
		}
	}
}