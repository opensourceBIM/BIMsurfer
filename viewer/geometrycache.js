export default class GeometryCache {
	constructor(renderLayer) {
		this.renderLayer = renderLayer;
		
		// GeometryData ID -> geometry
		this.loaded = new Map();

		// GeometryData ID -> Set of GeometryLoader
		this.toload = new Map();

		// GeometryData ID -> Set of GeometryLoader
		this.loading = new Map();
	}

	integrate(geometryDataId, info) {
		if (this.loaded.has(geometryDataId)) {
			this.renderLayer.addGeometryToObject(geometryDataId, info.geometryInfoId, info.loader, info.gpuBufferManager);
			info.geometryLoader.geometryDataIdResolved(geometryDataId);
			return;
		}
		if (this.loading.has(geometryDataId)) {
			var set = this.loading.get(geometryDataId);
			set.add(info);
			return;
		}
		var set = this.toload.get(geometryDataId);
		if (set == null) {
			set = new Set();
			this.toload.set(geometryDataId, set);
		}
		set.add(info);
	}
	
	pullToLoad() {
		var ids = Array.from(this.toload.keys());
		for (var id of ids) {
			this.loading.set(id, this.toload.get(id));
			this.toload.delete(id);
		}
		return ids;
	}

	has(geometryDataId) {
		return this.loaded.has(geometryDataId);
	}
	
	get(geometryDataId) {
		return this.loaded.get(geometryDataId);
	}
	
	set(geometryDataId, geometry) {
		if (this.loaded.has(geometryDataId)) {
			console.error("Already loaded", geometryDataId);
		}
		this.loaded.set(geometryDataId, geometry);
		var geometryInfoIds = this.loading.get(geometryDataId);
		if (geometryInfoIds != null) {
			for (var info of geometryInfoIds.values()) {
				this.renderLayer.addGeometryToObject(geometryDataId, info.geometryInfoId, info.loader, info.gpuBufferManager);
			}
			for (var info of geometryInfoIds.values()) {
				info.geometryLoader.geometryDataIdResolved(geometryDataId);
			}
		}		
		this.loading.delete(geometryDataId);
		
	}
	
	isEmpty() {
		return this.toload.size == 0;
	}
}