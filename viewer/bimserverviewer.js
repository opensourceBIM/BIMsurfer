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

			var projectsToLoad = [];

			this.bimServerApi.call("ServiceInterface", "getDensityThreshold", {
				roid: project.lastRevisionId,
				nrTriangles: this.viewer.settings.triangleThresholdDefaultLayer,
				excludedTypes: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"]
			}, (densityAtThreshold) => {
				this.densityAtThreshold = densityAtThreshold;
				this.densityThreshold = densityAtThreshold.density;
				var nrPrimitivesBelow = densityAtThreshold.trianglesBelow;
				var nrPrimitivesAbove = densityAtThreshold.trianglesAbove;
				
				console.log(nrPrimitivesBelow, nrPrimitivesAbove);
					
				this.bimServerApi.call("ServiceInterface", "getRevision", {
					roid: project.lastRevisionId
				}, (revision) => {
					if (project.subProjects.length == 0) {
						if (project.lastRevisionId != -1) {
							projectsToLoad.push(project);
							this.loadModels(projectsToLoad, nrPrimitivesBelow, nrPrimitivesAbove);
						}
					} else {
						this.bimServerApi.call("ServiceInterface", "getAllRelatedProjects", {poid: project.oid}, (projects) => {
							projects.forEach((subProject) => {
								if (subProject.oid != project.oid && subProject.nrSubProjects == 0) {
									if (subProject.lastRevisionId != -1) {
										projectsToLoad.push(subProject);
									}
								}
							});
							this.loadModels(projectsToLoad, nrPrimitivesBelow, nrPrimitivesAbove);
						});
					}
				});
			});
		});
	}
	
	/*
	 * Private method
	 */
	loadModels(projects, nrPrimitivesBelow, nrPrimitivesAbove) {
		this.viewer.stats.setParameter("Models", "Models to load", projects.length);

		var roids = projects.map((project) => {
			return project.lastRevisionId;
		});

		console.log("Total triangles", nrPrimitivesBelow + nrPrimitivesAbove);
		var estimatedNonReusedByteSize = BufferHelper.trianglesToBytes(this.settings, nrPrimitivesBelow + nrPrimitivesAbove);
		
		console.log("Estimated non reuse byte size", estimatedNonReusedByteSize);
		console.log("GPU memory available", this.settings.assumeGpuMemoryAvailable);
		
		var requests = [
			["ServiceInterface", "getTotalBounds", {
				roids: roids
			}],
			["ServiceInterface", "getTotalUntransformedBounds", {
				roids: roids
			}],
			["ServiceInterface", "getGeometryDataToReuse", {
				roids: roids,
				excludedTypes: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"],
				trianglesToSave: BufferHelper.bytesToTriangles(this.settings, Math.max(0, estimatedNonReusedByteSize - this.settings.assumeGpuMemoryAvailable))
			}]
		];
		
		roids.forEach((roid) => {
			requests.push(["ServiceInterface", "getModelBoundsUntransformed", {
				roid: roid
			}]);
		});
		roids.forEach((roid) => {
			requests.push(["ServiceInterface", "getModelBounds", {
				roid: roid
			}]);
		});

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
				modelBoundsUntransformed.set(roids[i], responses[i + 3].result);
			}
			var modelBoundsTransformed = new Map();
			for (var i=0; i<(responses.length - 3) / 2; i++) {
				modelBoundsTransformed.set(roids[i], responses[(responses.length - 3) / 2 + i + 3].result);
			}
			
			if (this.settings.quantizeVertices || this.settings.loaderSettings.quantizeVertices) {
				this.viewer.vertexQuantization = new VertexQuantization(this.settings);
				for (var roid of modelBoundsUntransformed.keys()) {
					this.viewer.vertexQuantization.generateUntransformedMatrices(roid, modelBoundsUntransformed.get(roid));
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

				promise = this.loadDefaultLayer(defaultRenderLayer, projects, bounds, fieldsToInclude);
			}

			promise.then(() => {
				this.viewer.dirty = true;
				var tilingPromise = Promise.resolve();
				if (this.viewer.settings.tilingLayerEnabled && nrPrimitivesAbove > 0) {
					var tilingRenderLayer = new TilingRenderLayer(this.viewer, this.geometryDataIdsToReuse, bounds);
					this.viewer.renderLayers.push(tilingRenderLayer);
					
					tilingPromise = this.loadTilingLayer(tilingRenderLayer, projects, bounds, fieldsToInclude);
				}
				tilingPromise.then(() => {
					this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
					this.viewer.bufferSetPool.cleanup();
					this.viewer.dirty = true;
				});
			});
		});
	}
	
	loadDefaultLayer(defaultRenderLayer, projects, totalBounds, fieldsToInclude) {
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
		
		if (this.viewer.vertexQuantization) {
			var map = {}
			for (var project of projects) {
				map[project.lastRevisionId] = this.viewer.vertexQuantization.getUntransformedVertexQuantizationMatrixForRoid(project.lastRevisionId);
			}
		}
		
		// TODO maybe it will be faster to just use one loader instead of potentially 180 loaders, this will however lead to more memory used because loaders can't be closed when they are done
		// Later: This seems to make no difference...
		
		var roids = [];
		for (var project of projects) {
			roids.push(project.lastRevisionId);
		}
		
		var geometryLoader = new GeometryLoader(0, this.bimServerApi, defaultRenderLayer, roids, this.settings.loaderSettings, map, this.stats, this.settings, query);
		defaultRenderLayer.registerLoader(geometryLoader.loaderId);
		executor.add(geometryLoader).then(() => {
			defaultRenderLayer.done(geometryLoader.loaderId);
			this.viewer.stats.inc("Models", "Models loaded", roids.length);
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

	loadTilingLayer(tilingLayer, projects, totalBounds, fieldsToInclude) {
		var startLayer2 = performance.now();
		document.getElementById("progress").style.display = "block";

		var layer2Start = performance.now();
		
		var roids = [];
		for (var project of projects) {
			roids.push(project.lastRevisionId);
		}
		
		var p = tilingLayer.load(this.bimServerApi, this.densityThreshold, roids, fieldsToInclude, (percentage) => {
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