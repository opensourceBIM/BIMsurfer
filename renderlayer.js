import BufferTransformer from './buffertransformer.js'

export default class RenderLayer {
	constructor(viewer) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;

		this.loaders = new Map();
		this.bufferTransformer = new BufferTransformer(this.settings, viewer.vertexQuantization);
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
	
	addGeometryToObject(geometryId, objectId, loader, liveReusedBuffers) {
		var geometry = loader.geometries[geometryId];
		if (geometry == null) {
			return;
		}
		var object = loader.objects[objectId];
		if (object.visible) {
			this.addGeometry(loader.loaderId, geometry, object);
			object.geometry.push(geometryId);
		} else {
			this.viewer.stats.inc("Primitives", "Nr primitives hidden", geometry.indices.length / 3);
			if (this.progressListener != null) {
				this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
			}
		}
		if (geometry.isReused) {
			geometry.reuseMaterialized++;
			if (geometry.reuseMaterialized == geometry.reused) {
				this.addGeometryReusable(geometry, loader, liveReusedBuffers);
			}
		}
	}
	
	addGeometryReusable(geometry, loader, liveReusedBuffers) {
		const positionBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferTransformer.convertVertices(loader.roid, geometry.positions), this.gl.STATIC_DRAW, 0, 0);
		
		const normalBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferTransformer.convertNormals(geometry.normals), this.gl.STATIC_DRAW, 0, 0);
		
		if (geometry.colors != null) {
			var colorBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.colors, this.gl.STATIC_DRAW, 0, 0);
		}

		const indexBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		var indices = this.bufferTransformer.convertIndices(geometry.indices, geometry.positions.length);
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW, 0, 0);

		const instancesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancesBuffer);
		var matrices = new Float32Array(geometry.matrices.length * 16);
		geometry.matrices.forEach((matrix, index) => {
			matrices.set(matrix, index * 16);
		});
		this.gl.bufferData(this.gl.ARRAY_BUFFER, matrices, this.gl.STATIC_DRAW, 0, 0);

		var vao = this.gl.createVertexArray();
		this.gl.bindVertexArray(vao);
		
		var programInfo = this.viewer.programManager.getProgram({
			instancing: true,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices
		});

		{
			const numComponents = 3;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			
			if (this.settings.quantizeVertices) {
				this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition,	numComponents, this.gl.FLOAT, normalize, stride, offset);
			}
			this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
		}
		{
			const numComponents = 3;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
			
			if (this.settings.quantizeNormals) {
				this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.BYTE, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.FLOAT, normalize, stride, offset);
			}
			this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
		}

		if (!this.settings.useObjectColors) {
			const numComponents = 4;
			const type = this.gl.FLOAT;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, type, normalize, stride, offset);
			this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
		}

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancesBuffer);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 0, 4, this.gl.FLOAT, false, 64, 0);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 1);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 1, 4, this.gl.FLOAT, false, 64, 16);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 2);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 2, 4, this.gl.FLOAT, false, 64, 32);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 3);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 3, 4, this.gl.FLOAT, false, 64, 48);

		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 0, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 1, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 2, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 3, 1);

		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);		  

		this.gl.bindVertexArray(null);

		var buffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				indexBuffer: indexBuffer,
				nrIndices: geometry.indices.length,
				vao: vao,
//				matrices: geometry.matrices,
//				dirtyMatrices: false,
				nrProcessedMatrices: geometry.matrices.length,
//				geometry: geometry,
				instancesBuffer: instancesBuffer,
				roid: geometry.roid,
//				instances: matrices,
				hasTransparency: geometry.hasTransparency,
				indexType: indices instanceof Uint16Array ? this.gl.UNSIGNED_SHORT : this.gl.UNSIGNED_INT
		};
		
		if (this.settings.useObjectColors) {
			buffer.colorBuffer = colorBuffer;
			buffer.color = [geometry.color.r, geometry.color.g, geometry.color.b, geometry.color.a];
			buffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
		}
		
		delete loader.geometries[geometry.id];
		liveReusedBuffers.push(buffer);

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", (buffer.nrIndices / 3) * geometry.matrices.length);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}

		var toadd = geometry.bytes + geometry.matrices.length * 16 * 4;
		this.viewer.stats.inc("Drawing", "Draw calls per frame");
		this.viewer.stats.inc("Data", "GPU bytes reuse", toadd);
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);

		geometry.buffer = buffer;
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