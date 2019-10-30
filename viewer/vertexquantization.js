import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {Utils} from "./utils.js";

/**
 * This class is responsible for keeping track of the various matrices used for quantization/unquantization
 * 
 * croid stands for: ConcreteRevision Object Identifier, it's a BIMserver object, you can see it as a unique identifier that identifies a revision.
 */
export class VertexQuantization {
	constructor(settings) {
		this.settings = settings;
		
		// croid -> untransformed quantization matrices (1 per model)
		this.untransformedQuantizationMatrices = new Map();

		// croid -> untransformed inverse quantization matrices (1 per model)
		this.untransformedInverseQuantizationMatrices = new Map();
	}

	getUntransformedInverseVertexQuantizationMatrixForCroid(croid) {
		var matrix = this.untransformedInverseQuantizationMatrices.get(croid);
		if (matrix == null) {
			throw "Not found for croid " + croid;
		}
		return matrix;
	}
	
	getUntransformedVertexQuantizationMatrixForCroid(croid) {
		var matrix = this.untransformedQuantizationMatrices.get(croid);
		if (matrix == null) {
			throw "Not found: " + croid;
		}
		return matrix;
	}
	
	getTransformedVertexQuantizationMatrix() {
		if (this.vertexQuantizationMatrix == null) {
			throw "Not found: vertexQuantizationMatrix";
		}
		return this.vertexQuantizationMatrix;
	}

	getUntransformedVertexQuantizationMatrix() {
		if (this.untransformedVertexQuantizationMatrix == null) {
			throw "Not found: untransformedVertexQuantizationMatrix";
		}
		return this.vertexQuantizationMatrix;
	}

	getTransformedInverseVertexQuantizationMatrix() {
		if (this.inverseVertexQuantizationMatrix == null) {
			throw "Not found: inverseVertexQuantizationMatrix";
		}
		return this.inverseVertexQuantizationMatrix;
	}
	
	generateUntransformedMatrices(croid, boundsUntransformed) {
		var matrix = mat4.create();
		var scale = 32768;
		
		// Scale the model to make sure all values fit within a 2-byte signed short
		mat4.scale(matrix, matrix, vec3.fromValues(
				scale / (boundsUntransformed.max.x - boundsUntransformed.min.x),
				scale / (boundsUntransformed.max.y - boundsUntransformed.min.y),
				scale / (boundsUntransformed.max.z - boundsUntransformed.min.z)
		));

		// Move the model with its center to the origin
		mat4.translate(matrix, matrix, vec3.fromValues(
				-(boundsUntransformed.max.x + boundsUntransformed.min.x) / 2,
				-(boundsUntransformed.max.y + boundsUntransformed.min.y) / 2,
				-(boundsUntransformed.max.z + boundsUntransformed.min.z) / 2
		));
		
		// Store the untransformed quantization matrix
		this.untransformedQuantizationMatrices.set(croid, Utils.toArray(matrix));
		
		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		
		// Store the untransformed inverse quantization matrix
		this.untransformedInverseQuantizationMatrices.set(croid, Utils.toArray(inverse));
	}
	
	getTransformedQuantizationMatrix(boundsUntransformed) {
		var matrix = mat4.create();
		var scale = 32768;
		
		// Scale the model to make sure all values fit within a 2-byte signed short
		mat4.scale(matrix, matrix, vec3.fromValues(
			scale / boundsUntransformed[3],
			scale / boundsUntransformed[4],
			scale / boundsUntransformed[5]
		));
		
		// Move the model with its center to the origin
		mat4.translate(matrix, matrix, vec3.fromValues(
			-(boundsUntransformed[3] / 2 + boundsUntransformed[0]),
			-(boundsUntransformed[4] / 2 + boundsUntransformed[1]),
			-(boundsUntransformed[5] / 2 + boundsUntransformed[2])
		));

		return matrix;
	}
	
	getTransformedInverseQuantizationMatrix(boundsUntransformed) {
		var matrix = this.getTransformedQuantizationMatrix(boundsUntransformed);
		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		
		return inverse;
	}
	
	generateMatrix(bounds, globalTranslationVector) {
		var matrix = mat4.create();
		var scale = 32768;
		
		var min = vec3.fromValues(bounds.min.x, bounds.min.y, bounds.min.z);
		var max = vec3.fromValues(bounds.max.x, bounds.max.y, bounds.max.z);
		
		vec3.add(min, min, globalTranslationVector);
		vec3.add(max, max, globalTranslationVector);
		
		// Scale the model to make sure all values fit within a 2-byte signed short
		mat4.scale(matrix, matrix, vec3.fromValues(
				scale / (max[0] - min[0]),
				scale / (max[1] - min[1]),
				scale / (max[2] - min[2])
		));

		// Move the model with its center to the origin
		mat4.translate(matrix, matrix, vec3.fromValues(
				-(max[0] + min[0]) / 2,
				-(max[1] + min[1]) / 2,
				-(max[2] + min[2]) / 2
		));

		return matrix;
	}
	
	generateMatrices(totalBounds, totalBoundsUntransformed, globalTranslationVector) {
		var matrix = this.generateMatrix(totalBounds, vec3.create());
		var matrixWithGlobalTranslation = this.generateMatrix(totalBounds, globalTranslationVector);
		
		this.vertexQuantizationMatrix = Utils.toArray(matrix);
		this.vertexQuantizationMatrixWithGlobalTranslation = Utils.toArray(matrixWithGlobalTranslation);

		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		this.inverseVertexQuantizationMatrix = Utils.toArray(inverse);

		var inverse = mat4.create();
		mat4.invert(inverse, matrixWithGlobalTranslation);
		this.inverseVertexQuantizationMatrixWithGlobalTranslation = Utils.toArray(inverse);

		var matrix = this.generateMatrix(totalBoundsUntransformed, vec3.create());
		this.untransformedVertexQuantizationMatrix = Utils.toArray(matrix);
	}
}