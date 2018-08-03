import Viewer from './viewer.js'
import DebugRenderLayer from './debugrenderlayer.js'
import DefaultRenderLayer from './defaultrenderlayer.js'
import TilingRenderLayer from './tilingrenderlayer.js'
import VertexQuantization from './vertexquantization.js'
import WorkForce from './workforce.js'
import Executor from './executor.js'
import GeometryLoader from "./geometryloader.js"
import VirtualFrustum from "./virtualfrustum.js"
import BufferHelper from "./bufferhelper.js"
import Stats from "./stats.js"

export default class BimServerViewer {
	constructor(bimServerApi, settings, canvas, width, height, stats) {
		if (stats == null) {
			stats = new Stats(false);
		}

		this.canvas = canvas;

		this.viewer = new Viewer(canvas, settings, stats, window.innerWidth, window.innerHeight);
		this.settings = settings;
		this.bimServerApi = bimServerApi;
		this.stats = stats;
		this.width = width;
		this.height = height;
		
		this.applyDefaultSettings(settings);
		
		stats.setParameter("Renderer settings", "Object colors", this.settings.useObjectColors);
		stats.setParameter("Renderer settings", "Small indices if possible", this.settings.useSmallIndicesIfPossible);
		stats.setParameter("Renderer settings", "Quantize normals", this.settings.quantizeNormals);
		stats.setParameter("Renderer settings", "Quantize vertices", this.settings.quantizeVertices);

		stats.setParameter("Loader settings", "Object colors", this.settings.loaderSettings.useObjectColors);
		stats.setParameter("Loader settings", "Quantize normals", this.settings.loaderSettings.quantizeNormals);
		stats.setParameter("Loader settings", "Quantize vertices", this.settings.loaderSettings.quantizeVertices);

		this.resizeCanvas();
		window.addEventListener("resize", () => {
			this.resizeCanvas();
		}, false);
	}
	
	applyDefaultSettings(settings) {
		if (settings.useObjectColors == null) {
			settings.useObjectColors = false;
		}
		if (settings.useSmallIndicesIfPossible == null) {
			settings.useSmallIndicesIfPossible = true;
		}
		if (settings.quantizeNormals == null) {
			settings.quantizeNormals = true;
		}
		if (settings.quantizeVertices == null) {
			settings.quantizeVertices = true;
		}
		if (settings.quantizeColors == null) {
			settings.quantizeColors = true;
		}
		if (settings.loaderSettings == null) {
			settings.loaderSettings = {};
		}
		if (settings.loaderSettings.useObjectColors == null) {
			settings.loaderSettings.useObjectColors = false;
		}
		if (settings.loaderSettings.quantizeNormals == null) {
			settings.loaderSettings.quantizeNormals = true;
		}
		if (settings.loaderSettings.quantizeVertices == null) {
			settings.loaderSettings.quantizeVertices = true;
		}
		if (settings.loaderSettings.quantizeColors == null) {
			settings.loaderSettings.quantizeColors = true;
		}
		if (settings.triangleThresholdDefaultLayer == null) {
			settings.triangleThresholdDefaultLayer = 1000000;
		}
		if (settings.assumeGpuMemoryAvailable == null) {
			settings.assumeGpuMemoryAvailable = 1000000000;
		}
		if (settings.defaultLayerEnabled == null) {
			settings.defaultLayerEnabled = true;
		}
		if (settings.fakeLoader == null) {
			settings.fakeLoading = false;
		}
		if (settings.loaderSettings.splitGeometry == null) {
			settings.loaderSettings.splitGeometry = false;
		}
		if (settings.loaderSettings.normalizeUnitsToMM == null) {
			settings.loaderSettings.normalizeUnitsToMM = true;
		}
		if (settings.loaderSettings.useSmallInts == null) {
			settings.loaderSettings.useSmallInts = false;
		}
		if (settings.loaderSettings.reportProgress == null) {
			settings.loaderSettings.reportProgress = false;
		}
		if (settings.viewerBasePath == null) {
			settings.viewerBasePath = "./";
		}
		if (settings.regionSelector == null) {
			settings.regionSelector = (bbs) => {
				return bbs[0];
			};
		}
	}

