import BufferTransformer from './buffertransformer.js'
import Utils from './utils.js'
import GpuBufferManager from './gpubuffermanager.js'
import GeometryCache from './geometrycache.js'

const selectionOutlineMatrix = mat4.create();
const outlineColor = new Float32Array([1.0, 0.5, 0.0, 1.0]);
const false_true = [false, true];

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
		var bytesUsed = RenderLayer.calculateBytesUsed(this.settings, positions, colors, indices, normals);
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
				bytes: bytesUsed,
				matrices: [],
				objects: []
		};
		
		var loader = this.getLoader(loaderId);

		loader.geometries.set(geometryId, geometry);
		geometry.isReused = geometry.reused > 1 && this.geometryDataToReuse != null && this.geometryDataToReuse.has(geometry.id);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}

		return geometry;
	}
	
	static calculateBytesUsed(settings, positions, colors, indices, normals) {
		var bytes = 0;
		if (settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			if (settings.quantizeColors) {
				bytes += colors.length;
			} else {
				bytes += colors.length * 4;
			}
		}
		// Pick buffers
		bytes += (positions.length / 3) * 4;
		if (indices.length < 65536 && settings.useSmallIndicesIfPossible) {
			bytes += indices.length * 2;
		} else {
			bytes += indices.length * 4;
		}
		if (settings.quantizeNormals) {
			bytes += normals.length;
		} else {
			bytes += normals.length * 4;
		}
		return bytes;
	}

	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, gpuBufferManager) {
		var loader = this.getLoader(loaderId);
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

		loader.objects.set(oid , object);

		var viewObject = {
            type: type,
			aabb: aabb,
			objectId: objectId,
			oid: oid,
			center: null // TODO
		};
		this.viewer.addViewObject(objectId, viewObject);

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
			let originalColorIndex = buffer.colorsIndex;
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
			var lenObjectPickColors = (geometry.positions.length / 3);
			for (var i=0; i<lenObjectPickColors; i++) {
				buffer.pickColors.set(pickColor, buffer.pickColorsIndex);
				buffer.pickColorsIndex += 4;
			}

			{var li = (buffer.geometryIdToIndex.get(object.id) || []);
				li.push({
					'start': buffer.indicesIndex, 
					'length': geometry.indices.length,
					'color': originalColorIndex,
					'colorLength': geometry.colors.length
				});
				buffer.geometryIdToIndex.set(object.id, li);}
			
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
		buffer.bytes += geometry.bytes;
		
		if (buffer.needsToFlush) {
			this.flushBuffer(buffer);
		}
	}
	
	storeMissingGeometry(geometryLoader, map) {
		var node = this.loaderToNode[geometryLoader.loaderId];
		for (var geometryDataId of map.keys()) {
			var geometryInfoIds = map.get(geometryDataId);
			this.geometryCache.integrate2(geometryDataId, this.getLoader(geometryLoader.loaderId), node.gpuBufferManager, geometryInfoIds, geometryLoader);
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
				console.error("Missing geometry id", geometryId);
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

		const positionBuffer = this.createBuffer(this.bufferTransformer.convertVertices(geometry.croid, geometry.positions));
		const normalBuffer = this.createBuffer(this.bufferTransformer.convertNormals(geometry.normals));
		const colorBuffer = geometry.colors != null
			? this.createBuffer(geometry.colors, null, this.gl.ARRAY_BUFFER, 4)
			: null;
		const indexBuffer = this.createIndexBuffer(this.bufferTransformer.convertIndices(geometry.indices, geometry.positions.length));
		
		// Draw, pick instances and normal matrices, pick colors

		var instanceMatrices = new Float32Array(numInstances * 16);
		var instanceNormalMatrices = new Float32Array(numInstances * 9);
		var instancePickColors = new Uint8Array(numInstances * 4);
		
		geometry.objects.forEach((object, index) => {
			instanceMatrices.set(object.matrix, index * 16);
			instanceNormalMatrices.set(object.normalMatrix, index * 9);
			instancePickColors.set(this.viewer.getPickColor(object.id), index * 4);
		});
		
		const instanceMatricesBuffer = this.createBuffer(instanceMatrices, null, null, 16);
		const instanceNormalMatricesBuffer = this.createBuffer(instanceNormalMatrices, null, null, 9);
		const instancePickColorsBuffer = this.createBuffer(instancePickColors, null, null, 4);

		//--------------------------------------------------------------------------------------------------------------
		// Create VAO for drawing
		//--------------------------------------------------------------------------------------------------------------

		var vao = this.gl.createVertexArray();
		this.gl.bindVertexArray(vao);

		let locations = [
			[programInfo.attribLocations.vertexPosition, positionBuffer],
			[programInfo.attribLocations.vertexNormal, normalBuffer]
		];
		if (!this.settings.useObjectColors) {
			locations.push([programInfo.attribLocations.vertexColor, colorBuffer]);
		}
		this.bindLocationPairs(locations);

		// Instance matrices for positions

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceMatricesBuffer);
		for (let i = 0; i < 4; ++i) {
			this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceMatrices + i);
			this.gl.vertexAttribPointer(programInfo.attribLocations.instanceMatrices + i, 4, this.gl.FLOAT, false, 64, 16 * i);
			this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceMatrices + i, 1);
		}

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceNormalMatricesBuffer);
		for (let i = 0; i < 3; ++i) {
			this.gl.enableVertexAttribArray(programInfo.attribLocations.instanceNormalMatrices + i);
			this.gl.vertexAttribPointer(programInfo.attribLocations.instanceNormalMatrices + i, 3, this.gl.FLOAT, false, 36, 12 * i);
			this.gl.vertexAttribDivisor(programInfo.attribLocations.instanceNormalMatrices + i, 1);
		}

		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		this.gl.bindVertexArray(null);

        //--------------------------------------------------------------------------------------------------------------
		// Create VAO for picking
		//--------------------------------------------------------------------------------------------------------------

		var vaoPick = this.gl.createVertexArray();
		this.gl.bindVertexArray(vaoPick);

		locations = [[pickProgramInfo.attribLocations.vertexPosition, positionBuffer]];
		this.bindLocationPairs(locations);

		// Instance matrices for positions

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instanceMatricesBuffer);
		for (let i = 0; i < 4; ++i) {
			this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instanceMatrices + i);
			this.gl.vertexAttribPointer(pickProgramInfo.attribLocations.instanceMatrices + i, 4, this.gl.FLOAT, false, 64, 16 * i);
			this.gl.vertexAttribDivisor(pickProgramInfo.attribLocations.instanceMatrices + i, 1);
		}

		// Instance pick colors

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancePickColorsBuffer);
		this.gl.enableVertexAttribArray(pickProgramInfo.attribLocations.instancePickColors);
		this.gl.vertexAttribIPointer(pickProgramInfo.attribLocations.instancePickColors, 4, this.gl.UNSIGNED_BYTE, false, 0, 0);
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
				nrProcessedMatrices: geometry.matrices.length,
				instanceMatricesBuffer: instanceMatricesBuffer,
                instancePickColorsBuffer: instancePickColorsBuffer,
				roid: geometry.roid,
				croid: geometry.croid,
				hasTransparency: geometry.hasTransparency,
				indexType: indexBuffer.attrib_type,
				objects: geometry.objects,
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

		var toadd = 
			geometry.bytes + 
			geometry.matrices.length * 16 * 4 + // vertex matrices
			geometry.matrices.length * 9 * 4; // normal matrices
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
			// ObjectID -> Object
			objects: new Map(),
			geometries: new Map()
		});
	}
	
	renderBuffers(transparency, reuse) {
		console.log("Not implemented in this layer");
	}
	
	render(transparency, visibleElements) {
		this.renderBuffers(transparency, false, visibleElements);
		this.renderBuffers(transparency, true, visibleElements);
	}
	
	renderFinalBuffers(buffers, programInfo, visibleElements) {
		if (buffers != null && buffers.length > 0) {
			let picking = visibleElements.pass === 'pick';
			var lastUsedColorHash = null;
			
			for (let buffer of buffers) {
				if (!picking && this.settings.useObjectColors) {
					if (lastUsedColorHash == null || lastUsedColorHash != buffer.colorHash) {
						this.gl.uniform4fv(programInfo.uniformLocations.vertexColor, buffer.color);
						lastUsedColorHash = buffer.colorHash;
					}
				}
				this.renderBuffer(buffer, programInfo, visibleElements);
			}
		}
	}
	
	renderBuffer(buffer, programInfo, visibleElements) {
		let picking = visibleElements.pass === 'pick';
		this.gl.bindVertexArray(picking ? buffer.vaoPick : buffer.vao);
		if (buffer.reuse) {
			// TODO we only need to bind this again for every new roid, maybe sort by buffer.roid before iterating through the buffers?
			if (this.viewer.settings.quantizeVertices) {
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(buffer.croid));
			}
			this.gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrIndices, buffer.indexType, 0, buffer.nrProcessedMatrices);
		} else {
			if (buffer.computeVisibleRanges) {
				for (var range of buffer.computeVisibleRanges(visibleElements, this.gl)) {
					this.gl.drawElements(this.gl.TRIANGLES, range[1] - range[0], this.gl.UNSIGNED_INT, range[0] * 4);
				}
			} else {
				// This is a buffer for one specific element, probably created when
				// a call to setColor() changed the transparency state of an element.
				let include = true;
				if (visibleElements.with && !visibleElements.with.has(buffer.objectId)) {
					include = false;
				} else if (visibleElements.without && visibleElements.without.has(buffer.objectId)) {
					include = false;
				}
				if (include) {
					this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);
				}
			}
		}
		this.gl.bindVertexArray(null);
	}

	createBuffer(data, numElements, bufferType, components) {
		numElements = numElements || data.length;
		bufferType = bufferType || this.gl.ARRAY_BUFFER;
		components = components || 3;

		var b = this.gl.createBuffer();
		this.gl.bindBuffer(bufferType, b);
		this.gl.bufferData(bufferType, data, this.gl.STATIC_DRAW, 0, numElements);
		
		b.N = numElements;
		b.gl_type = bufferType;
		b.js_type = data.constructor.name;
		b.attrib_type = Utils.typedArrayToGlType(b.js_type);
		b.components = components;
		b.normalize = false;
		b.stride = 0;
		b.offset = 0;
		return b;
	}

	createIndexBuffer(data, n) {
		return this.createBuffer(data, n, this.gl.ELEMENT_ARRAY_BUFFER);
	}

	bindLocationPairs(locations) {
		for (let [location, buffer] of locations) {
			this.gl.bindBuffer(buffer.gl_type, buffer);
			let fn = buffer.attrib_type == this.gl.FLOAT
				? this.gl.vertexAttribPointer
				: this.gl.vertexAttribIPointer;
			fn.bind(this.gl)(location, buffer.components, buffer.attrib_type, buffer.normalize, buffer.stride, buffer.offset);
			this.gl.enableVertexAttribArray(location);
		}
	}
	
	flushBuffer(buffer, gpuBufferManager) {
		var newBuffer = null;

		if (buffer == null) {
			return newBuffer;
		}
		if (buffer.nrIndices == 0) {
			return newBuffer;
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
			const positionBuffer = this.createBuffer(buffer.positions, buffer.positionsIndex);
			const normalBuffer = this.createBuffer(buffer.normals, buffer.normalsIndex);
			var colorBuffer = buffer.colors
				? this.createBuffer(buffer.colors, buffer.colorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			// Per-object pick vertex colors
			var pickColorBuffer = buffer.pickColors
				? this.createBuffer(buffer.pickColors, buffer.pickColorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			const indexBuffer = this.createIndexBuffer(buffer.indices, buffer.indicesIndex);

			// Regular drawing VAO
			var vao = this.gl.createVertexArray();
			this.gl.bindVertexArray(vao);
			let locations = [
				[programInfo.attribLocations.vertexPosition, positionBuffer],
				[programInfo.attribLocations.vertexNormal, normalBuffer]
			];
			if (!this.settings.useObjectColors) {
				locations.push([programInfo.attribLocations.vertexColor, colorBuffer]);
			}
			this.bindLocationPairs(locations);
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			this.gl.bindVertexArray(null);

			// Picking VAO
			var vaoPick = this.gl.createVertexArray();
			this.gl.bindVertexArray(vaoPick);
			locations = [
				[pickProgramInfo.attribLocations.vertexPosition, positionBuffer],
			];
			if (buffer.pickColors) {
				locations.push([pickProgramInfo.attribLocations.vertexPickColor, pickColorBuffer]);
			}
			this.bindLocationPairs(locations);
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			this.gl.bindVertexArray(null);

			newBuffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				colorBuffer: colorBuffer,
				pickColorBuffer: pickColorBuffer,
				indexBuffer: indexBuffer,				
				nrIndices: buffer.nrIndices,
				nrNormals: buffer.normalsIndex,
				nrPositions: buffer.positionsIndex,
				vao: vao,
				vaoPick: vaoPick,
				hasTransparency: buffer.hasTransparency,
				reuse: false,
				// @todo: prevent duplication here
				computeVisibleRanges: buffer.computeVisibleRanges,
				geometryIdToIndex: buffer.geometryIdToIndex,
				visibleRanges: buffer.visibleRanges,
				lineIndexBuffers: buffer.lineIndexBuffers,
				setColor: buffer.setColor,
				copy: buffer.copy,
				owner: this,
				manager: gpuBufferManager
			};

			if (buffer.geometryIdToIndex) {
				for (var key of buffer.geometryIdToIndex.keys()) {
					var li = (this.viewer.geometryIdToBufferSet.get(key) || []);
					li.push(newBuffer);
					this.viewer.geometryIdToBufferSet.set(key, li);
				}
			}
			
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
		
		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		this.viewer.stats.inc("Data", "GPU bytes", buffer.bytes);
		this.viewer.stats.inc("Data", "GPU bytes total", buffer.bytes);
		this.viewer.stats.inc("Buffers", "Buffer groups");

		return newBuffer;
	}

	renderSelectionOutlines(ids, width, node) {
		let bufferManager = (node || this).gpuBufferManager;

		if (!bufferManager) {
			// probably a tile that has not been loaded yet
			return;
		}

		let viewer = bufferManager.viewer;

		for (let a of false_true) { 
			for (let b of false_true) {
				var buffers = (node || this).gpuBufferManager.getBuffers(a, b);
				for (let buffer of buffers) {
					for (var id of ids) {
						if (buffer.lineIndexBuffers) {
							let lines = buffer.lineIndexBuffers.get(id);
							if (lines) {
								lines.renderStart(viewer);
								lines.render(outlineColor, selectionOutlineMatrix, width || 0.005);
								lines.renderStop();
							}
						}
					}
				}
			}
		}
	}
}