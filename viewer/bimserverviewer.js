import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {GeometryLoader} from "./geometryloader.js";
import {BimserverGeometryLoader} from "./bimservergeometryloader.js";
import {Viewer} from "./viewer.js";
import {DefaultRenderLayer} from "./defaultrenderlayer.js";
import {TilingRenderLayer} from "./tilingrenderlayer.js";
import {VertexQuantization} from "./vertexquantization.js";
import {Executor} from "./executor.js";
import {Stats} from "./stats.js";
import {DefaultSettings} from "./defaultsettings.js";
import {Utils} from "./utils.js";
import {DataInputStream} from "./datainputstream.js";
import {AbstractViewer} from "./abstractviewer.js";

/*
 * The main class you instantiate when creating a viewer that will be loading data from a BIMserver.
 * This will eventually become a public API
 */

/**
 * @ignore
 */
export class BimServerViewer extends AbstractViewer {
	constructor(settings, canvas, width, height, stats) {
		super(settings, canvas, width, height, stats);
	}

	loadRevisionByRoid(api, roid) {
		return new Promise((resolve, reject) => {
			api.call("ServiceInterface", "listBoundingBoxes", {
				roids: [roid]
			}, (bbs) => {
				if (bbs.length > 1) {
					this.settings.regionSelector(bbs).then((bb) => {
						this.genDensityThreshold(api, [roid], bb).then(resolve);
					});
				} else {
					this.genDensityThreshold(api, [roid], bbs[0]).then(resolve);
				}
			});
		});
	}
	
	unloadRevisionByRoid(roid) {
		const layerSet = this.layers.get(roid);
		if (layerSet) {
			for (var layer of layerSet) {
				this.viewer.renderLayers.delete(layer);
			}
		}
		this.layers.delete(roid);
		this.viewer.dirty = 2;
		
		// TODO probably a good idea to also shrink the model bounds
	}

	loadRevisionsByRoids(api, roids) {
		return this.viewer.init().then(() => {
			return new Promise((resolve, reject) => {
				api.call("ServiceInterface", "listBoundingBoxes", {
					roids: roids
				}, (bbs) => {
					if (bbs.length > 1) {
						this.settings.regionSelector(bbs).then((bb) => {
							this.genDensityThreshold(api, roids, bb).then(resolve);
						});
					} else {
						this.genDensityThreshold(api, roids, bbs[0]).then(resolve);
					}
				});
			});
		});
	}
	
	loadRevision(api, revision) {
		this.loadRevisionByRoid(api, revision.oid);
	}
	
	/*
	 * This will load a BIMserver project. The given argument must be a Project object that is returned by the BIMserver JavaScript API.
	 * 
	 * In later stages much more control will be given to the user, for now the stategy is:
	 * - If this project has no subprojects, we will simply load the latest revision of the project (if available)
	 * - If this project has subprojects, all latest revisions of all subprojects _that have no subprojects_ will be loaded
	 * 
	 */
	loadModel(api, project) {
		return new Promise((resolve, reject) => {
			this.totalStart = performance.now();

			this.viewer.init().then(() => {
				api.call("ServiceInterface", "listBoundingBoxes", {
					roids: [project.lastRevisionId]
				}, (bbs) => {
					if (bbs.length > 1) {
						this.settings.regionSelector(bbs).then((bb) => {
							this.genDensityThreshold(api, [project.lastRevisionId], bb).then(resolve);
						});
					} else {
						this.genDensityThreshold(api, [project.lastRevisionId], bbs[0]).then(resolve);
					}
				});
			});
		});
	}

	genDensityThreshold(api, roids, bb) {
		var roid = roids[0];
		return new Promise((resolve, reject) => {
			api.call("ServiceInterface", "getDensityThreshold", {
				roids: roids,
				nrTriangles: this.viewer.settings.triangleThresholdDefaultLayer,
				excludedTypes: this.settings.excludedTypes
			}, (densityAtThreshold) => {
				this.densityAtThreshold = densityAtThreshold;
				this.densityThreshold = densityAtThreshold.density;
				var nrPrimitivesBelow = densityAtThreshold.trianglesBelow;
				var nrPrimitivesAbove = densityAtThreshold.trianglesAbove;
				
				api.call("ServiceInterface", "getRevision", {
					roid: roid
				}, (revision) => {
					this.internalLoadRevision(api, revision, nrPrimitivesBelow, nrPrimitivesAbove).then(resolve);
				});
			});
		});
	}
	
