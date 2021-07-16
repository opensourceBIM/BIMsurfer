import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {BufferTransformer} from "./buffertransformer.js";
import {Utils} from "./utils.js";
import {GeometryCache} from "./geometrycache.js";
import {FrozenBufferSet} from "./frozenbufferset.js";

import {AvlTree} from "./collections/avltree.js";

const outlineColor = new Float32Array([1.0, 0.5, 0.0, 1.0]);
const false_true = [false, true];
const UINT32_MAX = (new Uint32Array((new Int32Array([-1])).buffer))[0];

// Cache the extension availability
let WEBGL_multi_draw = null;

/**
 * Abstract base class for managing and rendering buffers pertaining
 * to a render layer, ie. the base geometries always visible vs. the
 * dynamically visible tiles based on camera orientation.
 * 
 * @class RenderLayer
 */
export class RenderLayer {
	
	constructor(viewer, geometryDataToReuse) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;
		WEBGL_multi_draw = this.gl.getExtension("WEBGL_multi_draw");
		this.geometryDataToReuse = geometryDataToReuse;
		this.geometryCache = new GeometryCache(this);
		this.instanceSelectionData = new Uint32Array(256);
		this.previousInstanceVisibilityState = null;

		this.selectionOutlineMatrix = mat4.create();
		
		this.lines = null;
		this.loaders = new Map();
		this.bufferTransformer = new BufferTransformer(this.settings, viewer.vertexQuantization);
		
		this.nrPrimitivesLoaded = 0;
		this.nrTrianglesLoaded = 0;
		this.nrLinesLoaded = 0;
		
