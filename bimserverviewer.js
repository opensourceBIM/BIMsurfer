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

export default class BimServerViewer {
	constructor(bimServerApi, settings, width, height, stats) {
		this.viewer = new Viewer(settings, stats, window.innerWidth, window.innerHeight);
		this.settings = settings;
		this.bimServerApi = bimServerApi;
		this.stats = stats;
		this.width = width;
		this.height = height;
		
		stats.setParameter("Renderer settings", "Object colors", this.settings.useObjectColors);
		stats.setParameter("Renderer settings", "Small indices if possible", this.settings.useSmallIndicesIfPossible);
		stats.setParameter("Renderer settings", "Quantize normals", this.settings.quantizeNormals);
		stats.setParameter("Renderer settings", "Quantize vertices", this.settings.quantizeVertices);

		stats.setParameter("Loader settings", "Object colors", this.settings.loaderSettings.useObjectColors);
		stats.setParameter("Loader settings", "Quantize normals", this.settings.loaderSettings.quantizeNormals);
		stats.setParameter("Loader settings", "Quantize vertices", this.settings.loaderSettings.quantizeVertices);
		
		this.loaderCounter = 0;
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
			console.log("Geometry Data IDs to reuse", this.geometryDataIdsToReuse);

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

			var promise = Promise.resolve();
			if (this.viewer.settings.defaultLayerEnabled && nrPrimitivesBelow) {
				var defaultRenderLayer = new DefaultRenderLayer(this.viewer, this.geometryDataIdsToReuse);
				this.viewer.renderLayers.push(defaultRenderLayer);

				defaultRenderLayer.setProgressListener((nrPrimitivesLoaded) => {
					var percentage = 100 * nrPrimitivesLoaded / nrPrimitivesBelow;
					document.getElementById("progress").style.width = percentage + "%";
				});

				promise = this.loadDefaultLayer(defaultRenderLayer, projects, bounds);
			}

			promise.then(() => {
				this.viewer.dirty = true;
				var tilingPromise = Promise.resolve();
				if (this.viewer.settings.tilingLayerEnabled && nrPrimitivesAbove > 0) {
					var tilingRenderLayer = new TilingRenderLayer(this.viewer, this.geometryDataIdsToReuse, bounds);
					this.viewer.renderLayers.push(tilingRenderLayer);
					
					tilingPromise = this.loadTilingLayer(tilingRenderLayer, projects, bounds);
				}
				tilingPromise.then(() => {
					this.viewer.stats.setParameter("Loading time", "Total", performance.now() - this.totalStart);
					this.viewer.bufferSetPool.cleanup();
					this.viewer.dirty = true;
				});
			});
		});
	}
	
	loadDefaultLayer(defaultRenderLayer, projects, totalBounds) {
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
			inBoundingBox: {
			    "x": totalBounds[0],
			    "y": totalBounds[1],
			    "z": totalBounds[2],
			    "width": totalBounds[3] - totalBounds[0],
			    "height": totalBounds[4] - totalBounds[1],
			    "depth": totalBounds[5] - totalBounds[2],
			    "partial": true,
			    "densityLowerThreshold": this.densityThreshold
			},
			include: {
				type: "IfcProduct",
				field: "geometry",
				include: {
					type: "GeometryInfo",
					field: "data"
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
		projects.forEach((project) => {
			var geometryLoader = new GeometryLoader(this.loaderCounter++, this.bimServerApi, defaultRenderLayer, [project.lastRevisionId], this.settings.loaderSettings, map, this.stats, this.settings, query);
			defaultRenderLayer.registerLoader(geometryLoader.loaderId);
			executor.add(geometryLoader).then(() => {
				defaultRenderLayer.done(geometryLoader.loaderId);
				this.viewer.stats.inc("Models", "Models loaded");
			});
		});
		
		executor.awaitTermination().then(() => {
			document.getElementById("progress").style.display = "none";
			this.viewer.stats.setParameter("Loading time", "Layer 1", performance.now() - start);
			defaultRenderLayer.completelyDone();
			this.viewer.stats.requestUpdate();
			console.log("layer 1 done", (performance.now() - startLayer1) + "ms");
		});
		return executor.awaitTermination();
	}

	loadTilingLayer(tilingLayer, projects, totalBounds) {
		var startLayer2 = performance.now();
		document.getElementById("progress").style.display = "block";

		var layer2Start = performance.now();
		
		var roids = [];
		for (var project of projects) {
			roids.push(project.lastRevisionId);
		}
		
		var p = tilingLayer.load(this.bimServerApi, this.densityThreshold, roids, (percentage) => {
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