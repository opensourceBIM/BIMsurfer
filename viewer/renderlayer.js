import {BufferTransformer} from './buffertransformer.js'
import {Utils} from './utils.js'
import {GeometryCache} from './geometrycache.js'
import {FrozenBufferSet} from './frozenbufferset.js';

const selectionOutlineMatrix = mat4.create();
const outlineColor = new Float32Array([1.0, 0.5, 0.0, 1.0]);
const false_true = [false, true];
const UINT32_MAX = (new Uint32Array((new Int32Array([-1])).buffer))[0];

/**
 * Abstract base class for managing and rendering buffers pertaining
 * to a render layer, ie. the base geometries always visible vs. the
 * dynamically visible tiles based on camera orientation.
 * 
 * @export
 * @class RenderLayer
 */
export class RenderLayer {
	
	constructor(viewer, geometryDataToReuse) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;
		this.geometryDataToReuse = geometryDataToReuse;
		this.geometryCache = new GeometryCache(this);
		this.instanceSelectionData = new Uint32Array(128);
		this.previousInstanceVisibilityState = null;

		this.loaders = new Map();
		this.bufferTransformer = new BufferTransformer(this.settings, viewer.vertexQuantization);
	}

	createGeometry(loaderId, roid, croid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		var bytesUsed = RenderLayer.calculateBytesUsed(this.settings, positions.length, colors.length, indices.length, normals.length);
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
	
	static calculateBytesUsed(settings, nrVertices, nrColors, nrIndices, nrNormals) {
		var bytes = 0;
		if (settings.quantizeVertices) {
			bytes += nrVertices * 2;
		} else {
			bytes += nrVertices * 4;
		}
		if (nrColors != null) {
			if (settings.quantizeColors) {
				bytes += nrColors;
			} else {
				bytes += nrColors * 4;
			}
		}
		// Pick buffers
		bytes += (nrVertices / 3) * 4;
		if (nrIndices < 65536 && settings.useSmallIndicesIfPossible) {
			bytes += nrIndices * 2;
		} else {
			bytes += nrIndices * 4;
		}
		if (settings.quantizeNormals) {
			bytes += nrNormals;
		} else {
			bytes += nrNormals * 4;
		}
		return bytes;
	}

	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, gpuBufferManager, node) {
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

		loader.objects.set(oid, object);

		var viewObject = {
            type: type,
			aabb: aabb,
			objectId: objectId,
			oid: oid,
			node: node
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
					start: buffer.indicesIndex, 
					length: geometry.indices.length,
					color: originalColorIndex,
					colorLength: geometry.colors.length
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
		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(true, false));
        var pickProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(true, true));

		const numInstances = geometry.objects.length;

		const positionBuffer = Utils.createBuffer(this.gl, this.bufferTransformer.convertVertices(geometry.croid, geometry.positions));
		const normalBuffer = Utils.createBuffer(this.gl, this.bufferTransformer.convertNormals(geometry.normals));
		const colorBuffer = geometry.colors != null
			? Utils.createBuffer(this.gl, geometry.colors, null, this.gl.ARRAY_BUFFER, 4)
			: null;
		const indexBuffer = Utils.createIndexBuffer(this.gl, this.bufferTransformer.convertIndices(geometry.indices, geometry.positions.length));
		
		let color, colorHash;

		if (this.settings.useObjectColors) {
			color = [geometry.color.r, geometry.color.g, geometry.color.b, geometry.color.a];
			colorHash = Utils.hash(JSON.stringify(buffer.color));
		}

		let buffer = new FrozenBufferSet(
			this.viewer,
			null,
			
			positionBuffer,
			normalBuffer,
			colorBuffer,
			null,
			indexBuffer,
			
			color,
			colorHash,
			
			geometry.indices.length,
			normalBuffer.N,
			positionBuffer.N,
			colorBuffer.N,
			
			null,
			null,

			geometry.hasTransparency,
			true,
			this,
			gpuBufferManager,

			geometry.roid,
			geometry.croid
		);

		buffer.numInstances = numInstances;
		buffer.nrTrianglesToDraw = (buffer.nrIndices / 3) * geometry.matrices.length;
		
		buffer.setObjects(this.gl, geometry.objects);
		buffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo);

		geometry.objects.forEach((obj) => {
			this.viewer.geometryIdToBufferSet.set(obj.id, [buffer]);
		});

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
	
	/*
	 * Prepare the rendering pass, this is called only once for each frame
	 */	
	prepareRender() {
		
	}
	
	render(transparency, visibleElements) {
		this.renderBuffers(transparency, false, visibleElements);
		if (this.settings.gpuReuse) {
			this.renderBuffers(transparency, true, visibleElements);
		}
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
				
				if (buffer.unquantizationMatrix != null) {
					this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, buffer.unquantizationMatrix);
				}
				
				this.renderBuffer(buffer, programInfo, visibleElements);
			}
		}
	}
	
	renderBuffer(buffer, programInfo, visibleElements) {
		const gl = this.gl;
		
		// console.log(programInfo.uniformLocations);

		let picking = visibleElements.pass === 'pick';
		gl.bindVertexArray(picking ? buffer.vaoPick : buffer.vao);
		if (buffer.reuse) {
			// TODO we only need to bind this again for every new roid, maybe sort by buffer.roid before iterating through the buffers?
			if (this.viewer.settings.quantizeVertices) {
				gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(buffer.croid));
			}

			let subset = buffer.computeVisibleInstances(visibleElements, this.gl);
			if (subset.somethingVisible) {
				if (subset.instanceIds.length > this.instanceSelectionData.length) {
					console.error("Too many instances of a geometry are activated.");
				} else {
					this.instanceSelectionData.fill(UINT32_MAX);
					this.instanceSelectionData.set(subset.instanceIds);

					const instanceVisibilityState = [visibleElements.pass, subset.hidden].concat(subset.instanceIds).join(",");

					if (instanceVisibilityState !== this.previousInstanceVisibilityState) {
						// console.log("selection", visibleElements.pass, subset.hidden ? "hide" : "show", ...this.instanceSelectionData.subarray(0, subset.instanceIds.length));
						gl.uniform1uiv(programInfo.uniformLocations.containedInstances, this.instanceSelectionData);
						gl.uniform1ui(programInfo.uniformLocations.numContainedInstances, subset.instanceIds.length);
						gl.uniform1ui(programInfo.uniformLocations.containedMeansHidden, subset.hidden ? 1 : 0);
						this.previousInstanceVisibilityState = instanceVisibilityState;
					}
					gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrTrianglesToDraw * 3, buffer.indexType, 0, buffer.nrProcessedMatrices);
				}
			}
		} else {
			if (buffer.objectId) {
				// This is a buffer for one specific element, probably created when
				// a call to setColor() changed the transparency state of an element.
				let include = true;
				if (visibleElements.with && !visibleElements.with.has(buffer.objectId)) {
					include = false;
				} else if (visibleElements.without && visibleElements.without.has(buffer.objectId)) {
					include = false;
				}
				if (include) {
					this.gl.drawElements(this.gl.TRIANGLES, buffer.nrTrianglesToDraw * 3, this.gl.UNSIGNED_INT, 0);
				}				
			} else {
				// These are the conventional buffersets
				for (var range of buffer.computeVisibleRanges(visibleElements, this.gl)) {
					this.gl.drawElements(this.gl.TRIANGLES, Math.min(range[1] - range[0], buffer.nrTrianglesToDraw * 3), this.gl.UNSIGNED_INT, range[0] * 4);
				}
			}
		}
		// Enabled, this kind of doubles the amount of GPU calls during rendering, but disabled resulted in errors, somehow some old buffers keep being used if we don't do this
		this.gl.bindVertexArray(null);
	}	

	/**
	 * Add a buffer that is already prepared
	 */
	addCompleteBuffer(buffer, gpuBufferManager) {
		var newBuffer = null;

		if (buffer == null) {
			return newBuffer;
		}
		if (buffer.nrIndices == 0) {
			return newBuffer;
		}
		
		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, false));
        var pickProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, true));

		if (!this.settings.fakeLoading) {
			const positionBuffer = buffer.vertices;
			const normalBuffer = buffer.normals;
			const pickColorBuffer = buffer.pickColors;
			const indexBuffer = buffer.indices;
			const colorBuffer = buffer.colors;

			newBuffer = new FrozenBufferSet(
				this.viewer,
				buffer,
				
				positionBuffer,
				normalBuffer,
				colorBuffer,
				pickColorBuffer,
				indexBuffer,
				
				null,
				0,
				
				buffer.nrIndices,
				buffer.normalsIndex,
				buffer.positionsIndex,
				buffer.colorsIndex,
				
				null,
				null,

				buffer.hasTransparency,
				false,
				this,
				gpuBufferManager
			);
			
			newBuffer.nrTrianglesToDraw = buffer.nrIndices / 3;
			
			newBuffer.unquantizationMatrix = buffer.unquantizationMatrix;

			newBuffer.geometryIdToIndex = buffer.geometryIdToMeta;
			
			newBuffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo);
			
			if (buffer.geometryIdToIndex) {
				for (var key of buffer.geometryIdToIndex.keys()) {
					var li = (this.viewer.geometryIdToBufferSet.get(key) || []);
					li.push(newBuffer);
					this.viewer.geometryIdToBufferSet.set(key, li);
				}
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

		this.viewer.stats.inc("Models", "Geometries", buffer.nrObjects);

		return newBuffer;
	}
	
	flushBuffer(buffer, gpuBufferManager) {
		var newBuffer = null;
		if (buffer == null) {
			return newBuffer;
		}
		if (buffer.nrIndices == 0) {
			return newBuffer;
		}
		
		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, false));
		var pickProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, true));

		if (!this.settings.fakeLoading) {
			const positionBuffer = Utils.createBuffer(this.gl, buffer.positions, buffer.positionsIndex);
			const normalBuffer = Utils.createBuffer(this.gl, buffer.normals, buffer.normalsIndex);
			var colorBuffer = buffer.colors
				? Utils.createBuffer(this.gl, buffer.colors, buffer.colorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			// Per-object pick vertex colors
			var pickColorBuffer = buffer.pickColors
				? Utils.createBuffer(this.gl, buffer.pickColors, buffer.pickColorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			const indexBuffer = Utils.createIndexBuffer(this.gl, buffer.indices, buffer.indicesIndex);

			let color, colorHash;

			if (this.settings.useObjectColors) {
				color = [buffer.color.r, buffer.color.g, buffer.color.b, buffer.color.a];
				colorHash = Utils.hash(JSON.stringify(buffer.color));
			}

			newBuffer = new FrozenBufferSet(
				this.viewer,
				buffer,

				positionBuffer,
				normalBuffer,
				colorBuffer,
				pickColorBuffer,
				indexBuffer,
				
				color,
				colorHash,
				
				buffer.nrIndices,
				buffer.normalsIndex,
				buffer.positionsIndex,
				buffer.colorsIndex,
				
				null,
				null,

				buffer.hasTransparency,
				false,
				this,
				gpuBufferManager
			);
			
			newBuffer.nrTrianglesToDraw = buffer.nrIndices / 3;
			
			newBuffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo);

			if (buffer.geometryIdToIndex) {
				for (var key of buffer.geometryIdToIndex.keys()) {
					var li = (this.viewer.geometryIdToBufferSet.get(key) || []);
					li.push(newBuffer);
					this.viewer.geometryIdToBufferSet.set(key, li);
				}
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

		for (let transparency of false_true) { 
			for (let reuse of false_true) {
				var buffers = (node || this).gpuBufferManager.getBuffers(transparency, reuse);
				for (let buffer of buffers) {
					for (var id of ids) {
						if (buffer.lineIndexBuffers) {
							let lines = buffer.lineIndexBuffers.get(id);
							if (lines) {
								// TODO Ruben: renderStart is doing a lot of redundant stuff
								lines.renderStart(viewer);
								lines.render(outlineColor, lines.matrixMap.get(id) || selectionOutlineMatrix, width || 0.005);
								lines.renderStop();
							}
						}
					}
				}
			}
		}
	}
}