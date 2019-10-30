/**
 * This class transforms buffers. The main purpose is to fix discrepancies between the over-the-line format and the glsl format. In ideal situations no conversions are needed.
 * At the moment these methods are only used when data is reused. The idea is that all transformations will happen in this class, making for more readable renderers
 */
export class BufferTransformer {
	constructor(settings, vertexQuantization) {
		this.settings = settings;
		this.vertexQuantization = vertexQuantization;
	}

	convertVertices(croid, vertices) {
		if (this.settings.quantizeVertices == this.settings.loaderSettings.quantizeVertices) {
			return vertices;
		}

		var vertex = Array(3);
		var newPositions;
		if (this.settings.quantizeVertices) {
			newPositions = new Int16Array(vertices.length);
		} else {
			newPositions = new Float32Array(vertices.length);
		}
		for (var i=0; i<vertices.length; i+=3) {
			// When quantizeVertices is on and we use the buffers in a combined buffer (which is what this method, addGeometry does),
			// we need to un-quantize the vertices, transform them, then quantize them again (so the shaders can again unquantize them).
			// This because order does matter (object transformation sometimes even mirror stuff)
			// Obviously quantization slows down both CPU (only initially) and GPU (all the time)
			vertex[0] = vertices[i + 0];
			vertex[1] = vertices[i + 1];
			vertex[2] = vertices[i + 2];
			
//			if (this.settings.loaderSettings.quantizeVertices) {
//				vec3.transformMat4(vertex, vertex, this.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(croid));
//			}
			// TODO something is wrong here
//			if (this.settings.quantizeVertices) {
//				vec3.transformMat4(vertex, vertex, this.vertexQuantization.getUntransformedVertexQuantizationMatrix());
//			}
			
			newPositions.set(vertex, i);
		}
		return newPositions;
	}
	
	convertNormals(normals) {
		// When the given normals variable is already in the right format according to the settings, just return that
		if ((this.settings.quantizeNormals && normals instanceof Int8Array) || (!this.settings.quantizeNormals && normals instanceof Float32Array)) {
			return normals;
		}
		var newNormals;
		if (this.settings.quantizeNormals) {
			newNormals = new Int8Array(normals.length);
		} else {
			newNormals = new Float32Array(normals.length);
		}
		var normal = Array(3);
		for (var i=0; i<normals.length; i+=3) {
			normal[0] = normals[i + 0];
			normal[1] = normals[i + 1];
			normal[2] = normals[i + 2];
			
			// Because of the early return on the top of this method, only 2 out of 4 combinations are possible, allowing for this if/else
			if (this.settings.quantizeNormals) {
				normal[0] = normal[0] * 127;
				normal[1] = normal[1] * 127;
				normal[2] = normal[2] * 127;
			} else {
				normal[0] = normal[0] / 127;
				normal[1] = normal[1] / 127;
				normal[2] = normal[2] / 127;
			}
			
			newNormals.set(normal, i);
		}
		return newNormals;
	}
	
	convertIndices(indices, nrOfVertices) {
		if (this.settings.useSmallIndicesIfPossible && nrOfVertices < 65536) {
			// TODO at the moment, indices are never sent in unsigned 16 format
			if (indices instanceof Uint16Array) {
				return indices;
			}
			return new Uint16Array(indices);
		} else {
			if (indices instanceof Uint32Array) {
				return indices;
			}
			return new Uint32Array(indices);
		}
	}
}