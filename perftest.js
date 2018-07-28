import GeometryLoader from './geometryloader.js'
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import DataInputStream from "./datainputstream.js"

export default class PerfTest {
	constructor() {
		this.totalData = 0;
		this.nrMessages = 0;
	}
	
	test() {
		var fieldsToInclude = ["indices"];
		fieldsToInclude.push("normalsQuantized");
		fieldsToInclude.push("verticesQuantized");
		fieldsToInclude.push("colorsQuantized");

		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				
				var roids = [327683, 458755, 589827, 917507, 1179651, 720899, 1638403, 1900547, 1441795, 2359299, 2621443, 2949123, 3276803, 2162691, 3735555, 3538947, 4521987, 4784131, 3932163, 4128771, 4325379, 5046275, 5177347, 5505027, 5701635, 5898243, 6094851, 6291459, 6488067, 6684675];
				var vertexQuantizationMatrices = {};
				for (var roid of roids) {
					vertexQuantizationMatrices[roid] = this.toArray(mat4.create());
				}

				var query = {
					type: {
						name: "IfcProduct",
						includeAllSubTypes: true,
						exclude: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"]
					},
					inBoundingBox: {
					    "x": -100000000,
					    "y": -100000000,
					    "z": -100000000,
					    "width": 200000000,
					    "height": 200000000,
					    "depth": 200000000,
					    "partial": true,
					    "densityLowerThreshold": 100000
					},
					include: {
						type: "IfcProduct",
						field: "geometry",
						include: {
							type: "GeometryInfo",
							field: "data",
							include: {
								type: "GeometryData",
								fieldsDirect: fieldsToInclude
							}
						}
					},
					loaderSettings: {
						quantizeNormals: true,
						quantizeVertices: true,
						quantizeColors: true,
						normalizeUnitsToMM: true,
						reportProgress: false,
						useSmallInts: false,
						vertexQuantizationMatrices: vertexQuantizationMatrices
					}
				};
				this.api.getSerializerByPluginClassName("org.bimserver.serializers.binarygeometry.BinaryGeometryMessagingStreamingSerializerPlugin").then((serializer) => {
					this.api.callWithWebsocket("ServiceInterface", "download", {
						roids: roids,
						query: JSON.stringify(query),
						serializerOid : serializer.oid,
						sync : false
					}).then((topicId) => {
						this.api.setBinaryDataListener(topicId, (data) => {
							this.binaryDataListener(data);
						});
						var msg = {
							topicId: topicId
						};
						this.start = performance.now();
						this.api.downloadViaWebsocket(msg);

					});
				});
			});
		});
	}
	
	processMessage(stream) {
		var messageType = stream.readByte();
		
		if (messageType == 0) {
//			this.readStart(stream);
		} else if (messageType == 6) {
			var stop = performance.now();
			console.log(this.totalData + " bytes", (stop - this.start) + " ms", this.nrMessages + " messages");
			document.write(this.totalData + " bytes, " + (stop - this.start) + " ms" + " " + this.nrMessages + " messages");
//			this.readEnd(stream);
		} else {
//			this.readObject(stream, messageType);
		}
//		if (stream.remaining() > 0) {
//			this.processMessage(stream);
//			console.log("Remaining", stream.remaining());
//		}
	}

	
	binaryDataListener(data) {
		this.totalData += data.byteLength;
		this.nrMessages++;
		var stream = new DataInputStream(data);
		var channel = stream.readLong();
		this.processMessage(stream);
//		this.stats.inc("Network", "Bytes OTL", stream.pos);
	}
	
	toArray(matrix) {
		var result = new Array(16);
		for (var i=0; i<16; i++) {
			result[i] = matrix[i];
		}
		return result;
	}
}

new PerfTest().test();