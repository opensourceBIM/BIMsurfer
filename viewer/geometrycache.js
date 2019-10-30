/**
 * Keeps track of GeometryData that is potentially reused. There are three fases:
 * - toload (this data has yet to start loading)
 * - loading (data has been requested} from the server but not yet returned)
 * - loaded (data has arrived and is processed)
 */
export class GeometryCache {
	constructor(renderLayer) {
		this.renderLayer = renderLayer;
		
		// GeometryData ID -> geometry
		this.loaded = new Map();

		// GeometryData ID -> Set of BimserverGeometryLoader
		this.toload = new Map();

		// GeometryData ID -> Set of BimserverGeometryLoader
		this.loading = new Map();
	}

	integrate2(geometryDataId, loader, gpuBufferManager, geometryInfoIds, geometryLoader) {
		var info = {
			loader: loader,
			gpuBufferManager: gpuBufferManager,
			geometryInfoIds: geometryInfoIds,
			geometryLoader: geometryLoader
		};
		if (this.loaded.has(geometryDataId)) {
			for (const geometryInfoId of geometryInfoIds) {
				this.renderLayer.addGeometryToObject(geometryDataId, geometryInfoId, info.loader, info.gpuBufferManager);
			}
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
	
	/*
	 * Calling this method will either:
	 * - Store the geometryDataId as toload if it's not already loaded and also not loading
	 * - If the geometryDataId is already loading, it will add the given `info` to the list to be triggered when it is loaded
	 * - If it's already loaded, the addGeometryToObject will be triggered right away
	 */
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
	
	/*
	 * Whenever this method is called, all objects in the toload state are moved to the loading state. The IDs of the objecst are returned as an array
	 */
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

	/*
	 * Stores a piece of geometry
	 */
	set(geometryDataId, geometry) {
		if (this.loaded.has(geometryDataId)) {
			console.error("Already loaded", geometryDataId);
		}
		this.loaded.set(geometryDataId, geometry);
		var geometryInfos = this.loading.get(geometryDataId);
		if (geometryInfos != null) {
			for (var info of geometryInfos.values()) {
				for (const geometryInfoId of info.geometryInfoIds) {
					this.renderLayer.addGeometryToObject(geometryDataId, geometryInfoId, info.loader, info.gpuBufferManager);
				}
			}
			// TODO in a lot of cases, this is 4000x the same geomtryLoader, which after 1 invocation has already cleaned-up...
			for (var info of geometryInfos.values()) {
				info.geometryLoader.geometryDataIdResolved(geometryDataId);
			}
		}
		this.loading.delete(geometryDataId);
	}
	
	isEmpty() {
		return this.toload.size == 0;
	}
}