		this.postProcessingTranslation = vec3.fromValues(0, 0, 0);
	}

	createGeometry(loaderId, roid, uniqueModelId, geometryId, positions, normals, colors, color, indices, lineIndices, hasTransparency, hasTwoSidedTriangles, reused) {
		var bytesUsed = Utils.calculateBytesUsed(this.settings, positions.length, colors.length, indices.length, lineIndices ? lineIndices.length : 0, normals.length);
		var geometry = {
				id: geometryId,
				roid: roid,
				uniqueModelId: uniqueModelId,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				lineIndices: lineIndices,
				hasTransparency: hasTransparency,
				hasTwoSidedTriangles: hasTwoSidedTriangles,
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
	
	createObject(loaderId, roid, uniqueId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, gpuBufferManager, node, quantFromAabb) {
		var loader = this.getLoader(loaderId);
		var object = {
			uniqueId: uniqueId,
			hasTransparency: hasTransparency,
			matrix: matrix,
            normalMatrix: normalMatrix,
			scaleMatrix: scaleMatrix,
			geometry: [],
			min: vec3.fromValues(aabb[0], aabb[1], aabb[2]),
			max: vec3.fromValues(aabb[3], aabb[4], aabb[5]),
			roid: roid,
//				object: this.viewer.model.objects[oid],
			add: (geometryId, uniqueId) => {
				this.addGeometryToObject(geometryId, uniqueId, loader, gpuBufferManager);
			}
		};

		loader.objects.set(uniqueId, object);

		var globalizedAabb = Utils.transformBounds(aabb, this.viewer.globalTranslationVector);
		
		var viewObject = {
			renderLayer: this,
            type: type,
			aabb: aabb,
			globalizedAabb: globalizedAabb,
			uniqueId: uniqueId
		};
		
		if (node) {
			viewObject.node = node;
		}
		
		this.viewer.addViewObject(uniqueId, viewObject);

		geometryIds.forEach((id) => {
			this.addGeometryToObject(id, object.uniqueId, loader, gpuBufferManager, quantFromAabb);
		});

		this.viewer.stats.inc("Models", "Objects");

		return object;
	}

	addGeometry(loaderId, geometry, object, buffer, sizes, quantFromAabb) {
		var loaderQuantizeNormals = this.settings.loaderSettings.quantizeNormals;
		var quantizeNormals = this.settings.quantizeNormals;

		var startIndex = buffer.positionsIndex / 3;

		let QM = this.viewer.vertexQuantization.vertexQuantizationMatrix;
		let IQM = this.viewer.vertexQuantization.inverseVertexQuantizationMatrixWithGlobalTranslation;

		if (quantFromAabb) {
			// @todo not really from AABB (because we want to limit the amount of quantization matrices),
			// but maybe come up with something more robust than this.
			let QM2 = mat4.create();
			QM2[ 0] = 0.01;
			QM2[ 5] = 0.01;
			QM2[10] = 0.01;
			QM2[12] = 0.01 * QM[12] / QM[0];
			QM2[13] = 0.01 * QM[13] / QM[5];
			QM2[14] = 0.01 * QM[14] / QM[10];
			QM2[15] = 1.0;
			QM = QM2;

			IQM = mat4.identity(mat4.create());
			IQM[0] *= 100.;
			IQM[5] *= 100.;
			IQM[10] *= 100.;
		}

		buffer.unquantizationMatrix = IQM;

		try {
			var vertex = vec3.create();
			let outOfBounds = new Set();
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
					vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForUniqueModelId(geometry.uniqueModelId));
				}
				vec3.transformMat4(vertex, vertex, object.matrix);				
				vec3.scale(vertex, vertex, 1000);

				if (this.settings.quantizeVertices) {
					vec3.transformMat4(vertex, vertex, QM);
					// Detect vertices going out of bounds of the quantization window.
					if (Math.abs(vertex[0]) > 16000 || Math.abs(vertex[1]) > 16000 || Math.abs(vertex[1]) > 16000) {
						outOfBounds.add(i / 3);
					}
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
			var pickColor = this.viewer.getPickColor(object.uniqueId);
			var lenObjectPickColors = (geometry.positions.length / 3);
			for (var i=0; i<lenObjectPickColors; i++) {
				buffer.pickColors.set(pickColor, buffer.pickColorsIndex);
				buffer.pickColorsIndex += 4;
			}

			var li = (buffer.uniqueIdToIndex.get(object.uniqueId) || []);
			var idx = {
				start: buffer.indicesIndex, 
				length: geometry.indices.length,
				lineIndexStart: buffer.lineIndicesIndex,
				lineIndexLength: geometry.lineIndices ? geometry.lineIndices.length : 0,
				color: originalColorIndex,
				colorLength: geometry.colors.length
			};
			li.push(idx);
			buffer.uniqueIdToIndex.set(object.uniqueId, li);
			buffer.uniqueIdSet.add(object.uniqueId);
			
			var index = Array(3);
			for (var i=0; i<geometry.indices.length; i+=3) {
				let anyOutOfBounds = false;
				for (let j = 0; j < 3; ++j) {
					if (outOfBounds.has(geometry.indices[i + j])) {
						anyOutOfBounds = true;
						break;
					}
				}
				if (anyOutOfBounds) {
					buffer.indices.set([0,0,0], buffer.indicesIndex);
					buffer.indicesIndex += 3;
					continue;
				}				

				index[0] = geometry.indices[i + 0] + startIndex;
				index[1] = geometry.indices[i + 1] + startIndex;
				index[2] = geometry.indices[i + 2] + startIndex;

				for (var j=0; j<3; j++) {
					if (idx.minIndex == null || index[j] < idx.minIndex) {
						idx.minIndex = index[j];
					}
					if (idx.maxIndex == null || index[j] > idx.maxIndex) {
						idx.maxIndex = index[j];
					}
				}
				
				buffer.indices.set(index, buffer.indicesIndex);
				buffer.indicesIndex += 3;
			}
			for (var i=0; i<(geometry.lineIndices ? geometry.lineIndices.length : 0); i+=3) {
				index[0] = geometry.lineIndices[i + 0] + startIndex;
				index[1] = geometry.lineIndices[i + 1] + startIndex;
				index[2] = geometry.lineIndices[i + 2] + startIndex;
				
				for (var j=0; j<3; j++) {
					if (idx.minLineIndex == null || index[j] < idx.minLineIndex) {
						idx.minLineIndex = index[j];
					}
					if (idx.maxLineIndex == null || index[j] > idx.maxLineIndex) {
						idx.maxLineIndex = index[j];
					}
				}
				try {
					buffer.lineIndices.set(index, buffer.lineIndicesIndex);
					buffer.lineIndicesIndex += 3;
				} catch (e) {
					debugger;
				}
			}
		} catch (e) {
			debugger;
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
		// TODO this is only applicable for the TilingRenderLayer, in other layers it's usually an indication of an error
		if (this.loaderToNode != null) {
			var node = this.loaderToNode[geometryLoader.loaderId];
			for (var geometryDataId of map.keys()) {
				var geometryInfoIds = map.get(geometryDataId);
				this.geometryCache.integrate2(geometryDataId, this.getLoader(geometryLoader.loaderId), node.gpuBufferManager, geometryInfoIds, geometryLoader);
			}
			
			// We need to start loading some GeometryData at some point, and add the missing pieces
			if (!this.geometryCache.isEmpty()) {
				this.reuseLoader.load(this.geometryCache.pullToLoad());
			}
		} else {
			console.log("Missing", map);
		}
	}
	
	addGeometryToObject(geometryId, uniqueId, loader, gpuBufferManager, quantFromAabb) {
		var geometry = loader.geometries.get(geometryId);
		if (geometry == null) {
			if (this.geometryCache.has(geometryId)) {
				geometry = this.geometryCache.get(geometryId);
			} else {
				console.error("Missing geometry id", geometryId);
				return;
			}
		}
		var object = loader.objects.get(uniqueId);
		this.addGeometry(loader.loaderId, geometry, object, quantFromAabb);
		object.geometry.push(geometryId);
		if (geometry.isReused) {
			geometry.reuseMaterialized++;
			if (geometry.reuseMaterialized == geometry.reused) {
				this.addGeometryReusable(geometry, loader, gpuBufferManager);
				loader.geometries.delete(geometry.id);
			} else if (geometry.reuseMaterialized % 256 == 0) {
				// TODO this 256 is now equal to the number in the vertex shader, at some point this should become dynamic, based on hardware capabilities
				console.log("Flushing 256");
				this.addGeometryReusable(geometry, loader, gpuBufferManager);
				geometry.objects = [];
				geometry.matrices = [];
			}
		}
	}
	
	addGeometryReusable(geometry, loader, gpuBufferManager) {
		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(true, false));
		var lineProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(true, false, true));
        var pickProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(true, true));

		const numInstances = geometry.objects.length;

		const positionBuffer = Utils.createBuffer(this.gl, this.bufferTransformer.convertVertices(geometry.uniqueModelId, geometry.positions));
		const normalBuffer = Utils.createBuffer(this.gl, this.bufferTransformer.convertNormals(geometry.normals), null, this.gl.ARRAY_BUFFER, this.settings.loaderSettings.octEncodeNormals ? 2 : 3);
		const colorBuffer = geometry.colors != null
			? Utils.createBuffer(this.gl, geometry.colors, null, this.gl.ARRAY_BUFFER, 4)
			: null;
		const indexBuffer = Utils.createIndexBuffer(this.gl, this.bufferTransformer.convertIndices(geometry.indices, geometry.positions.length));
		const lineIndexBuffer = geometry.lineIndices ? Utils.createLineIndexBuffer(this.gl, this.bufferTransformer.convertIndices(geometry.lineIndices, geometry.positions.length)) : null;
		
		let color, colorHash;

		if (this.settings.useObjectColors) {
			color = [geometry.color.r, geometry.color.g, geometry.color.b, geometry.color.a];
			colorHash = Utils.hash(JSON.stringify(geometry.color));
		}

		let buffer = new FrozenBufferSet(
			this.viewer,
			null,
			
			positionBuffer,
			normalBuffer,
			colorBuffer,
			null,
			indexBuffer,
			lineIndexBuffer,
			
			color,
			colorHash,
			
			geometry.indices.length,
			geometry.lineIndices ? geometry.lineIndices.length : 0,
			normalBuffer.N,
			positionBuffer.N,
			colorBuffer.N,
			
			null,
			null,
			null,

			geometry.hasTransparency,
			geometry.hasTwoSidedTriangles,
			true,
			this,
			gpuBufferManager,

			geometry.roid,
			geometry.uniqueModelId
		);

		buffer.numInstances = numInstances;
		buffer.nrTrianglesToDraw = (buffer.nrIndices / 3) * geometry.matrices.length;
		buffer.nrLinesToDraw = (buffer.nrLineIndices / 2) * geometry.matrices.length;
		
		buffer.setObjects(this.gl, geometry.objects);
		buffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo, lineProgramInfo);

		buffer.uniqueIdToIndex = new AvlTree(this.viewer.inverseUniqueIdCompareFunction);
		
		geometry.objects.forEach((obj) => {
			buffer.uniqueIdSet.add(obj.uniqueId);
			this.viewer.uniqueIdToBufferSet.set(obj.uniqueId, [buffer]);
		});

		gpuBufferManager.pushBuffer(buffer);

		this.nrTrianglesLoaded += buffer.nrTrianglesToDraw;
		this.nrLinesLoaded += buffer.nrLinesToDraw;
		this.nrPrimitivesLoaded += buffer.nrTrianglesToDraw + buffer.nrLinesToDraw;
		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrTrianglesToDraw + buffer.nrLinesToDraw);
		if (this.progressListener != null) {
			this.progressListener(this.nrTrianglesLoaded, this.nrLinesLoaded);
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
			objects: new Map(),
			geometries: new Map()
		});
	}
	
	renderBuffers(transparency, twoSidedTriangles, reuse, lineRender, visibleElements) {
		console.log("Not implemented in this layer");
	}
	
	/*
	 * Prepare the rendering pass, this is called only once for each frame
	 */	
	prepareRender() {
		// this.lastUniqueModelIdRendered is used to keep track of which uniqueModelId was rendered previously, so we can skip some GPU calls, need to reset it though for each new frame
		this.lastUniqueModelIdRendered = null;
	}
	
	render(transparency, lineRender, twoSidedTriangles, visibleElements) {
		this.renderBuffers(transparency, twoSidedTriangles, false, lineRender, visibleElements);
		if (this.settings.gpuReuse) {
			this.renderBuffers(transparency, twoSidedTriangles, true, lineRender, visibleElements);
		}
	}
	
	renderFinalBuffers(buffers, programInfo, visibleElements, lines) {
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

				if (buffer.unquantizationMatrix != null && programInfo.lastUnquantizationMatrixUsed != buffer.unquantizationMatrix) {
					this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, buffer.unquantizationMatrix);
					programInfo.lastUnquantizationMatrixUsed = buffer.unquantizationMatrix;
				}

				this.renderBuffer(buffer, programInfo, visibleElements, lines);
			}
		}
	}
	
	renderBuffer(buffer, programInfo, visibleElements, lines) {
		const gl = this.gl;
		
		// console.log(programInfo.uniformLocations);

		let picking = visibleElements.pass === 'pick';
		gl.bindVertexArray(picking ? buffer.vaoPick : (lines ? buffer.lineRenderVao : buffer.vao));
		if (buffer.reuse) {
			if (this.viewer.settings.quantizeVertices) {
				if (buffer.uniqueModelId) {
					if (this.lastUniqueModelIdRendered === buffer.uniqueModelId && false) {
						// Skip it, this needs clarification, disabling for now because that seems to fix picking for instanced rendering
					} else {
						let uqm = this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForUniqueModelId(buffer.uniqueModelId);
						gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, uqm);
						this.lastUniqueModelIdRendered = buffer.uniqueModelId;
					}
				} else {
					console.log("No uniqueModelId");
				}
			}
			
			let subset = buffer.computeVisibleInstances(visibleElements, this.gl);
			if (subset.somethingVisible) {
				if (subset.instanceIds.length > this.instanceSelectionData.length) {
					console.error("Too many instances of a geometry are activated.");
				} else {
					// A bit unreadable, but much faster than concat + join
					const instanceVisibilityState = 
						(visibleElements.pass != null ? (visibleElements.pass + ",") : "") +
						(subset.hidden != null ? (subset.hidden + ",") : "") + 
						subset.instanceIds.join(",");

					// Disabled caching for now because it's does seem to hide all line renders
//					if (instanceVisibilityState !== this.previousInstanceVisibilityState) {
						this.instanceSelectionData.fill(UINT32_MAX);
						this.instanceSelectionData.set(subset.instanceIds);

						// TODO Maybe we can store this in a buffer instead of send it as a uniform?
						
						// console.log("selection", visibleElements.pass, subset.hidden ? "hide" : "show", ...this.instanceSelectionData.subarray(0, subset.instanceIds.length));
						gl.uniform1uiv(programInfo.uniformLocations.containedInstances, this.instanceSelectionData);
						gl.uniform1ui(programInfo.uniformLocations.numContainedInstances, subset.instanceIds.length);
						gl.uniform1ui(programInfo.uniformLocations.containedMeansHidden, subset.hidden ? 1 : 0);
						
						// Ruben: Is this really ok? Do we need to clear it? Can this really be stored in the renderlayer?
						this.previousInstanceVisibilityState = instanceVisibilityState;
//					}
					if (lines) {
						if (buffer.lineIndexBuffer) {
							gl.drawElementsInstanced(this.gl.LINES, buffer.lineIndexBuffer.N, buffer.indexType, 0, buffer.nrProcessedMatrices);
						}
					} else {
						gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.indexBuffer.N, buffer.indexType, 0, buffer.nrProcessedMatrices);
					}
				}
			}
		} else {
			if (buffer.uniqueId) {
				// This is a buffer for one specific element, probably created when
				// a call to setColor() changed the transparency state of an element.
				let include = true;
				if (visibleElements.with && !visibleElements.with.has(buffer.uniqueId)) {
					include = false;
				} else if (visibleElements.without && visibleElements.without.has(buffer.uniqueId)) {
					include = false;
				}
				if (include) {
					if (lines) {
						this.gl.drawElements(this.gl.LINES, buffer.nrLinesToDraw * 2, this.gl.UNSIGNED_INT, 0);
					} else {
						this.gl.drawElements(this.gl.TRIANGLES, buffer.nrTrianglesToDraw * 3, this.gl.UNSIGNED_INT, 0);
					}
				}
			} else {
				const visibleRanges = buffer.computeVisibleRangesAsBuffers(visibleElements, this.gl);
				if (visibleRanges && visibleRanges.pos > 0) {
					// TODO add buffer.nrTrianglesToDraw code
					
					if (WEBGL_multi_draw) {
						// This is available on Chrome Canary 75
						if (lines) {
							WEBGL_multi_draw.multiDrawElementsWEBGL(this.gl.LINES, visibleRanges.lineRenderCounts, 0, this.gl.UNSIGNED_INT, visibleRanges.lineRenderOffsetsBytes, 0, visibleRanges.pos);
						} else {
							WEBGL_multi_draw.multiDrawElementsWEBGL(this.gl.TRIANGLES, visibleRanges.counts, 0, this.gl.UNSIGNED_INT, visibleRanges.offsetsBytes, 0, visibleRanges.pos);
						}
					} else {
						// A manual loop using the same range data
						if (lines) {
							for (let i = 0; i < visibleRanges.pos; ++i) {
								this.gl.drawElements(this.gl.LINES, visibleRanges.lineRenderCounts[i], this.gl.UNSIGNED_INT, visibleRanges.lineRenderOffsetsBytes[i]);
							}
						} else {
							for (let i = 0; i < visibleRanges.pos; ++i) {
								this.gl.drawElements(this.gl.TRIANGLES, visibleRanges.counts[i], this.gl.UNSIGNED_INT, visibleRanges.offsetsBytes[i]);
							}
						}
					}
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
		var lineProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, false, true));

		if (!this.settings.fakeLoading) {
			newBuffer = new FrozenBufferSet(
				this.viewer,
				buffer,
				
				buffer.vertices,
				buffer.normals,
				buffer.colors,
				buffer.pickColors,
				buffer.indices,
				buffer.lineIndices,
				
				null,
				0,
				
				buffer.nrIndices,
				buffer.nrLineIndices,
				buffer.normalsIndex,
				buffer.positionsIndex,
				buffer.colorsIndex,
				
				null,
				null,
				null,

				buffer.hasTransparency,
				buffer.hasTwoSidedTriangles,
				false,
				this,
				gpuBufferManager
			);
			
			newBuffer.nrTrianglesToDraw = buffer.nrIndices / 3;
			newBuffer.nrLinesToDraw = buffer.nrLineIndices / 2;
			newBuffer.hasTwoSidedTriangles = buffer.hasTwoSidedTriangles;
			
			newBuffer.unquantizationMatrix = buffer.unquantizationMatrix;

			newBuffer.uniqueIdToIndex = buffer.uniqueIdToIndex;
			if (buffer.uniqueIdSet == null) {
				debugger;
			}
			newBuffer.uniqueIdSet = buffer.uniqueIdSet;
			
			newBuffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo, lineProgramInfo);
					
			gpuBufferManager.pushBuffer(newBuffer);
		}
		
