import RenderLayer from './renderlayer.js'
import Octree from './octree.js'
import Frustum from './frustum.js'
import LineBoxGeometry from './lineboxgeometry.js'
import BufferManagerTransparencyOnly from './buffermanagertransparencyonly.js'
import BufferManagerPerColor from './buffermanagerpercolor.js'
import Utils from './utils.js'
import TileLoader from './tileloader.js'
import ReuseLoader from './reuseloader.js'

export default class TilingRenderLayer extends RenderLayer {
	constructor(viewer, geometryDataToReuse, bounds) {
		super(viewer, geometryDataToReuse);

		this.octree = new Octree(bounds, viewer.settings.maxOctreeDepth);
		this.lineBoxGeometry = new LineBoxGeometry(viewer, viewer.gl);

		this.loaderToNode = {};

		this.drawTileBorders = true;

		this._frustum = new Frustum();
		
		window.tilingRenderLayer = this;
		
		this.enabled = false;
		
		this.show = "none";
		this.initialLoad = "none";
	}
	
	showAll() {
		this.show = "all";
		this.viewer.dirty = true;
	}

	load(bimServerApi, densityThreshold, roids, fieldsToInclude, progressListener) {
		var reuseLowerThreshold = this.settings.loaderSettings.reuseThreshold;
		if (!this.settings.loaderSettings.tilingLayerReuse) {
			reuseLowerThreshold = -1;
		}
		this.tileLoader = new TileLoader(this, this.viewer, bimServerApi, densityThreshold, reuseLowerThreshold, this.geometryDataToReuse, roids, fieldsToInclude);
		if (this.settings.loaderSettings.tilingLayerReuse) {
			this.reuseLoader = new ReuseLoader(this.viewer, reuseLowerThreshold, bimServerApi, fieldsToInclude, roids, this.tileLoader.quantizationMap, this.geometryCache, this.geometryDataToReuse);
		}

		var promise = new Promise((resolve, reject) => {
			var init = this.tileLoader.initialize().then(() => {
				this.enabled = true;
				if (this.initialLoad == "all") {
					return this.tileLoader.loadAll(progressListener);
				}
				resolve();
			});
		});
		return promise;
	}

	cull(node) {
		// 1. Are we always showing all objects?
		if (this.show == "all") {
			return false;
		}

		// 2. Is the complete Tile outside of the view frustum?
		var isect = this._frustum.intersectsWorldAABB(node.bounds);

		if (isect === Frustum.OUTSIDE_FRUSTUM) {
			return true;
		}

		// 3. In the tile too far away?
		var cameraEye = this.viewer.camera.eye;
		var tileCenter = node.getCenter();
		var sizeFactor = 1 / Math.pow(2, node.level);
		if (vec3.distance(cameraEye, tileCenter) / sizeFactor > 2000000) { // TODO use something related to the total bounding box size
			return true;
		}

		// Default response
		return false;
	}

