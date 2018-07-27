export default class RenderLayer {
	constructor(viewer) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;

		this.loaders = new Map();
	}

	createGeometry(loaderId, roid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		var bytes = 0;
		if (this.settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			bytes += colors.length * 4;
		}
		if (indices.length < 65536 && this.settings.useSmallIndicesIfPossible) {
			bytes += indices.length * 2;
		} else {
			bytes += indices.length * 4;
		}
		if (this.settings.quantizeNormals) {
			bytes += normals.length;
		} else {
			bytes += normals.length * 4;
		}
		var geometry = {
				id: geometryId,
				roid: roid,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: []
		};
		
		var loader = this.getLoader(loaderId);

		loader.geometries[geometryId] = geometry;
		geometry.isReused = this.settings.reuseFn(reused, geometry);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}

		return geometry;
	}

	addGeometry(loaderId, geometry, object, buffer, sizes) {
		var startIndex = buffer.positionsIndex / 3;

		try {
			
			var vertex = Array(3);
			for (var i=0; i<geometry.positions.length; i+=3) {
				// When quantizeVertices is on and we use the buffers in a combined buffer (which is what this method, addGeometry does),
				// we need to un-quantize the vertices, transform them, then quantize them again (so the shaders can again unquantize them).
				// This because order does matter (object transformation sometimes even mirror stuff)
				// Obviously quantization slows down both CPU (only initially) and GPU (all the time)
				vertex[0] = geometry.positions[i + 0];
				vertex[1] = geometry.positions[i + 1];
				vertex[2] = geometry.positions[i + 2];
				
				// If the geometry loader loads quantized data we need to unquantize first
				// TODO there is a possible performance improvement possible for all modelset where the totalBounds of the modelSet are the same as for each individual submodel (for example all projects without subprojects).
				// In that case we won't have to unquantize + quantize again
				
				if (this.settings.loaderSettings.quantizeVertices) {
					vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForRoid(geometry.roid));
				}
				vec3.transformMat4(vertex, vertex, object.matrix);
				if (this.settings.quantizeVertices) {
					vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getTransformedVertexQuantizationMatrix());
				}
	
				buffer.positions.set(vertex, buffer.positionsIndex);
				buffer.positionsIndex += 3;
			}
			var normal = Array(3);
			for (var i=0; i<geometry.normals.length; i+=3) {
				normal[0] = geometry.normals[i + 0];
				normal[1] = geometry.normals[i + 1];
				normal[2] = geometry.normals[i + 2];
	
				// TODO Magnitude does not really matter for normals right(?), so why can't we just keep the normals quantized?? Should test disabling this when the shaders are actually shading...
//				if (this.settings.loaderSettings.quantizeNormals) {
//					normal[0] = normal[0] / 127;
//					normal[1] = normal[1] / 127;
//					normal[2] = normal[2] / 127;
//				}
				vec3.transformMat4(normal, normal, object.matrix);
				vec3.normalize(normal, normal);
//				if (this.settings.quantizeNormals) {
//					normal[0] = normal[0] * 127;
//					normal[1] = normal[1] * 127;
//					normal[2] = normal[2] * 127;
//				}
	
				buffer.normals.set(normal, buffer.normalsIndex);
				buffer.normalsIndex += 3;
			}
			if (geometry.colors != null) {
				buffer.colors.set(geometry.colors, buffer.colorsIndex);
				buffer.colorsIndex += geometry.colors.length;
			}

			var viewObject = this.viewer.viewObjects[object.id];
			if (viewObject) {
				var pickColor = this.viewer.getPickColor(viewObject.pickId);
				var numPickColors = (geometry.positions.length / 3) * 4;
				for (var j = buffer.pickColorsIndex, lenj = buffer.pickColorsIndex + numPickColors; j < lenj; j+=4) {
					buffer.pickColors[j + 0] = pickColor[0];
					buffer.pickColors[j + 1] = pickColor[1];
					buffer.pickColors[j + 2] = pickColor[2];
					buffer.pickColors[j + 3] = pickColor[3];
				}
				buffer.pickColorsIndex += numPickColors;
			} else {
				console.log("viewObject not found: " + object.id);
			}

			if (startIndex == 0) {
				// Small optimization, if this is the first object in the buffer, no need to add the startIndex to each index
				buffer.indices.set(geometry.indices, 0);
				buffer.indicesIndex = geometry.indices.length;
			} else {
				var index = Array(3);
				for (var i=0; i<geometry.indices.length; i+=3) {
					index[0] = geometry.indices[i + 0] + startIndex;
					index[1] = geometry.indices[i + 1] + startIndex;
					index[2] = geometry.indices[i + 2] + startIndex;
					
					buffer.indices.set(index, buffer.indicesIndex);
					buffer.indicesIndex += 3;
				}
			}
		} catch (e) {
			console.error(e);
			console.log(sizes);
			console.log(buffer);
			throw e;
		}

		buffer.nrIndices += geometry.indices.length;
		
		if (buffer.needsToFlush) {
			this.flushBuffer(buffer);
		}
	}
	
	getLoader(loaderId) {
		return this.loaders.get(loaderId);
	}
	
	removeLoader(loaderId) {
		this.loaders.delete(loaderId);
	}
	
	getObject(loaderId, identifier) {
		return this.getLoader(loaderId).objects[identifier];
	}
	
	registerLoader(loaderId) {
		this.loaders.set(loaderId, {
			loaderId: loaderId,
			objects: {},
			geometries: {}
		});
	}
	
	sortBuffers(buffers) {
		buffers.sort((a, b) => {
			for (var i=0; i<4; i++) {
				if (a.color[i] == b.color[i]) {
					continue;
				}
				return a.color[i] - b.color[i];
			}
			// Colors are the same
			return 0;
		});
	}
}