	/*
	 * Private method
	 */
	internalLoadRevision(api, revision, nrPrimitivesBelow, nrPrimitivesAbove) {
		return new Promise((resolve, reject) => {

			this.revisionId = revision.oid;

			this.viewer.stats.setParameter("Models", "Models to load", 1);

	//		console.log("Total triangles", nrPrimitivesBelow + nrPrimitivesAbove);
			
			var requests = [
				["ServiceInterface", "getTotalBounds", {
					roids: [revision.oid]
				}],
				["ServiceInterface", "getTotalUntransformedBounds", {
					roids: [revision.oid]
				}]
			];
			
			if (this.settings.gpuReuse) {
				requests.push(["ServiceInterface", "getGeometryDataToReuse", {
					roids: [revision.oid],
					excludedTypes: this.settings.excludedTypes,
					trianglesToSave: 0
				}]);
			}
			
			for (var croid of revision.concreteRevisions) {
				requests.push(["ServiceInterface", "getModelBoundsUntransformedForConcreteRevision", {
					croid: croid
				}]);
			}
			for (var croid of revision.concreteRevisions) {
				requests.push(["ServiceInterface", "getModelBoundsForConcreteRevision", {
					croid: croid
				}]);
			}

			api.multiCall(requests, (responses) => {
				var totalBounds = responses[0].result;
				var totalBoundsUntransformed = responses[1].result;
//				console.log(totalBounds, totalBoundsUntransformed);
				if (this.settings.gpuReuse) {
					this.geometryDataIdsToReuse = new Set(responses[2].result);
				} else {
					this.geometryDataIdsToReuse = new Set(); // TODO later make this null, nicer
				}
	//			console.log("Geometry Data IDs to reuse", this.geometryDataIdsToReuse);

				var add = this.settings.gpuReuse ? 3 : 2;
				var modelBoundsUntransformed = new Map();
				for (var i=0; i<(responses.length - add) / 2; i++) {
					modelBoundsUntransformed.set(revision.concreteRevisions[i], responses[i + add].result);
				}
				var modelBoundsTransformed = new Map();
				for (var i=0; i<(responses.length - add) / 2; i++) {
					modelBoundsTransformed.set(revision.concreteRevisions[i], responses[(responses.length - add) / 2 + i + add].result);
				}
				
				var bounds = [
					totalBounds.min.x,
					totalBounds.min.y,
					totalBounds.min.z,
					totalBounds.max.x,
					totalBounds.max.y,
					totalBounds.max.z,
				];
				
				// globalTranslationVector is a translation vector that puts the complete model close to 0, 0, 0
				if (this.viewer.globalTranslationVector == null) {
					this.viewer.globalTranslationVector = vec3.fromValues(
						-(bounds[0] + (bounds[3] - bounds[0]) / 2), 
						-(bounds[1] + (bounds[4] - bounds[1]) / 2), 
						-(bounds[2] + (bounds[5] - bounds[2]) / 2));
				}

				if (this.settings.quantizeVertices || this.settings.loaderSettings.quantizeVertices) {
					if (this.viewer.vertexQuantization == null) {
						this.viewer.vertexQuantization = new VertexQuantization(this.settings);
					}
					for (var croid of modelBoundsUntransformed.keys()) {
						this.viewer.vertexQuantization.generateUntransformedMatrices(croid, modelBoundsUntransformed.get(croid));
					}
					this.viewer.vertexQuantization.generateMatrices(totalBounds, totalBoundsUntransformed, this.viewer.globalTranslationVector);
				}
				
				this.viewer.stats.inc("Primitives", "Primitives to load (L1)", nrPrimitivesBelow);
				this.viewer.stats.inc("Primitives", "Primitives to load (L2)", nrPrimitivesAbove);

				var min = vec3.fromValues(bounds[0], bounds[1], bounds[2]);
				var max = vec3.fromValues(bounds[3], bounds[4], bounds[5]);
				vec3.add(min, min, this.viewer.globalTranslationVector);
				vec3.add(max, max, this.viewer.globalTranslationVector);
				this.viewer.setModelBounds([min[0], min[1], min[2], max[0], max[1], max[2]]);
				
				// TODO This is very BIMserver specific, clutters the code, should move somewhere else (maybe BimserverGeometryLoader)
				var fieldsToInclude = ["indices"];
				fieldsToInclude.push("colorPack");
				if (this.settings.loaderSettings.quantizeNormals) {
					if (this.settings.loaderSettings.prepareBuffers) {
						fieldsToInclude.push("normals");
						fieldsToInclude.push("normalsQuantized");
					} else {
						fieldsToInclude.push("normalsQuantized");
					}
				} else {
					fieldsToInclude.push("normals");
				}
				if (this.settings.loaderSettings.quantizeVertices) {
					if (this.settings.loaderSettings.prepareBuffers) {
						fieldsToInclude.push("vertices");
						fieldsToInclude.push("verticesQuantized");
					} else {
						fieldsToInclude.push("verticesQuantized");
					}
				} else {
					fieldsToInclude.push("vertices");
				}
				if (this.settings.loaderSettings.generateLineRenders) {
					fieldsToInclude.push("lineIndices");
				}
				if (!this.settings.loaderSettings.useObjectColors) {
					fieldsToInclude.push("colorsQuantized");
					fieldsToInclude.push("colorsQuantized");
				}
				
				var promise = Promise.resolve();
				
				const layerSet = new Set();
				this.layers.set(revision.oid, layerSet);
				
				if (this.viewer.settings.defaultLayerEnabled && nrPrimitivesBelow) {
					var defaultRenderLayer = new DefaultRenderLayer(this.viewer, this.geometryDataIdsToReuse);
					layerSet.add(defaultRenderLayer);
					this.viewer.renderLayers.add(defaultRenderLayer);

					defaultRenderLayer.setProgressListener((nrTrianglesLoaded, nrLinesLoaded) => {
						var percentage = 100 * nrTrianglesLoaded / nrPrimitivesBelow;
						this.updateProgress(percentage);
					});

					promise = this.loadDefaultLayer(api, defaultRenderLayer, revision.oid, fieldsToInclude);
				}

				promise.then(() => {
					this.viewer.dirty = 2;
					var tilingPromise = Promise.resolve();
					if (this.viewer.settings.tilingLayerEnabled && nrPrimitivesAbove > 0) {
						var tilingRenderLayer = new TilingRenderLayer(this.viewer, this.geometryDataIdsToReuse, bounds);
						layerSet.add(tilingRenderLayer);
						this.viewer.renderLayers.add(tilingRenderLayer);
						
						tilingPromise = this.loadTilingLayer(api, tilingRenderLayer, revision, bounds, fieldsToInclude);
					}
					tilingPromise.then(() => {
						this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
						if (this.viewer.bufferSetPool != null) {
							this.viewer.bufferSetPool.cleanup();
						}
						this.viewer.dirty = 2;

						resolve();
					});
				});
			});
		});
	}
	
