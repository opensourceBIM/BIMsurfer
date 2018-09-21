/*
 * Octree implementation targeted towards being used in the TilingLayer, could possibly be retrofitted to be a generic Octree to be used in other contexts
 */

class OctreeNode {
	constructor(root, parent, id, x, y, z, width, height, depth, level) {
		this.parent = parent;
		if (parent != null) {
			if (level > this.parent.deepestLevel) {
				this.parent.deepestLevel = level;
			}
		}
		this.root = root;
		if (root != null) {
			root.list.push(this);
		}
		this.id = id;
		
		this.leaf = true;
		
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.minimumBounds = null;
		
		this.nrObjects = 0;
		
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
		this.quadrants = [];
		
		this.largestFaceArea = width * height;
		if (width * depth > this.largestFaceArea) {
			this.largestFaceArea = width * depth;
		}
		if (depth * height > this.largestFaceArea) {
			this.largestFaceArea = depth * height;
		}
		this.largestEdge = width;
		if (height > this.largestEdge) {
			this.largestEdge = height;
		}
		if (depth > this.largestEdge) {
			this.largestEdge = depth;
		}
	}
	
	integrateMinimumBounds(aabb) {
		if (this.minimumBounds == null) {
			this.minimumBounds = [aabb[0], aabb[1], aabb[2], aabb[3], aabb[4], aabb[5]];
		} else {
			for (var i=0; i<3; i++) {
				if (aabb[i] < this.minimumBounds[i]) {
					this.minimumBounds[i] = aabb[i];
				}
				if (aabb[i + 3] > this.minimumBounds[i + 3]) {
					this.minimumBounds[i + 3] = aabb[i + 3];
				}
			}
		}
	}
	
	setMinimumBounds(minimumBounds) {
		this.minimumBounds = minimumBounds;
		
		this.minimumBoundsMatrix = mat4.create();
		mat4.translate(this.minimumBoundsMatrix, this.minimumBoundsMatrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
		mat4.scale(this.minimumBoundsMatrix, this.minimumBoundsMatrix, [this.minimumBounds[3] - this.minimumBounds[0], this.minimumBounds[4] - this.minimumBounds[1], this.minimumBounds[5] - this.minimumBounds[2]]);
	}
	
	getMinimumBoundsMatrix() {
		return this.minimumBoundsMatrix;
//		if (this.minimumBounds == null) {
//			return this.matrix;
//		}
//		var matrix = mat4.create();
//		mat4.translate(matrix, matrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
//		mat4.scale(matrix, matrix, [this.minimumBounds[3] - this.minimumBounds[0], this.minimumBounds[4] - this.minimumBounds[1], this.minimumBounds[5] - this.minimumBounds[2]]);
//		return matrix;
	}
	
	getBounds() {
		return this.bounds;
	}
	
	getMatrix() {
		return this.matrix;
	}

	traverseBreathFirstInternal(fn, level, toSkip) {
		if (toSkip != null && toSkip.has(this.id)) {
			return;
		}
		if (this.level == level) {
			var result = fn(this);
			if (result === false && toSkip != null) {
				// TODO do something to make sure we are not calling fn for the children of this node
				toSkip.add(this.id);
			}
		}
		if (this.level >= level) {
			return;
		}
		for (var node of this.quadrants) {
			if (node != null) {
				node.traverseBreathFirstInternal(fn, level, toSkip);
			}
		}
	}
	
	traverseBreathFirst(fn) {
		var toSkip = null;
		for (var l=0; l<=this.maxDepth; l++) {
			this.traverseBreathFirstInternal(fn, l, toSkip);
		}
	}
	
	traverse(fn, onlyLeafs, level) {
		if (this.leaf == true || !onlyLeafs) {
			fn(this, level || 0);
		}
		if (this.quadrants == null) {
			return;
		}
		for (var node of this.quadrants) {
			if (node != null) {
				node.traverse(fn, onlyLeafs, (level || 0) + 1);
			}
		}
	}
	
	getCenter() {
		return this.center;
	}
	
	getBoundingSphereRadius() {
		return this.radius;
	}
	
	getQuadrant(localId) {
		if (localId < 0 || localId > 7) {
			throw "Invalid local id: " + localId;
		}
		var quadrant = this.quadrants[localId];
		if (quadrant == null) {
			var newLevel = this.level + 1;
			var newId = this.id * 8 + localId + 1;
			switch (localId) {
				case 0: quadrant = new OctreeNode(this.root, this, newId, this.x, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 1: quadrant = new OctreeNode(this.root, this, newId, this.x, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 2: quadrant = new OctreeNode(this.root, this, newId, this.x, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 3: quadrant = new OctreeNode(this.root, this, newId, this.x, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 4: quadrant = new OctreeNode(this.root, this, newId, this.x + this.width / 2, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 5: quadrant = new OctreeNode(this.root, this, newId, this.x + this.width / 2, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 6: quadrant = new OctreeNode(this.root, this, newId, this.x + this.width / 2, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
				case 7: quadrant = new OctreeNode(this.root, this, newId, this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel); break;
			}
			this.quadrants[localId] = quadrant;
		}
		this.leaf = false;
		return quadrant;
	}
	
	getNodeById(id) {
		if (id == this.id) {
			return this;
		}
		var localId = (id - 1) % 8;
		var parentId = (id - 1 - localId) / 8;
		var list = [];
		list.push((id - 1) % 8);
		while (parentId > 0) {
			list.push((parentId - 1) % 8);
			parentId = Math.floor((parentId - 1) / 8);
		}
		var node = this;
		for (var i=list.length-1; i>=0; i--) {
			node = node.getQuadrant(list[i]);
		}
		if (node.id != id) {
			throw "Ids do not match " + node.id + " / " + id;
		}
		return node;
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
			if (node != null) {
				node.prepareBreathFirstInternal(breathFirstList, fn, level);
			}
		}
	}

	prepareFullListInternal(fullList, level) {
		if (this.level == level) {
			fullList.push(this);
		}
		if (this.level > level) {
			return;
		}
		if (this.quadrants == null) {
			return;
		}
		for (var node of this.quadrants) {
			node.prepareFullListInternal(fullList, level);
		}
	}
}

export default class Octree extends OctreeNode {
	constructor(bounds, maxDepth) {
		super(null, null, 0, bounds[0], bounds[1], bounds[2], bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]);
		this.root = this;
		this.maxDepth = maxDepth;
		this.level = 0;
		this.breathFirstList = [];
		this.list = [this];
	}
	
	extractBreathFirstList(fn) {
		var list = [];
		this.traverseBreathFirst((node) => {
			if (fn(node)) {
				list.push(node);
				return true;
			} else {
				return false;
			}
		});
		return list;
	}
	
	traverseBreathFirstCached(fn) {
		for (var node of this.breathFirstList) {
			fn(node);
		}
	}
}