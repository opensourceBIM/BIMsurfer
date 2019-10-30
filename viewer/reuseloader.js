import {BimserverGeometryLoader} from "./bimservergeometryloader.js";
import {Utils} from "./utils.js";

/**
 * When loading Tiles, there is sometimes geometry (GeometryData) that is reused in other Tiles as well, in that case it is omitted in the stream, to be loaded later.
 * This class is called whenever there is a batch of GeometryData that needs to be loaded.
 */
export class ReuseLoader {
	constructor(viewer, reuseLowerThreshold, bimServerApi, fieldsToInclude, roids, quantizationMap, geometryCache, geometryDataToReuse) {
		debugger;
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.reuseLowerThreshold = reuseLowerThreshold;
		this.bimServerApi = bimServerApi;
		this.fieldsToInclude = fieldsToInclude;
		this.roids = roids;
		this.quantizationMap = quantizationMap;
		this.geometryCache = geometryCache;
		this.geometryDataToReuse = geometryDataToReuse;
		this.nrReused = 0;
		this.bytesReused = 0;
		this.loaderCounter = 0;
	}
	
	/*
	 * Load an array of geometry data ids
	 */
	load(geometryDataIds) {
		if (geometryDataIds.length == 0) {
			return;
		}
		var start = performance.now();
		var query = {
			oids: geometryDataIds,
			include: {
				type: "GeometryData",
				fieldsDirect: this.fieldsToInclude
			},
			loaderSettings: JSON.parse(JSON.stringify(this.settings.loaderSettings))
		};
		
		// The returned data (GeometryData) objects should be processed as normal, not as a preparedBuffer
		query.loaderSettings.prepareBuffers = false;

		var geometryLoader = new BimserverGeometryLoader(this.loaderCounter++, this.bimServerApi, this, this.roids, this.settings.loaderSettings, this.quantizationMap, this.viewer.stats, this.settings, query, null);
		var p = geometryLoader.start();
		p.then(() => {
			var end = performance.now();
		});
		return p;
	}
	
	/*
	 * This class acts as if it's a RenderLayer, the createGeometry is called} from the BimserverGeometryLoader
	 * We just store the incoming geometry in the (global) GeometryCache
	 */
	createGeometry(loaderId, roid, croid, geometryId, positions, normals, colors, color, indices, lineIndices, hasTransparency, reused) {
		debugger;
		this.nrReused++;
		var bytes = Utils.calculateBytesUsed(this.settings, positions.length, colors.length, indices.length, lineIndices ? lineIndices.length : 0, normals.length);
		this.bytesReused += bytes;
		var geometry = {
				id: geometryId,
				roid: roid,
				croid: croid,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				lineIndices: lineIndices,
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: [],
				objects: []
		};
		
		geometry.isReused = this.settings.gpuReuse;
		
		this.geometryCache.set(geometryId, geometry);
		
		geometry.isReused = geometry.reused > 1 && this.geometryDataToReuse != null && this.geometryDataToReuse.has(geometry.id);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}
	}
}