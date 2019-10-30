import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec4 from "./glmatrix/vec4.js";

import {Utils} from "./utils.js";

/**
 * Octree implementation targeted towards being used in the TilingLayer, could possibly be retrofitted to be a generic Octree to be used in other contexts
 */
class OctreeNode {
	constructor(viewer, parent, id, min, max, level, globalTranslationVector) {
		this.viewer = viewer;
		this.parent = parent;
		this.globalTranslationVector = globalTranslationVector;
		if (parent != null) {
			if (level > this.parent.deepestLevel) {
				this.parent.deepestLevel = level;
			}
		}
		this.id = id;
		
		this.leaf = true;
		
		this.min = min;
		this.max = max;
		
		this.width = max[0] - min[0];
		this.height = max[1] - min[1];
		this.depth = max[2] - min[2];
		
		this.nrObjects = 0;
		
		this.level = level;
		
		this.box = new Box(this.min, this.max, this.level, globalTranslationVector);
		this.minimalBox = new Box(vec3.fromValues(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE), vec3.fromValues(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE), this.level, globalTranslationVector);

		// TODO also keep track of the minimal bounds (usually smaller than the "static" bounds of the node), which can be used for (frustum) occlusion culling
		// TODO also keep track of the minimal bounds inc. children (useful for hierarchical culling)
		
		this.quadrants = [];
		
//		if (this.viewer.vertexQuantization) {
//			this.vertexQuantizationMatrix = Utils.toArray(this.viewer.vertexQuantization.getTransformedQuantizationMatrix(this.bounds));
//			this.vertexUnquantizationMatrix = Utils.toArray(this.viewer.vertexQuantization.getTransformedInverseQuantizationMatrix(this.bounds));
//		}
		
		this.largestFaceArea = Utils.getLargestFaceArea(this.width, this.height, this.depth);
		this.largestEdge = Utils.getLargestEdge(this.width, this.height, this.depth);
	}
	
	traverseBreathFirstInternal(fn, level) {
		if (this.level == level) {
			var result = fn(this);
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
	
	traverse(fn, onlyLeafs=false, level=0, extraArgument) {
		if (!onlyLeafs || this.leaf == true) {
			if (fn(this, level || 0, extraArgument) === false) {
				return;
			}
		}
		if (this.quadrants == null) {
			return;
		}
		for (var node of this.quadrants) {
			if (node != null) {
				node.traverse(fn, onlyLeafs, (level || 0) + 1, extraArgument);
			}
		}
	}
	
	getQuadrant(localId) {
		if (localId < 0 || localId > 7) {
			throw "Invalid local id: " + localId;
		}
		var quadrant = this.quadrants[localId];
		if (quadrant == null) {
			var newLevel = this.level + 1;
			var newId = this.id * 8 + localId + 1;
			let newMin = vec3.clone(this.min);
			let newMax = vec3.create();
			let halfWidth = this.width / 2;
			let halfHeight = this.height / 2;
			let halfDepth = this.depth / 2;
			switch (localId) {
				case 0:
					break;
				case 1:
					vec3.add(newMin, newMin, [0, 0, halfDepth]);
					break;
				case 2:
					vec3.add(newMin, newMin, [0, halfHeight, 0]);
					break;
				case 3: 
					vec3.add(newMin, newMin, [0, halfHeight, halfDepth])
					break;
				case 4: 
					vec3.add(newMin, newMin, [halfWidth, 0, 0])
					break;
				case 5: 
					vec3.add(newMin, newMin, [halfWidth, 0, halfDepth])
					break;
				case 6:
					vec3.add(newMin, newMin, [halfWidth, halfHeight, 0])
					break;
				case 7:
					vec3.add(newMin, newMin, [halfWidth, halfHeight, halfDepth])
					break;
			}
			var half = vec3.create();
			vec3.sub(half, this.max, this.min);
			vec3.div(half, half, [2, 2, 2]);
			vec3.add(newMax, newMin, half);
			quadrant = new OctreeNode(this.viewer, this, newId, newMin, newMax, newLevel, this.globalTranslationVector);
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
	
	get center() {
		debugger;
	}
	
	get normalizedMatrix() {
		debugger;
	}
	
	get normalizedMinVector() {
		debugger;
	}
	
	get normalizedMaxVector() {
		debugger;
	}
	
	get radius() {
		debugger;
	}
	
	get minmax() {
		debugger;
	}
	
	get matrix() {
		debugger;
	}
}

class Box {
	constructor(min, max, level, globalTranslationVector) {
		this.min = min;
		this.max = max;
		this.level = level;
		this.globalTranslationVector = globalTranslationVector;
		
		this.update();
	}

	update() {
		this.width = this.max[0] - this.min[0];
		this.height = this.max[1] - this.min[1];
		this.depth = this.max[2] - this.min[2];

		this.sizeFactor = 1 / Math.pow(2, this.level);
		this.center = vec3.create();
		vec3.add(this.center, this.max, this.min);
		vec3.div(this.center, this.center, [2, 2, 2]);
		this.normalizedCenter = vec4.create();
		vec3.add(this.normalizedCenter, this.center, this.globalTranslationVector);
		
		this.radius = (Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2) + Math.pow(this.depth, 2))) / 2;
		
		this.matrix = mat4.create();
		mat4.translate(this.matrix, this.matrix, this.center);
		mat4.scale(this.matrix, this.matrix, [this.width, this.height, this.depth]);

		this.normalizedMatrix = mat4.create();
		mat4.translate(this.normalizedMatrix, this.normalizedMatrix, this.center);
		mat4.translate(this.normalizedMatrix, this.normalizedMatrix, this.globalTranslationVector);
		mat4.scale(this.normalizedMatrix, this.normalizedMatrix, [this.width, this.height, this.depth]);
		
		this.normalizedMinVector = vec3.clone(this.min);
		this.normalizedMaxVector = vec3.clone(this.max);
		vec3.add(this.normalizedMinVector, this.normalizedMinVector, this.globalTranslationVector);
		vec3.add(this.normalizedMaxVector, this.normalizedMaxVector, this.globalTranslationVector);
		
		this.minmax = [[this.normalizedMinVector[0], this.normalizedMinVector[1], this.normalizedMinVector[2]], [this.normalizedMaxVector[0] - this.normalizedMinVector[0], this.normalizedMaxVector[1] - this.normalizedMinVector[1], this.normalizedMaxVector[2] - this.normalizedMinVector[2]]];
	}
	
	set(min, max) {
		this.min = min;
		this.max = max;
		
		this.update();
	}
	
	integrate(min, max) {
		vec3.min(this.min, this.min, min);
		vec3.max(this.max, this.max, max);
		
		this.update();
	}
}

export class Octree extends OctreeNode {
	constructor(viewer, realBounds, globalTranslationVector, maxDepth) {
		super(viewer, null, 0, [realBounds[0], realBounds[1], realBounds[2]], [realBounds[3], realBounds[4], realBounds[5]], 0, globalTranslationVector);
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