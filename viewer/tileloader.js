import * as vec3 from "./glmatrix/vec3.js";

import {Executor} from "./executor.js";
import {Utils} from "./utils.js";
import {GpuBufferManager} from "./gpubuffermanager.js";
import {BimserverGeometryLoader} from "./bimservergeometryloader.js";

/**
 * Loads tiles. Needs to be initialized first (initialize method).
 */
export class TileLoader {
	constructor(tilingRenderLayer, viewer, bimServerApi, densityThreshold, reuseLowerThreshold, geometryDataToReuse, roids, fieldsToInclude) {
		this.tilingRenderLayer = tilingRenderLayer;
		this.viewer = viewer;
		this.settings = viewer.settings;
		this.bimServerApi = bimServerApi;
		this.densityThreshold = densityThreshold;
		this.reuseLowerThreshold = reuseLowerThreshold;
		this.geometryDataToReuse = Array.from(geometryDataToReuse);
		this.roids = roids;
		this.fieldsToInclude = fieldsToInclude;
	
		this.excludedTypes = viewer.settings.excludedTypes;
		this.executor = new Executor(64);
		
//		if (this.viewer.vertexQuantization) {
//			this.quantizationMap = {};
//			for (var roid of this.roids) {
//				this.quantizationMap[roid] = this.viewer.vertexQuantization.getUntransformedVertexQuantizationMatrixForRoid(roid);
//			}
//		}
		
		this.loaderCounter = 0;
	}
	
	/*
	 * Initialize the tile loader. This needs to be called only once, and it's async, so make sure to use the returned Promise
	 */
	initialize() {
		var promise = new Promise((resolve, reject) => {
			this.bimServerApi.call("ServiceInterface", "getTiles", {
				roids: this.roids,
				excludedTypes: this.excludedTypes,
				geometryIdsToReuse: this.geometryDataToReuse,
				minimumThreshold: this.densityThreshold,
				maximumThreshold: -1,
				depth: this.settings.maxOctreeDepth
			}, (tiles) => {
				for (var tile of tiles) {
					var tileId = tile.tileId;
					var nrObjects = tile.nrObjects;
					if (nrObjects == 0) {
						// Should not happen
						debugger;
						this.viewer.stats.inc("Tiling", "Empty");
						continue;
					}
					this.viewer.stats.inc("Tiling", "Full");
					var node = this.tilingRenderLayer.octree.getNodeById(tileId);
					
					const min = tile.minBounds.min;
					const max = tile.minBounds.max;
					node.minimalBox.set(vec3.fromValues(min.x, min.y, min.z), vec3.fromValues(max.x, max.y, max.z));
					
					node.loadingStatus = 0;
					node.nrObjects = nrObjects;
					node.stats = {
						triangles: 0,
						drawCallsPerFrame: 0
					};
				}
				this.tilingRenderLayer.octree.prepareLevelLists();

				resolve();
			});
		});
		return promise;
	}
	
	/*
	 * Starts loading a specific tile
	 */
	loadTile(node, executor) {
		if (!this.tilingRenderLayer.enabled) {
			return;
		}
		if (node.loadingStatus != 0) {
			return;
		}
		node.loadingStatus = 1;
		if (executor == null) {
			executor = this.executor;
		}
		if (node.nrObjects == 0) {
			node.loadingStatus = 2;
			// This happens for parent nodes that don't contain any objects, but have children that do have objects
			return;
		}
		
		node.gpuBufferManager = new GpuBufferManager(this.viewer);
		
		const loaderSettings = JSON.parse(JSON.stringify(this.settings.loaderSettings));
		
		loaderSettings.globalTranslationVector = Utils.toArray(this.viewer.globalTranslationVector);
		
		var query = {
			doublebuffer: false,
			type: {
				name: "IfcProduct",
				includeAllSubTypes: true,
				exclude: this.excludedTypes
			},
			tiles: {
				ids: [node.id],
				densityUpperThreshold: this.densityThreshold,
				densityLowerThreshold: -1,
				reuseLowerThreshold: this.reuseLowerThreshold,
				geometryDataToReuse: this.geometryDataToReuse,
				maxDepth: this.settings.maxOctreeDepth
			},
			include: {
				type: "IfcProduct",
				field: "geometry",
				include: {
					type: "GeometryInfo",
					field: "data",
					include: {
						type: "GeometryData",
						fieldsDirect: this.fieldsToInclude
					}
				}
			},
			loaderSettings: loaderSettings
		};
		
		if (this.tilingRenderLayer.viewer.vertexQuantization) {
			query.loaderSettings.vertexQuantizationMatrix = this.tilingRenderLayer.viewer.vertexQuantization.vertexQuantizationMatrixWithGlobalTranslation;
		}
		var geometryLoader = new BimserverGeometryLoader(this.loaderCounter++, this.bimServerApi, this.tilingRenderLayer, this.roids, this.settings.loaderSettings, this.quantizationMap, this.viewer.stats, this.settings, query, this.tilingRenderLayer.reusedGeometryCache, node.gpuBufferManager);
		
		// We now use the total model bounds for the quantization since the prebuilt buffers already applied the transformation, thus no problems are expected for strange bounds
		geometryLoader.unquantizationMatrix = this.tilingRenderLayer.viewer.vertexQuantization.inverseVertexQuantizationMatrixWithGlobalTranslation;
		
		this.tilingRenderLayer.registerLoader(geometryLoader.loaderId);
		this.tilingRenderLayer.loaderToNode[geometryLoader.loaderId] = node;
		geometryLoader.onStart = () => {
			node.loadingStatus = 2;
			this.viewer.stats.inc("Tiling", "Loading");
			this.viewer.dirty = 2;
		};
		executor.add(geometryLoader).then(() => {
			this.viewer.stats.dec("Tiling", "Loading");
			this.viewer.stats.inc("Tiling", "Loaded");
			if (node.gpuBufferManager.isEmpty() && 
					(node.bufferManager == null || node.bufferManager.bufferSets.size == 0)) {
				node.loadingStatus = 5;
			} else {
				node.loadingStatus = 3;
			}
			this.tilingRenderLayer.done(geometryLoader.loaderId);
		});
	}
	
	geometryLoaderDone(geometryLoader) {
		
	}
	
	/*
	 * Can for example be called} from the Console for debugging purposes
	 * In real life you'd never call this, since it kind of defeats the purpose of tiling
	 */
	loadAll(progressListener) {
		var executor = new Executor(64);
		executor.setProgressListener(progressListener);
			
			// TODO load per level, so first level 0, then 1 etc... These calls should be submitted to the executor only after the previous layer has been submitted
			// Maybe we could load 2 levels at a time, to improve performance... So 0 and 1, as soon as 0 has loaded, start loading 2 etc...
			
			// Traversing breath-first so the big chucks are loaded first
//			for (var l=0; l<=this.octree.deepestLevel; l++) {
//				
//			}
			
		this.tilingRenderLayer.octree.traverseBreathFirst((node) => {
			this.loadTile(node, executor);
		});
	
		executor.awaitTermination().then(() => {
			this.tilingRenderLayer.completelyDone();
//			this.tilingRenderLayer.octree.prepareBreathFirst((node) => {
//				return true;
//			});
			this.viewer.stats.requestUpdate();
			document.getElementById("progress").style.display = "none";
		});	
		return executor.awaitTermination();
	}
}