import BufferTransformer from './buffertransformer.js'
import Utils from './utils.js'
import GpuBufferManager from './gpubuffermanager.js'
import GeometryCache from './geometrycache.js'

export default class RenderLayer {
	constructor(viewer, geometryDataToReuse) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;
		this.geometryDataToReuse = geometryDataToReuse;
		this.geometryCache = new GeometryCache(this);

		this.loaders = new Map();
		this.bufferTransformer = new BufferTransformer(this.settings, viewer.vertexQuantization);
	}

	createGeometry(loaderId, roid, croid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		var bytes = 0;
		if (this.settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			if (this.settings.quantizeColors) {
				bytes += colors.length;
			} else {
				bytes += colors.length * 4;
			}
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
				croid: croid,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: [],
				objects: []
		};
		
		var loader = this.getLoader(loaderId);

		loader.geometries.set(geometryId, geometry);
		geometry.isReused = geometry.reused > 1 && this.geometryDataToReuse.has(geometry.id);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}

		return geometry;
	}

	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, gpuBufferManager) {
		var object = {
				id: objectId,
				visible: type != "IfcOpeningElement" && type != "IfcSpace",
				hasTransparency: hasTransparency,
				matrix: matrix,
                normalMatrix: normalMatrix,
				scaleMatrix: scaleMatrix,
				geometry: [],
				roid: roid,
//				object: this.viewer.model.objects[oid],
				add: (geometryId, objectId) => {
					this.addGeometryToObject(geometryId, objectId, loader, gpuBufferManager);
				}
		};

		var loader = this.getLoader(loaderId);
		loader.objects.set(oid , object);

		var viewObject = {
            type: type,
			aabb: aabb,
			objectId: objectId,
			oid: oid,
			center: null // TODO
		};
		this.viewer.viewObjects.set(objectId, viewObject);

		geometryIds.forEach((id) => {
			this.addGeometryToObject(id, object.id, loader, gpuBufferManager);
		});

		this.viewer.stats.inc("Models", "Objects");

		return object;
	}

	addGeometry(loaderId, geometry, object, buffer, sizes) {

		var loaderQuantizeNormals = this.settings.loaderSettings.quantizeNormals;
		var quantizeNormals = this.settings.quantizeNormals;

		var startIndex = buffer.positionsIndex / 3;

		try {
			var vertex = vec3.create();
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
					vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(geometry.croid));
				}
				vec3.transformMat4(vertex, vertex, object.matrix);
				if (this.settings.quantizeVertices) {
					vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getTransformedVertexQuantizationMatrix());
				}
	
				buffer.positions.set(vertex, buffer.positionsIndex);
				buffer.positionsIndex += 3;
			}
			var floatNormal = vec3.create();
			var intNormal = new Int8Array(3);
			for (var i = 0; i < geometry.normals.length; i += 3) {

				if (loaderQuantizeNormals) {

					floatNormal[0] = geometry.normals[i] / 127;
					floatNormal[1] = geometry.normals[i + 1] / 127;
					floatNormal[2] = geometry.normals[i + 2] / 127;

				} else {

					floatNormal[0] = geometry.normals[i];
					floatNormal[1] = geometry.normals[i + 1];
					floatNormal[2] = geometry.normals[i + 2];
				}

				vec3.transformMat3(floatNormal, floatNormal, object.normalMatrix);
				vec3.normalize(floatNormal, floatNormal);
				// TODO this results in vectors with a negative magnitude... (at least on the unquantized data) We should probably do something with that information
				// Also the number becomes really small, resulting in all zeros when quantizing again, that can't be right				

				if (quantizeNormals) {

					intNormal[0] = floatNormal[0] * 127;
					intNormal[1] = floatNormal[1] * 127;
					intNormal[2] = floatNormal[2] * 127;

					buffer.normals.set(intNormal, buffer.normalsIndex);

				} else {
					buffer.normals.set(floatNormal, buffer.normalsIndex);
				}

				buffer.normalsIndex += 3;
			}
			if (geometry.colors != null) {
				if (geometry.colors instanceof Uint8Array == this.settings.quantizeColors) {
					// The same, just copy
					buffer.colors.set(geometry.colors, buffer.colorsIndex);
					buffer.colorsIndex += geometry.colors.length;
				} else {
					// Different, conversion required
					var color = new Array(4);
					for (var i=0; i<geometry.colors.length; i+=4) {
						color[0] = geometry.colors[i + 0];
						color[1] = geometry.colors[i + 1];
						color[2] = geometry.colors[i + 2];
						color[3] = geometry.colors[i + 3];
						if (this.settings.quantizeColors) {
							// Quantize
							color[0] = color[0] * 255;
							color[1] = color[1] * 255;
							color[2] = color[2] * 255;
							color[3] = color[3] * 255;
						} else {
							// Unquantize
							color[0] = color[0] / 255;
							color[1] = color[1] / 255;
							color[2] = color[2] / 255;
							color[3] = color[3] / 255;
						}
						
						buffer.colors.set(color, buffer.colorsIndex);
						buffer.colorsIndex += 4;
					}
				}
			}

			var pickColor = this.viewer.getPickColor(object.id);
			var lenObjectPickColors = (geometry.positions.length / 3) * 2;
			for (var j = buffer.pickColorsIndex, lenj = buffer.pickColorsIndex + lenObjectPickColors; j < lenj; j+=2) {
				buffer.pickColors[j + 0] = pickColor[0];
				buffer.pickColors[j + 1] = pickColor[1];
				buffer.pickColorsIndex += 2;
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
	
	storeMissingGeometry(geometryLoader, map) {
		var node = this.loaderToNode[geometryLoader.loaderId];
		for (var geometryDataId of map.keys()) {
			var geometryInfoIds = map.get(geometryDataId);
			for (var geometryInfoId of geometryInfoIds) {
				this.geometryCache.integrate(geometryDataId, {
					loader: this.getLoader(geometryLoader.loaderId),
					gpuBufferManager: node.gpuBufferManager,
					geometryInfoId: geometryInfoId,
					geometryLoader: geometryLoader
				});
			}
		}
		
		// We need to start loading some GeometryData at some point, and add the missing pieces
		if (!this.geometryCache.isEmpty()) {
			this.reuseLoader.load(this.geometryCache.pullToLoad());
		}
	}
	
	addGeometryToObject(geometryId, objectId, loader, gpuBufferManager) {
		var geometry = loader.geometries.get(geometryId);
		if (geometry == null) {
			if (this.geometryCache.has(geometryId)) {
				geometry = this.geometryCache.get(geometryId);
			} else {
				console.error("Missing geometry id");
				return;
			}
		}
		var object = loader.objects.get(objectId);
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
				this.addGeometryReusable(geometry, loader, gpuBufferManager);
			}
		}
	}
	
	addGeometryReusable(geometry, loader, gpuBufferManager) {
		var programInfo = this.viewer.programManager.getProgram({
			picking: false,
			instancing: true,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
		});

		var pickProgramInfo = this.viewer.programManager.getProgram({
			picking: true,
			instancing: true,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: false,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: false
		});

		const numInstances = geometry.objects.length;

		const positionBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferTransformer.convertVertices(geometry.croid, geometry.positions), this.gl.STATIC_DRAW, 0, 0);
		
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

		// Draw and pick instances matrices

		const instanceMatricesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceMatricesBuffer);
		var instanceMatrices = new Float32Array(numInstances * 16);
		geometry.objects.forEach((object, index) => {
			instanceMatrices.set(object.matrix, index * 16);
		});
		this.gl.bufferData(this.gl.ARRAY_BUFFER, instanceMatrices, this.gl.STATIC_DRAW, 0, 0);

		// Draw instance normal matrices

		const instanceNormalMatricesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceNormalMatricesBuffer);
		var instanceNormalMatrices = new Float32Array(numInstances * 9);
		geometry.objects.forEach((object, index) => {
			instanceNormalMatrices.set(object.normalMatrix, index * 9);
		});
		this.gl.bufferData(this.gl.ARRAY_BUFFER, instanceNormalMatrices, this.gl.STATIC_DRAW, 0, 0);

		// Pick instances pick colors

		const instancePickColorsBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancePickColorsBuffer);
		var instancePickColors = new Uint32Array(numInstances * 2);
		geometry.objects.forEach((object, index) => {
			instancePickColors.set(this.viewer.getPickColor(object.id), index * 2);
		});
		this.gl.bufferData(this.gl.ARRAY_BUFFER, instancePickColors, this.gl.STATIC_DRAW, 0, 0);

		//--------------------------------------------------------------------------------------------------------------
		// Create VAO for drawing
		//--------------------------------------------------------------------------------------------------------------

		var vao = this.gl.createVertexArray();
		this.gl.bindVertexArray(vao);

		{ // Positions
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

		{ // Normals
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

		// Vertex colors
		if (!this.settings.useObjectColors) {
			const numComponents = 4;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			if (this.settings.quantizeColors) {
				this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.UNSIGNED_BYTE, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.FLOAT, normalize, stride, offset);
			}
			this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
		}

		// Instance matrices for positions

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceMatricesBuffer);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + 0, 4, this.gl.FLOAT, false, 64, 0);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices + 1);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + 1, 4, this.gl.FLOAT, false, 64, 16);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices + 2);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + 2, 4, this.gl.FLOAT, false, 64, 32);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices + 3);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + 3, 4, this.gl.FLOAT, false, 64, 48);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + 0, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + 1, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + 2, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + 3, 1);

		// Instance matrices for normals

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceNormalMatricesBuffer);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceNormalMatrices);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceNormalMatrices + 0, 3, this.gl.FLOAT, false, 36, 0);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceNormalMatrices + 1);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceNormalMatrices + 1, 3, this.gl.FLOAT, false, 36, 12);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceNormalMatrices + 2);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instanceNormalMatrices + 2, 3, this.gl.FLOAT, false, 36, 24);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceNormalMatrices + 0, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceNormalMatrices + 1, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceNormalMatrices + 2, 1);

		// Indices
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);		  

		this.gl.bindVertexArray(null);

        //--------------------------------------------------------------------------------------------------------------
		// Create VAO for picking
		//--------------------------------------------------------------------------------------------------------------

		var vaoPick = this.gl.createVertexArray();

		this.gl.bindVertexArray(vaoPick);

		// Positions
		{
			const numComponents = 3;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			if (this.settings.quantizeVertices) {
				this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
			}
			this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.vertexPosition);
		}

		// Instance matrices for positions

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceMatricesBuffer);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices);
		this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + 0, 4, this.gl.FLOAT, false, 64, 0);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices + 1);
		this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + 1, 4, this.gl.FLOAT, false, 64, 16);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices + 2);
		this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + 2, 4, this.gl.FLOAT, false, 64, 32);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices + 3);
		this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + 3, 4, this.gl.FLOAT, false, 64, 48);
		this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + 0, 1);
		this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + 1, 1);
		this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + 2, 1);
		this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + 3, 1);

		// Instance pick colors

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancePickColorsBuffer);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instancePickColors);
		this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.instancePickColors, 2, this.gl.UNSIGNED_INT, false, 0, 0);
		this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instancePickColors, 1);

		// Indices
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

		this.gl.bindVertexArray(null);

		var buffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				indexBuffer: indexBuffer,
				nrIndices: geometry.indices.length,
				vao: vao,
				vaoPick: vaoPick,
