import {Utils} from './utils.js'

/**
 * Octree implementation targeted towards being used in the TilingLayer, could possibly be retrofitted to be a generic Octree to be used in other contexts
 */
class OctreeNode {
	constructor(viewer, parent, id, x, y, z, width, height, depth, level, globalTransformation) {
		this.viewer = viewer;
		this.parent = parent;
		this.globalTransformation = globalTransformation;
		if (parent != null) {
			if (level > this.parent.deepestLevel) {
				this.parent.deepestLevel = level;
			}
		}
		this.id = id;
		
		this.leaf = true;
		
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.nrObjects = 0;
		
		this.width = width;
		this.height = height;
		this.depth = depth;
		
		this.level = level;
		
		this.center = vec4.fromValues(this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, 1);
		this.normalizedCenter = vec4.create();
		vec3.transformMat3(this.normalizedCenter, this.center, this.globalTransformation);
		
		this.radius = (Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2) + Math.pow(this.depth, 2))) / 2;
		
		this.matrix = mat4.create();
		mat4.translate(this.matrix, this.matrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
		mat4.scale(this.matrix, this.matrix, [this.width, this.height, this.depth]);

		this.normalizedMatrix = mat4.create();
		mat4.multiply(this.normalizedMatrix, this.normalizedMatrix, this.globalTransformation);
		mat4.translate(this.normalizedMatrix, this.normalizedMatrix, [this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2]);
		mat4.scale(this.normalizedMatrix, this.normalizedMatrix, [this.width, this.height, this.depth]);
		
		this.bounds = [this.x, this.y, this.z, this.width, this.height, this.depth];
		
		var minVector = vec3.create();
		var maxVector = vec3.create();
		vec3.set(minVector, this.bounds[0], this.bounds[1], this.bounds[2]);
		vec3.set(maxVector, this.bounds[0] + this.bounds[3], this.bounds[1] + this.bounds[4], this.bounds[2] + this.bounds[5]);
		this.boundsVectors = [minVector, maxVector];
		
		var normalizedMinVector = vec3.clone(minVector);
		var normalizedMaxVector = vec3.clone(maxVector);
		vec3.transformMat4(normalizedMinVector, normalizedMinVector, globalTransformation);
		vec3.transformMat4(normalizedMaxVector, normalizedMaxVector, globalTransformation);
		this.normalizedBoundsVectors = [normalizedMinVector, normalizedMaxVector];
		
		// TODO also keep track of the minimal bounds (usually smaller than the "static" bounds of the node), which can be used for (frustum) occlusion culling
		// TODO also keep track of the minimal bounds inc. children (useful for hyrachical culling)
		
		this.quadrants = [];
		
		if (this.viewer.vertexQuantization) {
			this.vertexQuantizationMatrix = Utils.toArray(this.viewer.vertexQuantization.getTransformedQuantizationMatrix(this.bounds));
			this.vertexUnquantizationMatrix = Utils.toArray(this.viewer.vertexQuantization.getTransformedInverseQuantizationMatrix(this.bounds));
		}
		
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
	
	getBounds() {
		return this.bounds;
	}
	
	getMatrix() {
		return this.matrix;
	}

	traverseBreathFirstInternal(fn, level) {
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
				node.traverseBreathFirstInternal(fn, level);
			}
		}
	}
	
	traverseBreathFirst(fn) {
		if (this.levelLists == null) {
			return;
		}
		for (var l=0; l<=this.maxDepth; l++) {
			for (var node of this.levelLists[l]) {
				fn(node);
			}
		}
	}
	
	traverse(fn, onlyLeafs, level) {
		if (!onlyLeafs || this.leaf == true) {
			if (fn(this, level || 0) === false) {
				return;
			}
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
				case 0: quadrant = new OctreeNode(this.viewer, this, newId, this.x, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 1: quadrant = new OctreeNode(this.viewer, this, newId, this.x, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 2: quadrant = new OctreeNode(this.viewer, this, newId, this.x, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 3: quadrant = new OctreeNode(this.viewer, this, newId, this.x, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 4: quadrant = new OctreeNode(this.viewer, this, newId, this.x + this.width / 2, this.y, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 5: quadrant = new OctreeNode(this.viewer, this, newId, this.x + this.width / 2, this.y, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 6: quadrant = new OctreeNode(this.viewer, this, newId, this.x + this.width / 2, this.y + this.height / 2, this.z, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
				case 7: quadrant = new OctreeNode(this.viewer, this, newId, this.x + this.width / 2, this.y + this.height / 2, this.z + this.depth / 2, this.width / 2, this.height / 2, this.depth / 2, newLevel, this.globalTransformation); break;
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
	
	prepareLevelListsInternal(level, levelList) {
		if (this.level == level) {
			levelList.push(this);
		}
		if (this.level >= level) {
			return;
		}
		for (var node of this.quadrants) {
			if (node != null) {
				node.prepareLevelListsInternal(level, levelList);
			}
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

export class Octree extends OctreeNode {
	constructor(viewer, realBounds, globalTransformation, maxDepth) {
		super(viewer, null, 0, realBounds[0], realBounds[1], realBounds[2], realBounds[3] - realBounds[0], realBounds[4] - realBounds[1], realBounds[5] - realBounds[2], 0, globalTransformation);
		this.maxDepth = maxDepth;
		this.actualMaxLevel;
		this.level = 0;
		this.breathFirstList = [];
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
	
	prepareLevelLists() {
		this.levelLists = [];
		for (var l=0; l<=this.maxDepth; l++) {
			this.levelLists[l] = [];
			this.prepareLevelListsInternal(l, this.levelLists[l]);
		}
	}
}