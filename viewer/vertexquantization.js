/*
 * This class is responsible for keeping track of the various matrices used for quantization/unquantization
 * 
 * TODO: Document more
 */
export default class VertexQuantization {
	constructor(settings) {
		this.settings = settings;
		
		// roid -> untransformed quantization matrices (per model)
		this.untransformedQuantizationMatrices = new Map();
		this.untransformedInverseQuantizationMatrices = new Map();
	}

	getUntransformedInverseVertexQuantizationMatrixForRoid(croid) {
		var matrix = this.untransformedInverseQuantizationMatrices.get(croid);
		if (matrix == null) {
			throw "Not found for croid " + croid;
		}
		return matrix;
	}
	
	getUntransformedVertexQuantizationMatrixForRoid(roid) {
		var matrix = this.untransformedQuantizationMatrices.get(roid);
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
	
	generateUntransformedMatrices(roid, boundsUntransformed) {
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
		
		this.untransformedQuantizationMatrices.set(roid, this.toArray(matrix));
		
		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		
		this.untransformedInverseQuantizationMatrices.set(roid, this.toArray(inverse));
	}
	
	generateMatrices(totalBounds, totalBoundsUntransformed) {
		// We calculate the total bounds for both transformed and non-transformed geometry. We need those bounds because when using quantization we cannot let the values
		// go beyond any of those
//		var combinedBounds = {
//				min: {
//					x: Math.min(totalBounds.min.x, totalBoundsUntransformed.min.x),
//					y: Math.min(totalBounds.min.y, totalBoundsUntransformed.min.y),
//					z: Math.min(totalBounds.min.z, totalBoundsUntransformed.min.z)
//				}, max: {
//					x: Math.max(totalBounds.max.x, totalBoundsUntransformed.max.x),
//					y: Math.max(totalBounds.max.y, totalBoundsUntransformed.max.y),
//					z: Math.max(totalBounds.max.z, totalBoundsUntransformed.max.z)
//				}
//		};
		// vertexQuantizationMatrix is what we want the server to apply
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

		this.vertexQuantizationMatrix = this.toArray(matrix);
//		loaderSettings.vertexQuantizationMatrix = this.toArray(matrix);

		var inverse = mat4.create();
		mat4.invert(inverse, matrix);
		
		this.inverseVertexQuantizationMatrix = this.toArray(inverse);
		
//		loaderSettings.inverseQuantizationMatrix = inverse;
		
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

		this.untransformedVertexQuantizationMatrix = this.toArray(matrix);
		
		console.log(this.untransformedVertexQuantizationMatrix);
		console.log(this.vertexQuantizationMatrix);
//		this.inverseVertexQuantizationMatrix = matrix;
////		settings.vertexQuantizationMatrix = matrix;
//
//		var inverse = mat4.create();
//		mat4.invert(inverse, matrix);
		
//		settings.inverseQuantizationMatrix = inverse;
		
//		settings.combinedInverseQuantizationMatrix = mat4.create();

//		this.transformedVertexQuantizationMatrix = mat4.create();
		
//		mat4.multiply(settings.transformedVertexQuantizationMatrix, this.vertexQuantizationMatrix, loaderSettings.vertexQuantizationMatrix);
//		mat4.invert(settings.combinedInverseQuantizationMatrix, settings.combinedVertexQuantizationMatrix);
	}

	// TODO move to utils
	toArray(matrix) {
		var result = new Array(16);
		for (var i=0; i<16; i++) {
			result[i] = matrix[i];
		}
		return result;
	}
}