	resizeCanvas() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.viewer.setDimensions(this.canvas.width, this.canvas.height);
	}
	
	/*
	 * This will load a BIMserver project. The given argument must be a Project object that is returned by the BIMserver JavaScript API.
	 * 
	 * In later stages much more control will be given to the user, for now the stategy is:
	 * - If this project has no subprojects, we will simply load the latest revision of the project (if available)
	 * - If this project has subprojects, all latest revisions of all subprojects _that have no subprojects_ will be loaded
	 * 
	 * All objects will be loaded except IfcOpeningElement and IfcSpace (these exclusions for now are in the GeometryLoader)
	 * 
	 */
	loadModel(project) {
		this.totalStart = performance.now();

		this.viewer.init().then(() => {
			this.bimServerApi.call("ServiceInterface", "listBoundingBoxes", {
				roids: [project.lastRevisionId]
			}, (bbs) => {
				if (bbs.length > 1) {
					this.settings.regionSelector().then((bb) => {
						this.genDensityThreshold(project, bb);
					});
				} else {
					this.genDensityThreshold(project, bbs[0]);
				}
			});
		});
	}

	genDensityThreshold(project, bb) {
		this.bimServerApi.call("ServiceInterface", "getDensityThreshold", {
			roid: project.lastRevisionId,
			nrTriangles: this.viewer.settings.triangleThresholdDefaultLayer,
			excludedTypes: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"]
		}, (densityAtThreshold) => {
			this.densityAtThreshold = densityAtThreshold;
			this.densityThreshold = densityAtThreshold.density;
			var nrPrimitivesBelow = densityAtThreshold.trianglesBelow;
			var nrPrimitivesAbove = densityAtThreshold.trianglesAbove;
			
			this.bimServerApi.call("ServiceInterface", "getRevision", {
				roid: project.lastRevisionId
			}, (revision) => {
				this.loadRevision(revision, nrPrimitivesBelow, nrPrimitivesAbove);
			});
		});
	}
	
	/*
	 * Private method
	 */
	loadRevision(revision, nrPrimitivesBelow, nrPrimitivesAbove) {
		this.viewer.stats.setParameter("Models", "Models to load", 1);

		console.log("Total triangles", nrPrimitivesBelow + nrPrimitivesAbove);
		var estimatedNonReusedByteSize = BufferHelper.trianglesToBytes(this.settings, nrPrimitivesBelow + nrPrimitivesAbove);
		
		console.log("Estimated non reuse byte size", estimatedNonReusedByteSize);
		console.log("GPU memory available", this.settings.assumeGpuMemoryAvailable);
		
		var requests = [
			["ServiceInterface", "getTotalBounds", {
				roids: [revision.oid]
			}],
			["ServiceInterface", "getTotalUntransformedBounds", {
				roids: [revision.oid]
			}],
			["ServiceInterface", "getGeometryDataToReuse", {
				roids: [revision.oid],
				excludedTypes: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"],
				trianglesToSave: BufferHelper.bytesToTriangles(this.settings, Math.max(0, estimatedNonReusedByteSize - this.settings.assumeGpuMemoryAvailable))
			}]
		];
		
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

		this.debugRenderLayer = new DebugRenderLayer(this.viewer);
		this.viewer.renderLayers.push(this.debugRenderLayer);
		
		const fieldOfView = 45 * Math.PI / 180;
		const aspect = this.width / this.height;
		const zNear = 1;
		const zFar = 50.0;

//		var virtualProjectionMatrix = mat4.create();
//		mat4.perspective(virtualProjectionMatrix, fieldOfView, aspect, zNear, zFar);
//		this.debugRenderLayer.addVirtualFrustum(new VirtualFrustum(this.viewer, virtualProjectionMatrix, zNear, zFar));
		
		this.bimServerApi.multiCall(requests, (responses) => {
			var totalBounds = responses[0].result;
			var totalBoundsUntransformed = responses[1].result;
			this.geometryDataIdsToReuse = new Set(responses[2].result);
//			console.log("Geometry Data IDs to reuse", this.geometryDataIdsToReuse);

			var modelBoundsUntransformed = new Map();
			for (var i=0; i<(responses.length - 3) / 2; i++) {
				modelBoundsUntransformed.set(revision.concreteRevisions[i], responses[i + 3].result);
			}
			var modelBoundsTransformed = new Map();
			for (var i=0; i<(responses.length - 3) / 2; i++) {
				modelBoundsTransformed.set(revision.concreteRevisions[i], responses[(responses.length - 3) / 2 + i + 3].result);
			}
			
			if (this.settings.quantizeVertices || this.settings.loaderSettings.quantizeVertices) {
				this.viewer.vertexQuantization = new VertexQuantization(this.settings);
				for (var croid of modelBoundsUntransformed.keys()) {
					this.viewer.vertexQuantization.generateUntransformedMatrices(croid, modelBoundsUntransformed.get(croid));
				}
				this.viewer.vertexQuantization.generateMatrices(totalBounds, totalBoundsUntransformed);
			}

			var bounds = [
				totalBounds.min.x,
				totalBounds.min.y,
				totalBounds.min.z,
				totalBounds.max.x,
				totalBounds.max.y,
				totalBounds.max.z,
				];
			
//			this.workforce = new WorkForce();

			this.viewer.stats.inc("Primitives", "Primitives to load (L1)", nrPrimitivesBelow);
			this.viewer.stats.inc("Primitives", "Primitives to load (L2)", nrPrimitivesAbove);

			this.viewer.setModelBounds(bounds);

			
			// TODO This is very BIMserver specific, clutters the code, should move somewhere else (maybe GeometryLoader)
			var fieldsToInclude = ["indices"];
			if (this.settings.loaderSettings.quantizeNormals) {
				fieldsToInclude.push("normalsQuantized");
			} else {
				fieldsToInclude.push("normals");
			}
			if (this.settings.loaderSettings.quantizeVertices) {
				fieldsToInclude.push("verticesQuantized");
			} else {
				fieldsToInclude.push("vertices");
			}
			if (!this.settings.loaderSettings.useObjectColors) {
				fieldsToInclude.push("colorsQuantized");
			}
			
			var promise = Promise.resolve();
			if (this.viewer.settings.defaultLayerEnabled && nrPrimitivesBelow) {
				var defaultRenderLayer = new DefaultRenderLayer(this.viewer, this.geometryDataIdsToReuse);
				this.viewer.renderLayers.push(defaultRenderLayer);

				defaultRenderLayer.setProgressListener((nrPrimitivesLoaded) => {
					var percentage = 100 * nrPrimitivesLoaded / nrPrimitivesBelow;
					document.getElementById("progress").style.width = percentage + "%";
				});

				promise = this.loadDefaultLayer(defaultRenderLayer, revision, bounds, fieldsToInclude);
			}

			promise.then(() => {
				this.viewer.dirty = true;
				var tilingPromise = Promise.resolve();
				if (this.viewer.settings.tilingLayerEnabled && nrPrimitivesAbove > 0) {
					var tilingRenderLayer = new TilingRenderLayer(this.viewer, this.geometryDataIdsToReuse, bounds);
					this.viewer.renderLayers.push(tilingRenderLayer);
					
					tilingPromise = this.loadTilingLayer(tilingRenderLayer, revision, bounds, fieldsToInclude);
				}
				tilingPromise.then(() => {
					this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
					this.viewer.bufferSetPool.cleanup();
					this.viewer.dirty = true;
				});
			});
		});
	}
	
	loadDefaultLayer(defaultRenderLayer, revision, totalBounds, fieldsToInclude) {
		document.getElementById("progress").style.display = "block";

		var startLayer1 = performance.now();

		var start = performance.now();
		var executor = new Executor(4);

		var query = {
			type: {
				name: "IfcProduct",
				includeAllSubTypes: true,
				exclude: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"]
			},
			tiles: {
				ids: [0],
				densityLowerThreshold: this.densityThreshold,
				densityUpperThreshold: -1,
				reuseLowerThreshold: -1,
				geometryDataToReuse: [],
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
			loaderSettings: JSON.parse(JSON.stringify(this.settings.loaderSettings))
		};

		var geometryLoader = new GeometryLoader(0, this.bimServerApi, defaultRenderLayer, [revision.oid], this.settings.loaderSettings, null, this.stats, this.settings, query);
		defaultRenderLayer.registerLoader(geometryLoader.loaderId);
		executor.add(geometryLoader).then(() => {
			defaultRenderLayer.done(geometryLoader.loaderId);
			this.viewer.stats.inc("Models", "Models loaded", 1);
		});
		
		executor.awaitTermination().then(() => {
			document.getElementById("progress").style.display = "none";
			this.viewer.stats.setParameter("Loading time", "Layer 1", performance.now() - start);
			defaultRenderLayer.completelyDone();
			console.log("layer 1 done", (performance.now() - startLayer1) + "ms");
			this.viewer.stats.requestUpdate();
		});
		return executor.awaitTermination();
	}

	loadTilingLayer(tilingLayer, revision, totalBounds, fieldsToInclude) {
		var startLayer2 = performance.now();
		document.getElementById("progress").style.display = "block";

		var layer2Start = performance.now();
		
		var p = tilingLayer.load(this.bimServerApi, this.densityThreshold, [revision.oid], fieldsToInclude, (percentage) => {
			document.getElementById("progress").style.width = percentage + "%";
		});
		this.viewer.dirty = true;
		p.then(() => {
			this.viewer.stats.setParameter("Loading time", "Layer 2", performance.now() - layer2Start);
			this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
			document.getElementById("progress").style.display = "none";
			
			this.viewer.bufferSetPool.cleanup();

			console.log("layer 2 done", (performance.now() - startLayer2) + "ms");

//			tilingLayer.octree.traverse((node) => {
//				if (node.liveBuffers.length > 0) {
//					console.log(node.getBounds(), node.liveBuffers.length);
//				}
//			}, true);
		});
		return p;
	}
}