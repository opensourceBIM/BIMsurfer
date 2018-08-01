import GeometryLoader from './geometryloader.js'

export default class ReuseLoader {
	constructor(viewer, reuseLowerThreshold, bimServerApi, fieldsToInclude, roids, quantizationMap, reusedGeometryCache, geometryDataToReuse) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.reuseLowerThreshold = reuseLowerThreshold;
		this.bimServerApi = bimServerApi;
		this.fieldsToInclude = fieldsToInclude;
		this.roids = roids;
		this.quantizationMap = quantizationMap;
		this.reusedGeometryCache = reusedGeometryCache;
		this.geometryDataToReuse = geometryDataToReuse;
		this.nrReused = 0;
		this.bytesReused = 0;
	}
	
	start() {
		var start = performance.now();
		var query = {
			type: {
				name: "GeometryData",
				includeAllSubTypes: false
			},
			reuseLowerThreshold: this.reuseLowerThreshold,
			include: {
				type: "GeometryData",
				fieldsDirect: this.fieldsToInclude
			},
			loaderSettings: JSON.parse(JSON.stringify(this.settings.loaderSettings))
		};
		var geometryLoader = new GeometryLoader(0, this.bimServerApi, this, this.roids, this.settings.loaderSettings, this.quantizationMap, this.viewer.stats, this.settings, query, null);
		var p = geometryLoader.start();
		p.then(() => {
			var end = performance.now();
			console.log("Reuse Loader", this.nrReused, (end - start) + "ms", this.bytesReused + "bytes");
		});
		return p;
	}

	createGeometry(loaderId, roid, croid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		this.nrReused++;
		var bytes = 0;
		if (this.settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			if (this.settings.quantizeColors) {
				bytes += colors.length;
			} else {
				bytes += colors.length * 4;
			}
		}
		if (indices.length < 65536 && this.settings.useSmallIndicesIfPossible) {
			bytes += indices.length * 2;
		} else {
			bytes += indices.length * 4;
		}
		if (this.settings.quantizeNormals) {
			bytes += normals.length;
		} else {
			bytes += normals.length * 4;
		}
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
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: []
		};
		
		if (this.reusedGeometryCache.has(geometryId)) {
			console.error("Geometry already in cache b", geometryId);
		}
		this.reusedGeometryCache.set(geometryId, geometry);
		
		geometry.isReused = geometry.reused > 1 && this.geometryDataToReuse.has(geometry.id);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}
	}
}