import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";
import * as vec3 from "./glmatrix/vec3.js";

import {GeometryLoader} from "./geometryloader.js";
import {Utils} from "./utils.js";

/**
 * GeometryLoader loads data from a BIMserver
 */
export class BimserverGeometryLoader extends GeometryLoader {

	constructor(loaderId, bimServerApi, renderLayer, roids, loaderSettings, vertexQuantizationMatrices, stats, settings, query, geometryCache, gpuBufferManager) {
		super(loaderId, renderLayer, loaderSettings, vertexQuantizationMatrices, stats, settings, geometryCache, gpuBufferManager, query.loaderSettings.prepareBuffers);
		
		this.bimServerApi = bimServerApi;
		this.roids = roids;
		this.query = query;
	}

	initiateDownload() {
		super.initiateDownload();

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
				
				var msg = {
					topicId: this.topicId
				};
				this.bimServerApi.setBinaryDataListener(this.topicId, (data) => {
					this.binaryDataListener(data);
				});
				this.bimServerApi.downloadViaWebsocket(msg);
			});
		});
	}
	
	endOfStream() {
		super.endOfStream();
		this.bimServerApi.clearBinaryDataListener(this.topicId);
		this.bimServerApi.callWithWebsocket("ServiceInterface", "cleanupLongAction", {topicId: this.topicId});
	}
}