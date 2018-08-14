import DataInputStream from "./datainputstream.js"
import DefaultColors from "./defaultcolors.js"

/*
 * GeometryLoader loads data from a BIMserver
 */

export default class GeometryLoader {

	constructor(loaderId, bimServerApi, renderLayer, roids, loaderSettings, vertexQuantizationMatrices, stats, settings, query, geometryCache) {
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
		var stream = new DataInputStream(data);
		var channel = stream.readLong();

		while (this.processMessage(stream)) {
			
		}
		
		this.stats.inc("Network", "Bytes OTL", stream.pos);
	}

	readEnd(data) {
		if (this.dataToInfo.size > 0) {
			// We need to tell the renderlayer that not all data has been loaded
			this.renderLayer.storeMissingGeometry(this, this.dataToInfo);
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
				this.dataToInfo.get(geometryDataId).forEach((oid) => {
					var ob = this.renderLayer.getObject(this.loaderId, oid);
					if (ob == null) {
						console.error("Object with oid not found", oid)
					} else {
						ob.add(geometryDataId, oid);
					}
				});
				// Now we can clean it up, nobody is waiting anymore
				this.dataToInfo.delete(geometryDataId);
			}
		} else if (geometryType == 5) {
			// Object
			var oid = stream.readLongAsBigInt();
			var type = stream.readUTF8();
			stream.align8();
			var roid = stream.readLong();
			var geometryInfoOid = stream.readLong();
			var hasTransparency = stream.readLong() == 1;
			var objectBounds = stream.readDoubleArray(6);
			var matrix = stream.readDoubleArray(16);
			var geometryDataOid = stream.readLong();
			var geometryDataOidFound = geometryDataOid;
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