//		this.incLoadedTriangles(buffer.indicesRead / 3);
		this.viewer.stats.inc("Data", "GPU bytes", buffer.bytes);
		this.viewer.stats.inc("Data", "GPU bytes total", buffer.bytes);

		this.viewer.stats.inc("Models", "Geometries", buffer.nrObjects);

		return newBuffer;
	}
	
	incLoadedPrimitives(triangles, lines) {
		this.nrTrianglesLoaded += triangles;
		this.nrLinesLoaded += lines;
		this.nrPrimitivesLoaded += triangles + lines;

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", triangles + lines);
		if (this.progressListener != null) {
			this.progressListener(this.nrTrianglesLoaded, this.nrLinesLoaded);
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
		
		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, false));
		var pickProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, true));
		var lineProgramInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(false, false, true));

		if (!this.settings.fakeLoading) {
			const positionBuffer = Utils.createBuffer(this.gl, buffer.positions, buffer.positionsIndex);
			const normalBuffer = Utils.createBuffer(this.gl, buffer.normals, buffer.normalsIndex, this.gl.ARRAY_BUFFER, this.settings.loaderSettings.octEncodeNormals ? 2 : 3);
			var colorBuffer = buffer.colors
				? Utils.createBuffer(this.gl, buffer.colors, buffer.colorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			// Per-object pick vertex colors
			var pickColorBuffer = buffer.pickColors
				? Utils.createBuffer(this.gl, buffer.pickColors, buffer.pickColorsIndex, this.gl.ARRAY_BUFFER, 4)
				: null;
			const indexBuffer = Utils.createIndexBuffer(this.gl, buffer.indices, buffer.indicesIndex);
			if (buffer.lineIndices == null) {
				debugger;
			}
			const lineIndexBuffer = buffer.lineIndices ? Utils.createLineIndexBuffer(this.gl, buffer.lineIndices, buffer.lineIndicesIndex) : null;
			
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
				lineIndexBuffer,
				
				color,
				colorHash,
				
				buffer.nrIndices,
				buffer.nrLineIndices,
				buffer.normalsIndex,
				buffer.positionsIndex,
				buffer.colorsIndex,
				
				null,
				null,
				null,

				buffer.hasTransparency,
				buffer.hasTwoSidedTriangles,
				false,
				this,
				gpuBufferManager
			);
			
			newBuffer.unquantizationMatrix = buffer.unquantizationMatrix;
			newBuffer.nrTrianglesToDraw = buffer.nrIndices / 3;
			newBuffer.nrLinesToDraw = buffer.nrLineIndices / 2;
			
			newBuffer.buildVao(this.gl, this.settings, programInfo, pickProgramInfo, lineProgramInfo);

			if (buffer.uniqueIdToIndex) {
				for (var key of buffer.uniqueIdToIndex.keys()) {
					var li = (this.viewer.uniqueIdToBufferSet.get(key) || []);
					li.push(newBuffer);
					this.viewer.uniqueIdToBufferSet.set(key, li);
				}
			}			
			
			gpuBufferManager.pushBuffer(newBuffer);
			this.viewer.dirty = 2;
		}
		
		if (!buffer.isCopy) {
			this.nrTrianglesLoaded += buffer.nrIndices / 3;
			this.nrLinesLoaded += buffer.lineIndices / 3;
			this.nrPrimitivesLoaded += buffer.nrIndices / 3 + buffer.lineIndices / 3;
			this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3 + buffer.lineIndices / 3);
			if (this.progressListener != null) {
				this.progressListener(this.nrTrianglesLoaded, this.nrLinesLoaded);
			}
			this.viewer.stats.inc("Data", "GPU bytes", buffer.bytes);
			this.viewer.stats.inc("Data", "GPU bytes total", buffer.bytes);
			this.viewer.stats.inc("Buffers", "Buffer groups");
		}

		return newBuffer;
	}

	renderLines() {
		if (this.lines) {
			let bufferManager = this.gpuBufferManager;
			let viewer = bufferManager.viewer;
			this.lines.renderStart(viewer, this);
			this.lines.render(this.lineColour || outlineColor, this.selectionOutlineMatrix, this.lineWidth || 0.01);
			this.lines.renderStop();
		}
	}

	renderSelectionOutlines(ids, width, node) {
		let bufferManager = (node || this).gpuBufferManager;

		if (!bufferManager) {
			// probably a tile that has not been loaded yet
			return;
		}

		let viewer = bufferManager.viewer;

		var gl = this.gl;

		for (let transparency of false_true) {
			// TODO check for reuse setting
			for (let reuse of false_true) {
				for (let twoSidedTriangles of false_true) {
					var buffers = (node || this).gpuBufferManager.getBuffers(transparency, twoSidedTriangles, reuse);
					var lastLineRenderer = null;
					for (let buffer of buffers) {
						// TODO iterate over union of buffer.uniqueIds and ids
						for (var id of ids) {
							if (buffer.has(id)) {
								if (buffer.lineIndexBuffers) {
									let lines = buffer.getLines(id, this.gl);
									if (lines) {
										if (!lastLineRenderer) {
											// Kind of a dirty hack to only do the initialization once, we know the init result is the same for all buffers in this set, this improves the render speed when a lot of objects are selected
											lines.renderStart(viewer, this);
										}
										// TODO move outlineColor to renderStart, saves us another uniform, same probably for width
										// TODO selectionOutlineMatrix most of the is an identify matrix, no need to send that to the GPU?
										lines.render(outlineColor, lines.matrixMap.get(id) || this.selectionOutlineMatrix, width || 0.01);
										lastLineRenderer = lines;
									}
								}
							}
						}
					}
					if (lastLineRenderer) {
						lastLineRenderer.renderStop();
					}
				}
			}
		}
	}
}