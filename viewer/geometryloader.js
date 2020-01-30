import * as vec4 from "./glmatrix/vec4.js";
import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";

import {Utils} from "./utils.js";
import {DataInputStream} from "./datainputstream.js";

import {AvlTree} from "./collections/avltree.js";

const PROTOCOL_VERSION = 20;

/**
 * This class is supposed to be and stay BIMserver-free.
 */

export class GeometryLoader {
	constructor(loaderId, renderLayer, loaderSettings, vertexQuantizationMatrices, stats, settings, geometryCache, gpuBufferManager, usePreparedBuffers) {
		this.renderLayer = renderLayer;
		this.settings = settings;
		
		this.loaderSettings = loaderSettings;

		this.loaderId = loaderId;
		this.vertexQuantizationMatrices = vertexQuantizationMatrices;
		this.stats = stats;
		this.geometryCache = geometryCache;

		this.state = {};
		this.objectAddedListeners = [];
		this.geometryIds = new Map();
		this.dataToInfo = new Map();
		
		this.gpuBufferManager = gpuBufferManager;

		if (usePreparedBuffers) {
			this.createdTransparentObjects = new Map(); // object id -> object info
			this.createdOpaqueObjects = new Map(); // object id -> object info
		}
		
		// temporary for emergency quantization
		this.v4 = vec4.create();
		
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
		});

		// Object IDs need to be stored so that references
		// to the GPU BufferSet can be made later, which is
		// only constructed at the end of geometry loading.
		this.uniqueIdsLoaded = [];
	}
	
	processPreparedBufferInit(stream, hasTransparancy) {
		this.preparedBuffer = {};

		this.preparedBuffer.nrObjects = stream.readInt();
		this.preparedBuffer.nrIndices = stream.readInt();
		
		this.preparedBuffer.nrLineIndices = stream.readInt();
		this.preparedBuffer.positionsIndex = stream.readInt();
		this.preparedBuffer.normalsIndex = stream.readInt();
		this.preparedBuffer.colorsIndex = stream.readInt();
		
		this.preparedBuffer.indicesRead = 0;
		this.preparedBuffer.lineIndicesRead = 0;
		this.preparedBuffer.positionsRead = 0;
		this.preparedBuffer.normalsRead = 0;
		this.preparedBuffer.colorsRead = 0;

		this.preparedBuffer.nrObjectsRead = 0;

		this.preparedBuffer.nrColors = this.preparedBuffer.positionsIndex * 4 / 3;

		this.preparedBuffer.indices = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrIndices, this.renderLayer.gl.ELEMENT_ARRAY_BUFFER, 3, WebGL2RenderingContext.UNSIGNED_INT, "Uint32Array");
		if (this.loaderSettings.generateLineRenders) {
			this.preparedBuffer.lineIndices = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrLineIndices, this.renderLayer.gl.ELEMENT_ARRAY_BUFFER, 2, WebGL2RenderingContext.UNSIGNED_INT, "Uint32Array");
		}
		this.preparedBuffer.colors = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrColors, this.renderLayer.gl.ARRAY_BUFFER, 4, WebGL2RenderingContext.UNSIGNED_BYTE, "Uint8Array");
		this.preparedBuffer.vertices = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.positionsIndex, this.renderLayer.gl.ARRAY_BUFFER, 3, this.settings.quantizeVertices ? WebGL2RenderingContext.SHORT : WebGL2RenderingContext.FLOAT, this.settings.quantizeVertices ? "Int16Array" : "Float32Array");
		this.preparedBuffer.normals = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.normalsIndex, this.renderLayer.gl.ARRAY_BUFFER, this.settings.quantizeNormals ? (this.settings.loaderSettings.octEncodeNormals ? 2 : 3) : 3, this.settings.quantizeNormals ? WebGL2RenderingContext.BYTE : WebGL2RenderingContext.FLOAT, this.settings.quantizeNormals ? "Int8Array" : "Float32Array");
		this.preparedBuffer.pickColors = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrColors, this.renderLayer.gl.ARRAY_BUFFER, 4, WebGL2RenderingContext.UNSIGNED_BYTE, "Uint8Array");

		this.preparedBuffer.uniqueIdToIndex = new AvlTree(this.renderLayer.viewer.inverseUniqueIdCompareFunction);

		this.preparedBuffer.loaderId = this.loaderId;
		this.preparedBuffer.hasTransparency = hasTransparancy;

		if (this.loaderSettings.quantizeVertices) {
			this.preparedBuffer.unquantizationMatrix = this.unquantizationMatrix;
		}

		this.preparedBuffer.bytes = Utils.calculateBytesUsed(this.settings, this.preparedBuffer.positionsIndex, this.preparedBuffer.nrColors, this.preparedBuffer.nrIndices, this.preparedBuffer.nrLineIndices, this.preparedBuffer.normalsIndex);

		stream.align8();
	}

	processPreparedBuffer(stream, hasTransparancy) {
		const loadedViewObjects = [];

		const nrObjects = stream.readInt();
		const totalNrIndices = stream.readInt();
		const totalNrLineIndices = stream.readInt();
		const positionsIndex = stream.readInt();
		const normalsIndex = stream.readInt();
		const colorsIndex = stream.readInt();

		if (this.preparedBuffer.nrIndices == 0) {
			return;
		}
		
		this.preparedBuffer.indicesRead += totalNrIndices;
		this.preparedBuffer.lineIndicesRead += totalNrLineIndices;
		this.preparedBuffer.positionsRead += positionsIndex;
		this.preparedBuffer.normalsRead += normalsIndex;
		this.preparedBuffer.colorsRead += colorsIndex;
		
		const previousStartIndex = this.preparedBuffer.indices.writePosition / 4;
		const previousLineIndexStart = this.loaderSettings.generateLineRenders ? this.preparedBuffer.lineIndices.writePosition / 4 : 0;
		const previousColorIndex = this.preparedBuffer.colors.writePosition;
		if (!this.settings.fakeLoading) {
			Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.indices, stream.dataView, stream.pos, totalNrIndices);
		}
		stream.pos += totalNrIndices * 4;

		if (this.loaderSettings.generateLineRenders) {
			Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.lineIndices, stream.dataView, stream.pos, totalNrLineIndices);
			stream.pos += totalNrLineIndices * 4;
		}

		var nrColors = positionsIndex * 4 / 3;
		var colors = new Uint8Array(nrColors);
		var colors32 = new Uint32Array(colors.buffer);
		var createdObjects = null;

		if (hasTransparancy) {
			createdObjects = this.createdTransparentObjects;
		} else {
			createdObjects = this.createdOpaqueObjects;
		}

		var pickColors = new Uint8Array(positionsIndex * 4 / 3);
		var pickColors32 = new Uint32Array(pickColors.buffer);
		pickColors.i = 0;

		var currentColorIndex = 0;

		const collectedMetaObjects = [];
		
		for (var i = 0; i < nrObjects; i++) {
			var uniqueId = null;
			if (this.loaderSettings.useUuidAndRid) {
				let oid = stream.readInt();
				let mid = stream.readLong();
				uniqueId = oid + "-" + mid;
			} else {
				uniqueId = stream.readLong();
			}
			this.uniqueIdsLoaded.push(uniqueId);

			var startIndex = stream.readInt();
			var startLineIndex = stream.readInt();
			var nrIndices = stream.readInt();
			var nrLineIndices = stream.readInt();
			var nrVertices = stream.readInt();
			var minIndex = stream.readInt();
			var maxIndex = stream.readInt();
			if (this.loaderSettings.generateLineRenders) {
				var minLineIndex = stream.readInt();
				var maxLineIndex = stream.readInt();
			}
			var nrObjectColors = nrVertices / 3 * 4;

			if (!createdObjects) {
				loadedViewObjects.push(uniqueId);
				const viewObject = {
					type: "Annotation",
					pickId: uniqueId
				}
				this.renderLayer.viewer.addViewObject(uniqueId, viewObject);				
			}

			var viewObject = this.renderLayer.viewer.viewObjects.get(uniqueId);
			var pickColor = this.renderLayer.viewer.getPickColorForPickId(viewObject.pickId);
			var color32 = pickColor[0] + pickColor[1] * 256 + pickColor[2] * 256 * 256 + pickColor[3] * 256 * 256 * 256;
			var lenObjectPickColors = nrObjectColors;
			pickColors32.fill(color32, pickColors.i / 4, (pickColors.i + lenObjectPickColors) / 4);
			pickColors.i += lenObjectPickColors;

			const density = stream.readFloat();

			var colorPackSize = stream.readInt();
			if (createdObjects) {
				var object = createdObjects.get(uniqueId);
				object.density = density;
			}
			
			const meta = {
				start: previousStartIndex + startIndex,
				length: nrIndices,
				lineIndicesStart: previousLineIndexStart + startLineIndex,
				lineIndicesLength: nrLineIndices,
				color: previousColorIndex + currentColorIndex,
				colorLength: nrObjectColors,
				minIndex: minIndex,
				maxIndex: maxIndex,
				minLineIndex: minLineIndex,
				maxLineIndex: maxLineIndex
			};
			
			this.preparedBuffer.uniqueIdToIndex.set(uniqueId, [meta]);
			collectedMetaObjects.push(meta);
			if (colorPackSize == 0) {
				// Generate default colors for this object
				var defaultColor = this.renderLayer.viewer.defaultColors[object.type.toUpperCase()];
				if (defaultColor == null) {
					defaultColor = this.renderLayer.viewer.defaultColors.DEFAULT;
				}
				if (defaultColor.asInt == null) {
					// Cache the integer version
					var color = new Uint8Array(4);
					color[0] = defaultColor.r * 255;
					color[1] = defaultColor.g * 255;
					color[2] = defaultColor.b * 255;
					color[3] = defaultColor.a * 255;
					defaultColor.asInt = color[0] + color[1] * 256 + color[2] * 65536 + color[3] * 16777216;
				}
				colors32.fill(defaultColor.asInt, currentColorIndex / 4, (currentColorIndex + nrObjectColors) / 4);
				currentColorIndex += nrObjectColors;
			}
			for (var j = 0; j < colorPackSize; j++) {
				var count = stream.readInt();
				var color = stream.readUnsignedByteArray(4);
				var color32 = color[0] + color[1] * 256 + color[2] * 65536 + color[3] * 16777216;
				colors32.fill(color32, (currentColorIndex / 4), (currentColorIndex + count) / 4);
				currentColorIndex += count;
			}
		}
		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.colors, colors, 0, nrColors);

		if (this.loaderSettings.quantizeVertices) {
			if (!this.settings.quantizeVertices) {
				// we need to do some alignment here
				const floats = new Float32Array(positionsIndex);
				const aligned_u8 = new Uint8Array(floats.buffer);
				const unaligned_u8 = new Uint8Array(stream.dataView.buffer, stream.pos, aligned_u8.length);
				stream.pos += aligned_u8.length;
				aligned_u8.set(unaligned_u8);
				
				// now we can quantize the input
				// admittedly there was code for this in BufferTransformer, but it was commented out?
				const m4 = this.vertexQuantizationMatrices.vertexQuantizationMatrix;
				for (var i = 0; i < floats.length; i += 3) {
					this.v4.set(floats.subarray(i, i + 3));
					this.v4[3] = 1.0;
					vec4.transformMat4(this.v4, this.v4, m4);
					floats.set(this.v4.subarray(0, 3), i);
				}
				const quantized = new Int16Array(floats);

				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, quantized, 0, quantized.length);
			} else {
				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, stream.dataView, stream.pos, positionsIndex);
				stream.pos += positionsIndex * 2;
			}		
		} else {
			const floats = new Float32Array(stream.dataView.buffer, stream.pos, positionsIndex);
			if (this.settings.quantizeVertices) {
				const quantized = new Int16Array(floats.length);
				const m4 = this.vertexQuantizationMatrices.vertexQuantizationMatrix;
				for (var i = 0; i < floats.length; i += 3) {
					this.v4.set(floats.subarray(i, i + 3));
					this.v4[3] = 1.0;
					vec4.transformMat4(this.v4, this.v4, m4);
					quantized.set(this.v4.subarray(0, 3), i);
				}
				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, quantized, 0, quantized.length);
			} else {
				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, floats, 0, floats.length);
			}
			stream.pos += positionsIndex * 4;

			// @todo a bit ugly, but only in this case the AABB for the on-demand loaded object
			// is computed.
			if (loadedViewObjects.length) {
				// @todo update this in the annotation generator
				collectedMetaObjects.forEach((elem)=>{
					elem.start *= 3;
					elem.length *= 3;
				});
				for (var i = 0; i < collectedMetaObjects.length; ++i) {
					const meta = collectedMetaObjects[i];
					// TODO use uniqueId
					const oid = loadedViewObjects[i];
					const aabb = new Float32Array(6);
					aabb.fill(Infinity);
					aabb.subarray(3).fill(-Infinity);
					for (var j = meta.minIndex; j <= meta.maxIndex; j += 3) {
						const xyz = floats.subarray(3*j, 3*j+3);
						for (let k = 0; k < 3; ++k) {
							if (xyz[k] < aabb[k]) {
								aabb[k] = xyz[k];
							}
							if (xyz[k] > aabb[k+3]) {
								aabb[k+3] = xyz[k];
							}
						}
					}
					var globalizedAabb = Utils.transformBounds(aabb, this.renderLayer.viewer.globalTranslationVector);			
					const viewobj = this.renderLayer.viewer.getViewObject(oid);
					viewobj.aabb = aabb;
					viewobj.globalizedAabb = globalizedAabb;
				}
			}

		}
		
		if (this.settings.quantizeNormals) {
			// Debugging oct-encoding
//			var octNormals = new Int8Array(stream.dataView.buffer, stream.pos, ((normalsIndex / 3) * 2));
//			for (var i=0; i<octNormals.length; i+=2) {
//				console.log(octNormals[i], octNormals[i+1]);
//				let normal = Utils.octDecodeVec2([octNormals[i], octNormals[i+1]]);
////				if (this.lastNormal == null || this.lastNormal.toString() != normal.toString()) {
////					console.log(normal);
////				}
//				this.lastNormal = normal;
//			}

			if (this.settings.loaderSettings.octEncodeNormals) {
				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.normals, stream.dataView, stream.pos, ((normalsIndex / 3) * 2), true);
				stream.pos += ((normalsIndex / 3) * 2);
			} else {
				Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.normals, stream.dataView, stream.pos, normalsIndex, true);
				stream.pos += normalsIndex;
			}
		} else {
			Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.normals, stream.dataView, stream.pos, normalsIndex, true);
			stream.pos += normalsIndex * 4;
		}

		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.pickColors, pickColors, 0, pickColors.i);

		this.preparedBuffer.nrObjectsRead += nrObjects;
		
		if (this.preparedGpuBuffer == null) {
			this.preparedGpuBuffer = this.renderLayer.addCompleteBuffer(this.preparedBuffer, this.gpuBufferManager);
		}

		if (!this.settings.fakeLoading) {
			this.preparedGpuBuffer.update(this.preparedBuffer.indicesRead, this.preparedBuffer.positionsRead, this.preparedBuffer.normalsRead, this.preparedBuffer.colorsRead);
			this.renderLayer.viewer.dirty = 1;
			
			if (this.preparedBuffer.nrObjectsRead == this.preparedBuffer.nrObjects) {
				this.preparedGpuBuffer.finalize();
				
				for (let uniqueId of this.uniqueIdsLoaded) {
					this.renderLayer.viewer.uniqueIdToBufferSet.set(uniqueId, [this.preparedGpuBuffer]);
				}
				
				this.uniqueIdsLoaded.length = 0;
				this.preparedGpuBuffer = null;
				this.preparedBuffer = null;
			}
		}
		this.renderLayer.incLoadedPrimitives(totalNrIndices / 3, totalNrLineIndices / 2);

		stream.align8();

		return loadedViewObjects;
	}
	
	processMessage(stream) {
		var messageType = stream.readByte();
		
		if (messageType == 0) {
			if (!this.readStart(stream)) {
				// An error occured, usually version mismatch or missing serializer
				return false;
			}
		} else if (messageType == 6) {
			this.readEnd(stream);
		} else {
			this.readObject(stream, messageType);
		}
		stream.align8();
		return stream.remaining() > 0;
	}

	endOfStream() {
		if (this.dataToInfo.size > 0) {
			// We need to tell the renderlayer that not all data has been loaded
			this.renderLayer.storeMissingGeometry(this, this.dataToInfo);
		}
		if (this.dataToInfo.size == 0) {
			// Only resolve (and cleanup this loader) when all has been loaded
			this.resolve();
		}
	}
	
	binaryDataListener(data) {
		this.stats.inc("Network", "Bytes OTL", data.byteLength);
		var stream = new DataInputStream(data);
		var channel = stream.readLong();
		var type = stream.readLong();
		if (type == 0) {
			while (this.processMessage(stream)) {
				
			}
		} else if (type == 1) {
			this.endOfStream();
			// End of stream
		}
	}
	
	geometryDataIdResolved(geometryDataId) {
		this.dataToInfo.delete(geometryDataId);
		if (this.dataToInfo.size == 0) {
			// Only resolve (and cleanup this loader) when all has been loaded
			this.resolve();
		}
	}
	
	readObject(stream, geometryType) {
		var geometryId;
		var numGeometries;
		var numParts;
		var objectBounds;
		var numIndices;
		var indices;
		var numPositions;
		var positions;
		var numNormals;
		var normals;
		var numColors;
		var colors = null;

		if (geometryType == 1) {
			// Geometry
			var reused = stream.readInt();
			var type = stream.readUTF8();
			stream.align8();
			var roid = stream.readLong();
			var croid = stream.readLong();
			let hasTransparencyValue = stream.readLong();
			var hasTransparency = hasTransparencyValue == 1;
			var geometryDataId = stream.readLong();
			this.readGeometry(stream, roid, croid, geometryDataId, geometryDataId, hasTransparency, reused, type, true);
			if (this.dataToInfo.has(geometryDataId)) {
				// There are objects that have already been loaded, that are waiting for this GeometryData
				var oids = this.dataToInfo.get(geometryDataId);
				for (var oid of oids) {
					var ob = this.renderLayer.getObject(this.loaderId, oid);
					if (ob == null) {
						console.error("Object with oid not found", oid)
					} else {
						ob.add(geometryDataId, oid);
					}
				}
				// Now we can clean it up, nobody is waiting anymore
				this.dataToInfo.delete(geometryDataId);
			}
		} else if (geometryType == 5) {
			// Object
			var inPreparedBuffer = stream.readByte() == 1;
			var uniqueId = null;
			if (this.loaderSettings.useUuidAndRid) {
				let oid = stream.readInt();
				let mid = stream.readLong();
				uniqueId = oid + "-" + mid;
			} else {
				uniqueId = stream.readLong();
			}
			var type = stream.readUTF8();
			var nrColors = stream.readInt();
			stream.align8();
			var roid = stream.readLong();
			var geometryInfoOid = stream.readLong();
			var hasTransparency = stream.readLong() == 1;

			// Making copies here because otherwise we are potentially referring to very big buffers for as long as the viewer lives
			var objectBounds = stream.readDoubleArrayCopy(6);
			var matrix = stream.readDoubleArrayCopy(16);
			
			var geometryDataOid = stream.readLong();
			var geometryDataOidFound = geometryDataOid;
			if (inPreparedBuffer) {
				if (hasTransparency) {
					this.createdTransparentObjects.set(uniqueId, {
						nrColors: nrColors,
						type: type
					});
				} else {
					this.createdOpaqueObjects.set(uniqueId, {
						nrColors: nrColors,
						type: type
					});
				}
			}
			if (!inPreparedBuffer) {
				if (!this.geometryIds.has(geometryDataOid)) {
					if (this.geometryCache != null && this.geometryCache.has(geometryDataOid)) {
						// We know it's cached
					} else {
						geometryDataOidFound = null;
						// We don't have the data yet, it might come in this stream, or maybe in a later stream
						var list = this.dataToInfo.get(geometryDataOid);
						if (list == null) {
							list = [uniqueId];
							this.dataToInfo.set(geometryDataOid, list);
						} else {
							list.push(uniqueId);
						}
					}
				}
			} else {
				geometryDataOidFound = null;
			}
			
			this.createObject(roid, uniqueId, geometryDataOidFound == null ? [] : [geometryDataOidFound], matrix, hasTransparency, type, objectBounds, inPreparedBuffer);
		} else if (geometryType == 9) {
			// Minimal object
			var uniqueId = null;
			if (this.loaderSettings.useUuidAndRid) {
				let oid = stream.readInt();
				let mid = stream.readLong();
				uniqueId = oid + "-" + mid;
			} else {
				uniqueId = stream.readLong();
			}
			var type = stream.readUTF8();
			var nrColors = stream.readInt();
			var roid = stream.readLong();
			var geometryInfoOid = stream.readLong();
			var hasTransparency = stream.readLong() == 1;
			
			stream.align8();
			var objectBounds = stream.readDoubleArrayCopy(6);

			var geometryDataOid = stream.readLong();
			var geometryDataOidFound = geometryDataOid;
			if (hasTransparency) {
				this.createdTransparentObjects.set(uniqueId, {
					nrColors: nrColors,
					type: type
				});
			} else {
				this.createdOpaqueObjects.set(uniqueId, {
					nrColors: nrColors,
					type: type
				});
			}
			
			this.createObject(roid, uniqueId, [], null, hasTransparency, type, objectBounds, true);
		} else if (geometryType == 7) {
			this.processPreparedBuffer(stream, true);
		} else if (geometryType == 8) {
			this.processPreparedBuffer(stream, false);
		} else if (geometryType == 10) {
			this.processPreparedBufferInit(stream, true);
		} else if (geometryType == 11) {
			this.processPreparedBufferInit(stream, false);
		} else {
			console.error("Unsupported geometry type: " + geometryType);
			return;
		}

		this.state.nrObjectsRead++;
	}

	readGeometry(stream, roid, croid, geometryId, geometryDataOid, hasTransparency, reused, type, useIntForIndices) {
		var numIndices = stream.readInt();
		if (useIntForIndices) {
			var indices = stream.readIntArray(numIndices);
		} else {
			var indices = stream.readShortArray(numIndices);
		}
		if (this.loaderSettings.generateLineRenders) {
			var numLineIndices = stream.readInt();
			if (useIntForIndices) {
				var lineIndices = stream.readIntArray(numLineIndices);
			} else {
				var lineIndices = stream.readShortArray(numLineIndices);
			}
		}
		var color = this.readColors(stream, type);
		var numPositions = stream.readInt();
		if (this.loaderSettings.quantizeVertices) {
			var positions = stream.readShortArray(numPositions);
			stream.align8();
		} else {
			var positions = stream.readFloatArray(numPositions);
		}
		var numNormals = stream.readInt();
		if (this.loaderSettings.quantizeNormals) {
			var normals = stream.readByteArray(numNormals);
			stream.align8();
		} else {
			var normals = stream.readFloatArray(numNormals);
		}
		var numColors = stream.readInt();
		if (numColors > 0) {
			if (this.loaderSettings.quantizeColors) {
				var colors = stream.readUnsignedByteArray(numColors);
				stream.align8();
			} else {
				var colors = stream.readFloatArray(numColors);
			}
		} else if (color != null && !this.settings.useObjectColors) {
			// When we are generating this data anyways, we might as well make sure it ends up in the format required by the GPU
			if (this.settings.quantizeColors) {
				var size = (4 * numPositions) / 3;
				var colors = new Uint8Array(size);
				var quantizedColor = new Uint8Array(4);
				quantizedColor[0] = color.r * 255;
				quantizedColor[1] = color.g * 255;
				quantizedColor[2] = color.b * 255;
				quantizedColor[3] = color.a * 255;
				for (var i=0; i < size / 4; i++) {
					colors.set(quantizedColor, i * 4);
				}
			} else {
				var size = (4 * numPositions) / 3;
				var colors = new Float32Array(size);
				var nonQuantizedColor = new Float32Array(4);
				nonQuantizedColor[0] = color.r;
				nonQuantizedColor[1] = color.g;
				nonQuantizedColor[2] = color.b;
				nonQuantizedColor[3] = color.a;
				for (var i=0; i < size / 4; i++) {
					colors.set(nonQuantizedColor, i * 4);
				}
			}
		}
		if (this.settings.useObjectColors) {
			colors = null;
		}
		if (!this.geometryIds.has(geometryDataOid)) {
			this.geometryIds.set(geometryDataOid, true);
		}
		if (colors.length == 0) {
			debugger;
		}
		this.renderLayer.createGeometry(this.loaderId, roid, croid, geometryDataOid, positions, normals, colors, color, indices, lineIndices, hasTransparency, reused);
	}

	readColors(stream, type) {
		var b = stream.readInt();
		if (b == 1) {
			var color = {r: stream.readFloat(), g: stream.readFloat(), b: stream.readFloat(), a: stream.readFloat()};
		} else {
			var defaultColor = this.renderLayer.viewer.defaultColors[type.toUpperCase()];
			if (defaultColor == null) {
				var color = {
					r: 0,
					g: 1,
					b: 0,
					a: 1
				};
			} else {
				color = defaultColor;
			}
		}
		stream.align4();
		return color;
	}

	createObject(roid, uniqueId, geometryIds, matrix, hasTransparency, type, aabb, inCompleteBuffer) {
		if (this.state.mode == 0) {
			console.log("Mode is still 0, should be 1");
			return;
		}
		if (!inCompleteBuffer) {
			if (this.multiplierToMm < 0.99 || this.multiplierToMm > 1.01) {
				// We need to change the matrix because the operations in the matrix
				// are based on the original geometry (e.a. not scaled to the right
				// unit: mm)
				var scaleMatrix = mat4.create();
				mat4.scale(scaleMatrix, scaleMatrix, [this.multiplierToMm, this.multiplierToMm, this.multiplierToMm]);
				var invertedScaleMatrix = mat4.create();
				mat4.invert(invertedScaleMatrix, scaleMatrix);
				
				var totalMatrix = mat4.create();
				// Read} from bottom to top
				
				// 3. Apply the scaling again
				mat4.multiply(totalMatrix, totalMatrix, scaleMatrix);
				
				// 2. Apply the matrix
				mat4.multiply(totalMatrix, totalMatrix, matrix);
				
				// 1. Server has already scaled the vertices, scale it back to the
				// original values
				mat4.multiply(totalMatrix, totalMatrix, invertedScaleMatrix);
				
				matrix = totalMatrix;
			}
			var normalMatrix = mat3.create();
			mat3.fromMat4(normalMatrix, matrix);
			mat3.invert(normalMatrix, normalMatrix);
			mat3.transpose(normalMatrix, normalMatrix);
		}
		this.renderLayer.createObject(this.loaderId, roid, uniqueId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb);
	}
	
	readStart(data) {
		var start = data.readUTF8();

		if (start != "BGS") {
			console.error("Data does not start with BGS (" + start + ")");
			return false;
		}

		this.protocolVersion = data.readByte();

		if (this.protocolVersion != PROTOCOL_VERSION) {
			console.error("Unimplemented version (protocol: " + this.protocolVersion + ", implemented: " + PROTOCOL_VERSION + ").\nUsually this means you need to either:\n\t- Update the BinarySerializers plugin bundle in BIMserver\n\t- Update your version of BIMsurfer 3");
			return false;
		}

		this.multiplierToMm = data.readFloat();
		data.align8();

		var boundary = data.readDoubleArray(6);

		this.state.mode = 1;
		
		return true;
	}

	initiateDownload() {
		this.state = {
			mode: 0,
			nrObjectsRead: 0,
			nrObjects: 0
		};
	}
	
	start() {
		if (this.renderLayer.progressListener != null) {
			this.renderLayer.progressListener(0, 0);
		}
		
		if (this.onStart != null) {
			this.onStart();
		}
		var obj = [];

		this.initiateDownload();
		
		var loaderSettings = JSON.parse(JSON.stringify(this.loaderSettings));

		return this.promise;
	}
	
	readEnd(data) {
		// This is the end of the binary stream, but there is one more message on the line, which is the end of the wrapping stream..., so that's when we close it all
	}
	
	// This promise is fired as soon as the GeometryLoader is done
	getPromise() {
		return this.promise;
	}
}