	loadDefaultLayer(api, defaultRenderLayer, roid, fieldsToInclude) {
//		document.getElementById("progress").style.display = "block";
		var startLayer1 = performance.now();

		var start = performance.now();
		var executor = new Executor(4);

		const loaderSettings = JSON.parse(JSON.stringify(this.settings.loaderSettings)); // copy

		loaderSettings.globalTranslationVector = Utils.toArray(this.viewer.globalTranslationVector);
		
		var query = {
			doublebuffer: false,
			type: {
				name: "IfcProduct",
				includeAllSubTypes: true,
				exclude: this.settings.excludedTypes
			},
			tiles: {
				ids: [0],
				densityLowerThreshold: this.densityThreshold,
				densityUpperThreshold: -1,
				reuseLowerThreshold: -1,
				geometryDataToReuse: this.geometryDataIdsToReuse ? Array.from(this.geometryDataIdsToReuse) : null,
				maxDepth: 0
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
			loaderSettings: loaderSettings
		};
		
		if (this.settings.loaderSettings.quantizeVertices) {
			query.loaderSettings.vertexQuantizationMatrix = this.viewer.vertexQuantization.vertexQuantizationMatrixWithGlobalTranslation;
		}
		
		var geometryLoader = new BimserverGeometryLoader(0, api, defaultRenderLayer, [roid], this.settings.loaderSettings, null, this.stats, this.settings, query, null, defaultRenderLayer.gpuBufferManager);
		if (this.settings.loaderSettings.quantizeVertices) {
			geometryLoader.unquantizationMatrix = this.viewer.vertexQuantization.inverseVertexQuantizationMatrixWithGlobalTranslation;
		}
		defaultRenderLayer.registerLoader(geometryLoader.loaderId);
		executor.add(geometryLoader).then(() => {
			defaultRenderLayer.done(geometryLoader.loaderId);
			this.viewer.stats.inc("Models", "Models loaded", 1);
		});
		
		executor.awaitTermination().then(() => {
			this.viewer.stats.setParameter("Loading time", "Layer 1", performance.now() - start);
			defaultRenderLayer.completelyDone();
			this.viewer.stats.requestUpdate();
			this.viewer.dirty = 2;
		});
		return executor.awaitTermination();
	}
}
