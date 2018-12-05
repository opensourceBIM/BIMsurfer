import DataInputStream from "./datainputstream.js"
import DefaultColors from "./defaultcolors.js"
import RenderLayer from "./renderlayer.js"

/*
 * GeometryLoader loads data from a BIMserver
 */

export default class GeometryLoader {

	constructor(loaderId, bimServerApi, renderLayer, roids, loaderSettings, vertexQuantizationMatrices, stats, settings, query, geometryCache, gpuBufferManager) {
		this.renderLayer = renderLayer;
		this.settings = settings;
		
		this.query = query;
		this.loaderSettings = loaderSettings;

		this.loaderId = loaderId;
		this.bimServerApi = bimServerApi;
		this.roids = roids;
		this.vertexQuantizationMatrices = vertexQuantizationMatrices;
		this.stats = stats;
		this.geometryCache = geometryCache;

		this.state = {};
		this.objectAddedListeners = [];
		this.prepareReceived = false;
		this.geometryIds = new Map();
		this.dataToInfo = new Map();
		
		this.gpuBufferManager = gpuBufferManager;

		this.createdTransparentObjects = new Map(); // object id -> object info
		this.createdOpaqueObjects = new Map(); // object id -> object info
		
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
		});
	}
	
	// This promise is fired as soon as the GeometryLoader is done
	getPromise() {
		return promise;
	}

	start() {
		if (this.onStart != null) {
			this.onStart();
		}
		var obj = [];
		
		var loaderSettings = JSON.parse(JSON.stringify(this.loaderSettings));
		if (this.vertexQuantizationMatrices != null) {
			this.query.loaderSettings.vertexQuantizationMatrices = this.vertexQuantizationMatrices;
		}

		this.bimServerApi.getSerializerByPluginClassName("org.bimserver.serializers.binarygeometry.BinaryGeometryMessagingStreamingSerializerPlugin").then((serializer) => {
			this.bimServerApi.callWithWebsocket("ServiceInterface", "download", {
				roids: this.roids,
				query: JSON.stringify(this.query),
				serializerOid : serializer.oid,
				sync : false
			}).then((topicId) => {
				this.topicId = topicId;
				
				this.state = {
					mode: 0,
					nrObjectsRead: 0,
					nrObjects: 0
				};
				var msg = {
					topicId: this.topicId
				};
				this.bimServerApi.setBinaryDataListener(this.topicId, (data) => {
					this.binaryDataListener(data);
				});
				this.bimServerApi.downloadViaWebsocket(msg);
			});
		});
		return this.promise;
	}

	processMessage(stream) {
		var messageType = stream.readByte();
		
		if (messageType == 0) {
			this.readStart(stream);
		} else if (messageType == 6) {
			this.readEnd(stream);
		} else {
			this.readObject(stream, messageType);
		}
		stream.align8();
		return stream.remaining() > 0;
	}
	
	binaryDataListener(data) {
		this.stats.inc("Network", "Bytes OTL", data.byteLength);
		var stream = new DataInputStream(data);
		var channel = stream.readLong();

		while (this.processMessage(stream)) {
			
		}
	}

	readEnd(data) {
		if (this.dataToInfo.size > 0) {
			// We need to tell the renderlayer that not all data has been loaded
//			this.renderLayer.storeMissingGeometry(this, this.dataToInfo);
		}
//		console.log(this.dataToInfo);

//		this.viewer.loadingDone();
		this.bimServerApi.callWithWebsocket("ServiceInterface", "cleanupLongAction", {topicId: this.topicId});
		this.bimServerApi.clearBinaryDataListener(this.topicId);
		if (this.dataToInfo.size == 0) {
			// Only resolve (and cleanup this loader) when all has been loaded
			this.resolve();
		}
	}
	
	geometryDataIdResolved(geometryDataId) {
		this.dataToInfo.delete(geometryDataId);
		if (this.dataToInfo.size == 0) {
			// Only resolve (and cleanup this loader) when all has been loaded
			this.resolve();
		}
	}

	readStart(data) {
		var start = data.readUTF8();

		if (start != "BGS") {
			console.error("data does not start with BGS (" + start + ")");
			return false;
		}

		this.protocolVersion = data.readByte();

		if (this.protocolVersion != 16) {
			console.error("Unimplemented version");
			return false;
		}

		this.multiplierToMm = data.readFloat();
		data.align8();

		var boundary = data.readDoubleArray(6);

		this.state.mode = 1;
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
			var hasTransparency = stream.readLong() == 1;
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
			var oid = stream.readLong();
			var type = stream.readUTF8();
			var nrColors = stream.readInt();
			stream.align8();
			var roid = stream.readLong();
			var geometryInfoOid = stream.readLong();
			var hasTransparency = stream.readLong() == 1;
			var objectBounds = stream.readDoubleArray(6);
			var matrix = stream.readDoubleArray(16);
			var geometryDataOid = stream.readLong();
			var geometryDataOidFound = geometryDataOid;
			if (hasTransparency) {
				this.createdTransparentObjects.set(oid, {
					nrColors: nrColors
				});
			} else {
				this.createdOpaqueObjects.set(oid, {
					nrColors: nrColors
				});
			}
			if (!this.geometryIds.has(geometryDataOid)) {
				if (this.geometryCache != null && this.geometryCache.has(geometryDataOid)) {
					// We know it's cached
				} else {
					geometryDataOidFound = null;
					// We don't have the data yet, it might come in this stream, or maybe in a later stream
					var list = this.dataToInfo.get(geometryDataOid);
					if (list == null) {
						list = [oid];
						this.dataToInfo.set(geometryDataOid, list);
					} else {
						list.push(oid);
					}
				}
			}
			this.createObject(roid, oid, oid, geometryDataOidFound == null ? [] : [geometryDataOidFound], matrix, hasTransparency, type, objectBounds);
		} else if (geometryType == 7) {
			this.processPreparedBuffer(stream, true);
		} else if (geometryType == 8) {
			this.processPreparedBuffer(stream, false);
			// For now this will trigger the loading to be completed
			this.dataToInfo.clear();
		} else {
			console.error("Unsupported geometry type: " + geometryType);
			return;
		}

		this.state.nrObjectsRead++;
	}
	
	processPreparedBuffer(stream, hasTransparancy) {
		var preparedBuffer = {};

		// This is always the last message (before end), so we know all objects have been created
		preparedBuffer.nrObjects = stream.readInt();
		preparedBuffer.nrIndices = stream.readInt();
		preparedBuffer.positionsIndex = stream.readInt();
		preparedBuffer.normalsIndex = stream.readInt();
		preparedBuffer.colorsIndex = stream.readInt();
		preparedBuffer.indices = RenderLayer.createBuffer(this.renderLayer.gl, stream.dataView, preparedBuffer.nrIndices * 4, this.renderLayer.gl.ELEMENT_ARRAY_BUFFER, 3, stream.pos, WebGL2RenderingContext.UNSIGNED_INT, "Uint32Array");
		stream.pos += preparedBuffer.nrIndices * 4;
		preparedBuffer.geometryIdToIndex = new Map();
		preparedBuffer.geometryIdToMeta = new Map();
		for (var i=0; i<preparedBuffer.nrObjects; i++) {
			var oid = stream.readLong();
			var startIndex = stream.readInt();
			var nrIndices = stream.readInt();
			var startColor = stream.readInt();
			var nrColors = stream.readInt();
			preparedBuffer.geometryIdToIndex.set(oid, startIndex);
			preparedBuffer.geometryIdToMeta.set(oid, [{
				start: startIndex,
				length: nrIndices,
				color: startColor,
				colorLength: nrColors
			}]);
		}
		preparedBuffer.vertices = RenderLayer.createBuffer(this.renderLayer.gl, stream.dataView, preparedBuffer.positionsIndex * 2, this.renderLayer.gl.ARRAY_BUFFER, 3, stream.pos, WebGL2RenderingContext.SHORT, "Int16Array");
		stream.pos += preparedBuffer.positionsIndex * 2;
		preparedBuffer.normals = RenderLayer.createBuffer(this.renderLayer.gl, stream.dataView, preparedBuffer.normalsIndex, this.renderLayer.gl.ARRAY_BUFFER, 3, stream.pos, WebGL2RenderingContext.BYTE, "Int8Array");
		stream.pos += preparedBuffer.normalsIndex;
		preparedBuffer.colors = RenderLayer.createBuffer(this.renderLayer.gl, stream.dataView, preparedBuffer.colorsIndex, this.renderLayer.gl.ARRAY_BUFFER, 4, stream.pos, WebGL2RenderingContext.UNSIGNED_BYTE, "Uint8Array");
		stream.pos += preparedBuffer.colorsIndex;
		
		if (preparedBuffer.nrIndices == 0) {
			return;
		}
		
		preparedBuffer.loaderId = this.loaderId;
		preparedBuffer.hasTransparency = hasTransparancy;
		
		var pickColors = new Uint8Array(preparedBuffer.colorsIndex);
		pickColors.i = 0;

		var x = 0;
		var createdObjects = null;
		if (hasTransparancy) {
			createdObjects = this.createdTransparentObjects;
		} else {
			createdObjects = this.createdOpaqueObjects;
		}
		
		for (var [oid, objectInfo] of createdObjects) {
			var pickColor = this.renderLayer.viewer.getPickColor(oid);
			var lenObjectPickColors = objectInfo.nrColors / 4;
			for (var i=0; i<lenObjectPickColors; i++) {
				pickColors.set(pickColor, pickColors.i);
				pickColors.i += 4;
			}
		}
		
		preparedBuffer.pickColors = RenderLayer.createBuffer(this.renderLayer.gl, pickColors, pickColors.i, this.renderLayer.gl.ARRAY_BUFFER, 4);
		preparedBuffer.bytes = RenderLayer.calculateBytesUsed(this.settings, preparedBuffer.positionsIndex, preparedBuffer.colorsIndex, preparedBuffer.nrIndices, preparedBuffer.normalsIndex);
		
		preparedBuffer.unquantizationMatrix = this.unquantizationMatrix;
		var newBuffer = this.renderLayer.addCompleteBuffer(preparedBuffer, this.gpuBufferManager);
		
//		for (var [oid, objectInfo] of createdObjects) {
//			var li = (newBuffer.geometryIdToIndex.get(oid) || []);
//			li.push(mapping.get(oid));
//			newBuffer.geometryIdToIndex.set(oid, li);
//		}
		
		stream.align8();
	}

	readGeometry(stream, roid, croid, geometryId, geometryDataOid, hasTransparency, reused, type, useIntForIndices) {
		var numIndices = stream.readInt();
		if (useIntForIndices) {
			var indices = stream.readIntArray(numIndices);
		} else {
			var indices = stream.readShortArray(numIndices);
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
		this.renderLayer.createGeometry(this.loaderId, roid, croid, geometryDataOid, positions, normals, colors, color, indices, hasTransparency, reused);
	}

	readColors(stream, type) {
		var b = stream.readInt();
		if (b == 1) {
			var color = {r: stream.readFloat(), g: stream.readFloat(), b: stream.readFloat(), a: stream.readFloat()};
		} else {
			var defaultColor = DefaultColors[type];
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

	createObject(roid, oid, objectId, geometryIds, matrix, hasTransparency, type, aabb) {
		if (this.state.mode == 0) {
			console.log("Mode is still 0, should be 1");
			return;
		}
		if (this.multiplierToMm < 0.99 || this.multiplierToMm > 1.01) {
			// We need to change the matrix because the operations in the matrix
			// are based on the original geometry (e.a. not scaled to the right
			// unit: mm)
			var scaleMatrix = mat4.create();
			mat4.scale(scaleMatrix, scaleMatrix, [this.multiplierToMm, this.multiplierToMm, this.multiplierToMm]);
			var invertedScaleMatrix = mat4.create();
			mat4.invert(invertedScaleMatrix, scaleMatrix);

			var totalMatrix = mat4.create();
			// Read from bottom to top

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
		this.renderLayer.createObject(this.loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb);
	}
}