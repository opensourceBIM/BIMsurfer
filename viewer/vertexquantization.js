import Utils from './utils.js'

/*
 * This class is responsible for keeping track of the various matrices used for quantization/unquantization
 * 
 * croid stands for: ConcreteRevision Object Identifier, it's a BIMserver object, you can see it as a unique identifier that identifies a revision.
 */
export default class VertexQuantization {
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
			throw "Not found: " + roid;
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
	
	generateMatrices(totalBounds, totalBoundsUntransformed) {
		var matrix = mat4.create();
		var scale = 32768;

		/* Interesting case:
		 * 
		 * Some models have their geometry defined perfectly fine (e.a. a 10x10x10 m building), but their transformations matrices place the model 450km offset
		 * Since we are using both the transformed and the non-transformed bounding boxes to determine the totalBounds, this messes things up
		 * 
		 */
		
		// Scale the model to make sure all values fit within a 2-byte signed short
		mat4.scale(matrix, matrix, vec3.fromValues(
				scale / (totalBounds.max.x - totalBounds.min.x),
				scale / (totalBounds.max.y - totalBounds.min.y),
				scale / (totalBounds.max.z - totalBounds.min.z)
		));

		// Move the model with its center to the origin
		mat4.translate(matrix, matrix, vec3.fromValues(
				-(totalBounds.max.x + totalBounds.min.x) / 2,
				-(totalBounds.max.y + totalBounds.min.y) / 2,
				-(totalBounds.max.z + totalBounds.min.z) / 2
		));

		this.vertexQuantizationMatrix = Utils.toArray(matrix);

		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		
		this.inverseVertexQuantizationMatrix = Utils.toArray(inverse);
		
		// Again
		
		var matrix = mat4.create();

//		 Scale the model to make sure all values fit within a 2-byte signed short
		mat4.scale(matrix, matrix, vec3.fromValues(
				scale / (totalBoundsUntransformed.max.x - totalBoundsUntransformed.min.x),
				scale / (totalBoundsUntransformed.max.y - totalBoundsUntransformed.min.y),
				scale / (totalBoundsUntransformed.max.z - totalBoundsUntransformed.min.z)
		));

		// Move the model with its center to the origin
		mat4.translate(matrix, matrix, vec3.fromValues(
				-(totalBoundsUntransformed.max.x + totalBoundsUntransformed.min.x) / 2,
				-(totalBoundsUntransformed.max.y + totalBoundsUntransformed.min.y) / 2,
				-(totalBoundsUntransformed.max.z + totalBoundsUntransformed.min.z) / 2
		));

		this.untransformedVertexQuantizationMatrix = Utils.toArray(matrix);
	}
}