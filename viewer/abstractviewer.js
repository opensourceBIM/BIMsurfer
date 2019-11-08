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

export class AbstractViewer {
	constructor(settings, canvas, width, height, stats) {
		if (stats == null) {
			stats = new Stats(false);
		}
		
		// Necessary for settings
		window.bimServerViewer = this;

		this.canvas = canvas;

		this.settings = settings;
		this.stats = stats;
		
		this.width = width || canvas.clientWidth;
		this.height = height || canvas.clientHeight;
		this.layers = new Map();
		
		this.settings = DefaultSettings.create(settings);

		this.viewer = new Viewer(canvas, settings, stats, this.width, this.height);
		
		stats.setParameter("Renderer settings", "Object colors", this.settings.useObjectColors);
		stats.setParameter("Renderer settings", "Small indices if possible", this.settings.useSmallIndicesIfPossible);
		stats.setParameter("Renderer settings", "Quantize normals", this.settings.quantizeNormals);
		stats.setParameter("Renderer settings", "Quantize vertices", this.settings.quantizeVertices);

		stats.setParameter("Loader settings", "Object colors", this.settings.loaderSettings.useObjectColors);
		stats.setParameter("Loader settings", "Quantize normals", this.settings.loaderSettings.quantizeNormals);
		stats.setParameter("Loader settings", "Quantize vertices", this.settings.loaderSettings.quantizeVertices);

		// Autoresize automatically resizes the viewer to the full width/height of the screen
        if ("OffscreenCanvas" in window && canvas instanceof OffscreenCanvas) {
			
		} else {
			if (this.settings.autoResize) {
				this.autoResizeCanvas();
				this.resizeHandler = () => {
					this.autoResizeCanvas();
				};
				window.addEventListener("resize", this.resizeHandler, false);
			} else {
				this.canvas.width = this.width;
				this.canvas.height = this.height;
				this.resizeHandler = () => {
					this.autoResizeCanvas();
				};
				window.addEventListener("resize", this.resizeHandler, false);
			}
		}
		this.viewer.setDimensions(this.width, this.height);
	}

	loadAnnotationsFromPreparedBufferUrl(url) {
		return Utils.request({url: url, binary: true}).then((buffer)=>{
			let stream = new DataInputStream(buffer);
			const layer = new DefaultRenderLayer(this.viewer);
			const gpuBufferManager = Array.from(this.viewer.renderLayers)[0].gpuBufferManager;
			let loader = new GeometryLoader(null, layer, {quantizeVertices: false}, this.viewer.vertexQuantization, null, this.viewer.settings, null, gpuBufferManager);
			this.viewer.renderLayers.add(layer);
			loader.processPreparedBufferInit(stream, false);
			return loader.processPreparedBuffer(stream, false);
		})
	}

	autoResizeCanvas() {
		this.canvas.width = this.canvas.clientWidth;
		this.canvas.height = this.canvas.clientHeight;
		this.viewer.setDimensions(this.canvas.width, this.canvas.height);
	}

	init() {
		return this.viewer.init();
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
					this.geometryDataIdsToReuse = null;
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
				if (!this.settings.loaderSettings.useObjectColors) {
					fieldsToInclude.push("colorsQuantized");
				}
				
				var promise = Promise.resolve();
				
				const layerSet = new Set();
				this.layers.set(revision.oid, layerSet);
				
				if (this.viewer.settings.defaultLayerEnabled && nrPrimitivesBelow) {
					var defaultRenderLayer = new DefaultRenderLayer(this.viewer, this.geometryDataIdsToReuse);
					layerSet.add(defaultRenderLayer);
					this.viewer.renderLayers.add(defaultRenderLayer);

					defaultRenderLayer.setProgressListener((nrPrimitivesLoaded) => {
						var percentage = 100 * nrPrimitivesLoaded / nrPrimitivesBelow;
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

	findElement(api, globalId) {
		api.call("ServiceInterface", "getOidByGuid", {
			roid: this.revisionId,
			guid: globalId
		}, (oid) => {
			// @todo: This does not work, leaving this for Ruben
			var buffer, desc;
			this.layers.forEach((layer, index) => {
				if ((buffer = layer.uniqueIdToBufferSet.get(oid))) {
					if ((desc = buffer.uniqueIdToIndex.get(oid))) {
						console.log(buffer, desc);
					}
				}
			});
		});
	}
	
	loadTilingLayer(api, tilingLayer, revision, totalBounds, fieldsToInclude) {
		var startLayer2 = performance.now();

		var layer2Start = performance.now();
		
		var p = tilingLayer.load(api, this.densityThreshold, [revision.oid], fieldsToInclude, (percentage) => {
//			document.getElementById("progress").style.width = percentage + "%";
		});
		this.viewer.dirty = 2;
		p.then(() => {
			this.viewer.stats.setParameter("Loading time", "Layer 2", performance.now() - layer2Start);
			this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
//			document.getElementById("progress").style.display = "none";

			if (this.viewer.bufferSetPool != null) {
				this.viewer.bufferSetPool.cleanup();
			}

//			tilingLayer.octree.traverse((node) => {
//				if (node.liveBuffers.length > 0) {
//					console.log(node.getBounds(), node.liveBuffers.length);
//				}
//			}, true);
		});
		return p;
	}
	
	cleanup() {
		window.removeEventListener("resize", this.resizeHandler, false);
		this.viewer.cleanup();
	}
	
	updateProgress(percentage) {
		if (this.progressListener) {
			this.progressListener(percentage);
		}
	}
	
	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
	
	addSelectionListener(selectionListener) {
		this.viewer.addSelectionListener(selectionListener);
	}

}