import DataInputStream from "./datainputstream.js"
import DefaultColors from "./defaultcolors.js"

/*
 * GeometryLoader loads data from a BIMserver
 */

export default class GeometryLoader {

	constructor(loaderId, bimServerApi, renderLayer, roids, loaderSettings, vertexQuantizationMatrices, stats, settings, query) {
		this.renderLayer = renderLayer;
		this.settings = settings;
		
		this.query = query;
		this.loaderSettings = loaderSettings;

		this.loaderId = loaderId;
		this.bimServerApi = bimServerApi;
		this.roids = roids;
		this.vertexQuantizationMatrices = vertexQuantizationMatrices;
		this.stats = stats;

		this.state = {};
		this.objectAddedListeners = [];
		this.prepareReceived = false;
		this.geometryIds = new Map();
		this.dataToInfo = new Map();

		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
		});
	}
	
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
			this.bimServerApi.call("ServiceInterface", "download", {
				roids: this.roids,
				query: JSON.stringify(this.query),
				serializerOid : serializer.oid,
				sync : false
			}, (topicId) => {
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

	binaryDataListener(data) {
		var stream = new DataInputStream(data);
		
		var channel = stream.readLong();
		var messageType = stream.readByte();
		
		if (messageType == 0) {
			this.readStart(stream);
		} else if (messageType == 6) {
			this.readEnd(stream);
		} else {
			this.readObject(stream, messageType);
		}
		this.stats.inc("Network", "Bytes OTL", stream.pos);
	}

	readEnd(data) {
//		this.viewer.loadingDone();
		this.bimServerApi.call("ServiceInterface", "cleanupLongAction", {topicId: this.topicId}, function(){});
		this.bimServerApi.clearBinaryDataListener(this.topicId);
		this.resolve();
	}

	readStart(data) {
		var start = data.readUTF8();

		if (start != "BGS") {
			console.error("data does not start with BGS (" + start + ")");
			return false;
		}

		this.protocolVersion = data.readByte();

		if (this.protocolVersion != 15) {
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
			var hasTransparency = stream.readLong() == 1;
			geometryId = stream.readLong();
			this.readGeometry(stream, roid, geometryId, geometryId, hasTransparency, reused, type, true);
			if (this.dataToInfo[geometryId] != null) {
				this.dataToInfo[geometryId].forEach((oid) => {
					var ob = this.renderLayer.getObject(this.loaderId, oid);
					if (ob == null) {
						console.error("Object with oid not found", oid)
					} else {
						ob.add(geometryId, oid);
					}
				});
				delete this.dataToInfo[geometryId];
			}
		} else if (geometryType == 5) {
			// Object
			var oid = stream.readLong();
			var type = stream.readUTF8();
			stream.align8();
			var roid = stream.readLong();
			var geometryInfoOid = stream.readLong();
			var hasTransparency = stream.readLong() == 1;
			var objectBounds = stream.readDoubleArray(6);
			var matrix = stream.readDoubleArray(16);
			var geometryDataOid = stream.readLong();
			var geometryDataOids = this.geometryIds[geometryDataOid];
			if (geometryDataOids == null) {
				geometryDataOids = [];
				var list = this.dataToInfo[geometryDataOid];
				if (list == null) {
					list = [];
					this.dataToInfo[geometryDataOid] = list;
				}
				list.push(oid);
			}
			this.createObject(roid, oid, oid, geometryDataOids, matrix, hasTransparency, type);
		} else {
			this.warn("Unsupported geometry type: " + geometryType);
			return;
		}

		this.state.nrObjectsRead++;
	}

	readGeometry(stream, roid, geometryId, geometryDataOid, hasTransparency, reused, type, useIntForIndices) {
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
			var colors = stream.readFloatArray(numColors);
		} else if (color != null && !this.settings.useObjectColors) {
			var colors = new Float32Array(new ArrayBuffer(16 * numPositions / 3));
			for (var i=0; i < 4 * numPositions / 3; i++) {
				colors[i * 4 + 0] = color.r;
				colors[i * 4 + 1] = color.g;
				colors[i * 4 + 2] = color.b;
				colors[i * 4 + 3] = color.a;
			}
		}
		if (this.settings.useObjectColors) {
			colors = null;
		}
		if (this.geometryIds[geometryDataOid] == null) {
			this.geometryIds[geometryDataOid] = [];
		}
		this.geometryIds[geometryDataOid].push(geometryId);
		this.renderLayer.createGeometry(this.loaderId, roid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused);
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

	createObject(roid, oid, objectId, geometryIds, matrix, hasTransparency, type) {
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
		this.renderLayer.createObject(this.loaderId, roid, oid, objectId, geometryIds, matrix, scaleMatrix, hasTransparency, type);
	}
}