//				matrices: geometry.matrices,
//				dirtyMatrices: false,
				nrProcessedMatrices: geometry.matrices.length,
//				geometry: geometry,
				instanceMatricesBuffer: instanceMatricesBuffer,
                instancePickColorsBuffer: instancePickColorsBuffer,
				roid: geometry.roid,
				croid: geometry.croid,
//				instances: matrices,
//				instanceMatrices: matrices,
				hasTransparency: geometry.hasTransparency,
				indexType: indices instanceof Uint16Array ? this.gl.UNSIGNED_SHORT : this.gl.UNSIGNED_INT,
				reuse: true
		};
		
		if (this.settings.useObjectColors) {
			buffer.colorBuffer = colorBuffer;
			buffer.color = [geometry.color.r, geometry.color.g, geometry.color.b, geometry.color.a];
			buffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
		}
		
		loader.geometries.delete(geometry.id);
		gpuBufferManager.pushBuffer(buffer);

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", (buffer.nrIndices / 3) * geometry.matrices.length);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}

		var toadd = geometry.bytes + geometry.matrices.length * 16 * 4;
		this.viewer.stats.inc("Drawing", "Draw calls per frame (L1)");
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
		return this.getLoader(loaderId).objects.get(identifier);
	}
	
	registerLoader(loaderId) {
		this.loaders.set(loaderId, {
			loaderId: loaderId,
			objects: new Map(),
			geometries: new Map()
		});
	}
	
	renderBuffers(transparency, reuse) {
		console.log("Not implemented in this layer");
	}
	
	render(transparency) {
		this.renderBuffers(transparency, false);
		this.renderBuffers(transparency, true);
	}
	
	renderFinalBuffers(buffers, programInfo) {
		if (buffers != null && buffers.length > 0) {
			var lastUsedColorHash = null;
			
			for (let buffer of buffers) {
				if (this.settings.useObjectColors) {
					if (lastUsedColorHash == null || lastUsedColorHash != buffer.colorHash) {
						this.gl.uniform4fv(programInfo.uniformLocations.vertexColor, buffer.color);
						lastUsedColorHash = buffer.colorHash;
					}
				}
				this.renderBuffer(buffer, programInfo);
			}
		}
	}
	
	renderBuffer(buffer, programInfo) {
		this.gl.bindVertexArray(buffer.vao);
		if (buffer.reuse) {
			// TODO we only need to bind this again for every new roid, maybe sort by buffer.roid before iterating through the buffers?
			if (this.viewer.settings.quantizeVertices) {
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(buffer.croid));
			}
			this.gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrIndices, buffer.indexType, 0, buffer.nrProcessedMatrices);
		} else {
			this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);
		}
		this.gl.bindVertexArray(null);
	}

	pickFinalBuffers(buffers, programInfo) {
		if (buffers != null && buffers.length > 0) {
			for (let buffer of buffers) {
				this.pickBuffer(buffer, programInfo);
			}
		}
	}

	pickBuffer(buffer, programInfo) {
		this.gl.bindVertexArray(buffer.vaoPick);
		if (buffer.reuse) {
			if (this.viewer.settings.quantizeVertices) {
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(buffer.croid));
			}
			this.gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrIndices, buffer.indexType, 0, buffer.nrProcessedMatrices);
		} else {
			this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);
		}
		this.gl.bindVertexArray(null);
	}

	pick(transparency) {
		this.pickBuffers(transparency, false);
		this.pickBuffers(transparency, true);
	}

	flushBuffer(buffer, gpuBufferManager) {
		if (buffer == null) {
			return;
		}
		if (buffer.nrIndices == 0) {
			return;
		}
		
		var programInfo = this.viewer.programManager.getProgram({
			picking: false,
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
		});

		var pickProgramInfo = this.viewer.programManager.getProgram({
			picking: true,
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: false,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: false
		});
		
		if (!this.settings.fakeLoading) {

			// Positions
			const positionBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.positions, this.gl.STATIC_DRAW, 0, buffer.positionsIndex);

			// Normals
			const normalBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.normals, this.gl.STATIC_DRAW, 0, buffer.normalsIndex);

			// Colors
			var colorBuffer;
			if (buffer.colors) {
				colorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.colors, this.gl.STATIC_DRAW, 0, buffer.colorsIndex);
			}

			// Per-object pick vertex colors
			var pickColorBuffer;
			if (buffer.pickColors) {
				pickColorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, pickColorBuffer);
				this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.pickColors, this.gl.STATIC_DRAW, 0, buffer.pickColorsIndex);
			}

			// Indices
			const indexBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, buffer.indices, this.gl.STATIC_DRAW, 0, buffer.indicesIndex);

			// Normal drawing VAO
			var vao = this.gl.createVertexArray();
			this.gl.bindVertexArray(vao);

			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
				if (this.settings.quantizeVertices) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
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
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				if (this.settings.quantizeColors) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.UNSIGNED_BYTE, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
			}

			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

			this.gl.bindVertexArray(null);

			// Picking VAO

			var vaoPick = this.gl.createVertexArray();
			this.gl.bindVertexArray(vaoPick);

			// Positions
			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
				if (this.settings.quantizeVertices) {
					this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.vertexPosition);
			}

			// Per-object pick vertex colors
			if (buffer.pickColors) {
				const numComponents = 2;
				const type = this.gl.UNSIGNED_INT;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, pickColorBuffer);
				this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.vertexPickColor, numComponents, type, normalize, stride, offset);
				this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.vertexPickColor);
			}

			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

			this.gl.bindVertexArray(null);

			var newBuffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				indexBuffer: indexBuffer,
				nrIndices: buffer.nrIndices,
				nrNormals: buffer.normalsIndex,
				nrPositions: buffer.positionsIndex,
				vao: vao,
				vaoPick: vaoPick,
				hasTransparency: buffer.hasTransparency,
				reuse: false
			};
			
			if (this.settings.useObjectColors) {
				newBuffer.color = [buffer.color.r, buffer.color.g, buffer.color.b, buffer.color.a];
				newBuffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
			} else {
				newBuffer.colorBuffer = colorBuffer;
				newBuffer.nrColors = buffer.colorsIndex;
			}

			if (buffer.pickColors) {
				newBuffer.pickColorBuffer = pickColorBuffer;
			}
			
			gpuBufferManager.pushBuffer(newBuffer);
			this.viewer.dirty = true;
		}
		
		var toadd = buffer.positionsIndex * (this.settings.quantizeVertices ? 2 : 4) + buffer.normalsIndex * (this.settings.quantizeNormals ? 1 : 4) + (buffer.colorsIndex != null ? buffer.colorsIndex * (this.settings.quantizeColors ? 1 : 4) : 0) + buffer.indicesIndex * 4;

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		this.viewer.stats.inc("Data", "GPU bytes", toadd);
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);
		this.viewer.stats.inc("Buffers", "Buffer groups");
	}
}