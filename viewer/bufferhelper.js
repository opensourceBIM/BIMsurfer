/*
 * This is a utility class, it contains a few methods that convert bytes to triangles and the other way around, these are estimations because the amount of reuse is not known
 */

/**
 * @ignore
 */
export class BufferHelper {
	static trianglesToBytes(settings, nrPrimitives) {
		var reusedVerticesFactor = 0.5;
		var estimatedNonReusedByteSize = 0;
		if (!settings.useObjectColors) {
			estimatedNonReusedByteSize += nrPrimitives * 3 * 4;
		}
		estimatedNonReusedByteSize += nrPrimitives * 3 * (settings.useSmallIndicesIfPossible ? 2 : 4); // indices
		estimatedNonReusedByteSize += reusedVerticesFactor * nrPrimitives * 3 * 4 * (settings.quantizeVertices ? 2 : 4); // vertices
		estimatedNonReusedByteSize += reusedVerticesFactor * nrPrimitives * 3 * 4 * (settings.quantizeNormals ? 1 : 4); // normals
		
		return estimatedNonReusedByteSize;
	}
	
	static bytesToTriangles(settings, bytes) {
		var reusedVerticesFactor = 0.8;
		var triangles = 0;
		if (!settings.useObjectColors) {
			triangles += bytes / 12;
		}
		triangles += bytes / (3 * (settings.useSmallIndicesIfPossible ? 2 : 4)); // indices
		triangles += bytes / (reusedVerticesFactor * 3 * 4 * (settings.quantizeVertices ? 2 : 4)); // vertices
		triangles += bytes / (reusedVerticesFactor * 3 * 4 * (settings.quantizeNormals ? 1 : 4)); // normals
		
		return triangles;
	}
}