	renderBuffers(transparency, reuse) {
		// TODO when navigation is active (rotating, panning etc...), this would be the place to decide to for example not-render anything in this layer, or maybe apply more aggressive culling
//		if (this.viewer.navigationActive) {
//			return;
//		}
		
		// TODO would be nicer if this was passed as an integer argument, indicating the iteration count of this frame
		var firstRunOfFrame = !transparency && !reuse;

		var renderingTiles = 0;
		var renderingTriangles = 0;
		var drawCalls = 0;

		var programInfo = this.viewer.programManager.getProgram({
			picking: false,
			instancing: reuse,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
		});
		this.gl.useProgram(programInfo.program);
		// TODO find out whether it's possible to do this binding before the program is used (possibly just once per frame, and better yet, a different location in the code)
		this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, programInfo.uniformBlocks.LightData, this.viewer.lighting.lightingBuffer);
		
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewNormalMatrix, false, this.viewer.camera.viewNormalMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);
		if (this.settings.quantizeVertices) {
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
		}

		if (firstRunOfFrame) { // Saves us from initializing two times per frame
			this._frustum.init(this.viewer.camera.viewMatrix, this.viewer.camera.projMatrix);
		}

		this.octree.traverse((node) => {
			// TODO at the moment a list (of non-empty tiles) is used to do traverseBreathFirst, but since a big optimization is possible by automatically culling 
			// child nodes of parent nodes that are culled, we might have to reconsider this and go back to tree-traversal, where returning false would indicate to 
			// skip the remaining child nodes

			if (firstRunOfFrame) {
				if (this.cull(node)) {
					node.visibilityStatus = 0;
					return;
				} else {
					node.visibilityStatus = 1;
					renderingTiles++;
					if (node.stats != null) {
						renderingTriangles += node.stats.triangles;
						drawCalls += node.stats.drawCallsPerFrame;
					}
					if (node.loadingStatus == 0) {
						this.tileLoader.loadTile(node);
					}
				}
			}

			if (node.visibilityStatus == 1) {
				if (node.gpuBufferManager == null) {
					// Not initialized yet
					return;
				}

				var buffers = node.gpuBufferManager.getBuffers(transparency, reuse);

				this.renderFinalBuffers(buffers, programInfo);
			}
		});

		if (firstRunOfFrame) {
			this.viewer.stats.setParameter("Drawing", "Draw calls per frame (L2)", drawCalls);
			this.viewer.stats.setParameter("Drawing", "Triangles to draw (L2)", renderingTriangles);
			this.viewer.stats.setParameter("Tiling", "Rendering", renderingTiles);
		}

		if (transparency && !reuse && this.drawTileBorders) {
			// The lines are rendered in the transparency-phase only
			this.lineBoxGeometry.renderStart();
			this.octree.traverse((node) => {
				var color = null;
				if (node.loadingStatus == 0) {
					// No visualisation, node is not empty (or parent node)
				} else if (node.loadingStatus == 1) {
					// Node is waiting to start loading
					color = [1, 0, 0, 0.5];
				} else if (node.loadingStatus == 2) {
					// Node is loading
				} else if (node.loadingStatus == 3) {
					// Node is loaded
					if (node.visibilityStatus == 0) {
						color = [0, 1, 0, 0.5];
					} else if (node.visibilityStatus == 1) {
						color = [0, 0, 1, 0.5];
					}
				} else if (node.loadingStatus == 4) {
					color = [0.5, 0.5, 0.5, 0.5];
				} else if (node.loadingStatus == 5) {
					// Node has been tried to load, but no objects were returned
				}
				if (color != null) {
					this.lineBoxGeometry.render(color, node.getMatrix());
				}
			});
			this.lineBoxGeometry.renderStop();
		}
	}

	pickBuffers(transparency, reuse) {
		var firstRunOfFrame = !transparency && !reuse;
		var programInfo = this.viewer.programManager.getProgram({
			picking: true,
			instancing: reuse,
			useObjectColors: !!this.settings.useObjectColors,
			quantizeNormals: false,
			quantizeVertices: !!this.settings.quantizeVertices,
			quantizeColors: false
		});
		this.gl.useProgram(programInfo.program);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);
		if (this.settings.quantizeVertices) {
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
		}
		if (firstRunOfFrame) { // Saves us from initializing two times per frame
			this._frustum.init(this.viewer.camera.viewMatrix, this.viewer.camera.projMatrix);
		}
		this.octree.traverse((node) => {
			if (firstRunOfFrame) {
				if (this.cull(node)) {
					node.visibilityStatus = 0; // TODO: Should this be updated on pick?
					return;
				} else {
					node.visibilityStatus = 1;
					if (node.loadingStatus == 0) {
						this.tileLoader.loadTile(node); // TODO: On-demand loading make sense for picking?
					}
				}
			}
			if (node.visibilityStatus == 1) {
				if (node.gpuBufferManager == null) {
					// Not initialized yet
					return;
				}
				var buffers = node.gpuBufferManager.getBuffers(transparency, reuse);
				this.pickFinalBuffers(buffers, programInfo);
			}
		});
	}

	addGeometry(loaderId, geometry, object) {
		var sizes = {
			vertices: geometry.positions.length,
			normals: geometry.normals.length,
			indices: geometry.indices.length,
			colors: (geometry.colors != null ? geometry.colors.length : 0)
		};

		// TODO some of this is duplicate code, also in defaultrenderlayer.js
		if (geometry.reused > 1 && this.geometryDataToReuse.has(geometry.id)) {
			geometry.matrices.push(object.matrix);

			this.viewer.stats.inc("Drawing", "Triangles to draw", geometry.indices.length / 3);

			return;
		}

		var node = this.loaderToNode[loaderId];
		
		if (node.bufferManager == null) {
			if (this.settings.useObjectColors) {
				node.bufferManager = new BufferManagerPerColor(this.viewer.settings, this, this.viewer.bufferSetPool);
			} else {
				node.bufferManager = new BufferManagerTransparencyOnly(this.viewer.settings, this, this.viewer.bufferSetPool);
			}
		}
		var buffer = node.bufferManager.getBufferSet(geometry.hasTransparency, geometry.color, sizes);
		buffer.node = node;
		
		super.addGeometry(loaderId, geometry, object, buffer, sizes);
	}
	
	dump() {
		console.log(this.tileLoader.executor);
	}
	
	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, scaleMatrix, hasTransparency, type, aabb) {
		var loader = this.getLoader(loaderId);
		var node = this.loaderToNode[loaderId];
		return super.createObject(loaderId, roid, oid, objectId, geometryIds, matrix, scaleMatrix, hasTransparency, type, aabb, node.gpuBufferManager);
	}

	addGeometryReusable(geometry, loader, gpuBufferManager) {
		super.addGeometryReusable(geometry, loader, gpuBufferManager);
		var node = this.loaderToNode[loader.loaderId];
		node.stats.triangles += ((geometry.indices.length / 3) * (geometry.matrices.length));
		node.stats.drawCallsPerFrame++;
	}

	done(loaderId) {
		var loader = this.getLoader(loaderId);
		var node = this.loaderToNode[loaderId];

		for (var geometry of loader.geometries.values()) {
			if (geometry.isReused) {
				this.addGeometryReusable(geometry, loader, node.gpuBufferManager);
			}
		}
		
		var bufferManager = node.bufferManager;
		if (bufferManager != null) {
			for (var buffer of bufferManager.getAllBuffers()) {
				this.flushBuffer(buffer);
			}
			bufferManager.clear();
			node.bufferManager = null;
		}

		for (var object of loader.objects.values()) {
			object.add = null;
		}

		var savedBuffers = node.gpuBufferManager.combineBuffers();
		this.viewer.stats.dec("Drawing", "Draw calls per frame (L2)", savedBuffers);
		this.viewer.stats.dec("Buffers", "Buffer groups", savedBuffers);
		node.stats.drawCallsPerFrame -= savedBuffers;

		this.removeLoader(loaderId);
	}

	flushAllBuffers() {
		this.octree.traverse((node) => {
			var bufferManager = node.bufferManager;
			if (bufferManager != null) {
				for (var buffer of bufferManager.getAllBuffers()) {
					this.flushBuffer(buffer);
				}
				if (this.settings.useObjectColors) {
					// When using object colors, it makes sense to sort the buffers by color, so we can potentially skip a few uniform binds
					// It might be beneficiary to do this sorting on-the-lfy and not just when everything is loaded

					// TODO disabled for now since we are testing combining buffer, which makes this obsolete
//					this.sortBuffers(node.liveBuffers);
				}
			}
		}, false);
	}
	
	flushBuffer(buffer) {
		var node = buffer.node;
		super.flushBuffer(buffer, node.gpuBufferManager)

		node.stats.triangles += buffer.nrIndices / 3;
		node.stats.drawCallsPerFrame++;

		node.bufferManager.resetBuffer(buffer);
		this.viewer.dirty = true;
	}

	completelyDone() {
		this.flushAllBuffers();
		this.viewer.dirty = true;
	}
}