import {RenderLayer} from './renderlayer.js'
import {Octree} from './octree.js'
import {Frustum} from './frustum.js'
import {LineBoxGeometry} from './lineboxgeometry.js'
import {BufferManagerTransparencyOnly} from './buffermanagertransparencyonly.js'
import {BufferManagerPerColor} from './buffermanagerpercolor.js'
import {Utils} from './utils.js'
import {TileLoader} from './tileloader.js'
import {ReuseLoader} from './reuseloader.js'

/**
 * A specific type of RenderLayer, which uses Tiling to achieve better render performance, but also minimizes the amount of data that needs to be loaded of the line.
 * 
 */
export class TilingRenderLayer extends RenderLayer {
	constructor(viewer, geometryDataToReuse, bounds) {
		super(viewer, geometryDataToReuse);

		this.octree = new Octree(viewer, bounds, viewer.globalTransformation, viewer.settings.maxOctreeDepth);
		this.lineBoxGeometry = new LineBoxGeometry(viewer, viewer.gl);

		this.loaderToNode = {};

		this.drawTileBorders = this.viewer.settings.realtimeSettings.drawTileBorders;

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
				// Ugly way of triggering an octree-visibility update
				this.lastViewMatrix = null;
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
		var isect = this._frustum.intersectsWorldAABB(node.normalizedBoundsVectors);

		if (isect === Frustum.OUTSIDE_FRUSTUM) {
			return true;
		}
		
		// 3. In the tile too far away?
		var cameraEye = this.viewer.camera.eye;
		var tileCenter = node.normalizedCenter;
		var sizeFactor = 1 / Math.pow(2, node.level);
		var closestPotentialDistanceMm = Math.abs(vec3.distance(cameraEye, tileCenter) - node.radius);
		
//		console.log(closestPotentialDistanceMm);
		
		const vFOV = this.viewer.camera.perspective.fov * Math.PI / 180;
		const pixelWidth = 2 * Math.tan(vFOV / 2) * Math.abs(closestPotentialDistanceMm);

		if (node.gpuBufferManager != null) {
			node.stats.trianglesDrawing = 0;
			var totalTriangles = 0;
			for (var transparent of [false, true]) {
				var buffers = node.gpuBufferManager.getBuffers(transparent, false);
				for (var buffer of buffers) {
					buffer.nrTrianglesToDraw = Math.floor(Math.min(buffer.nrIndices, Math.floor(buffer.nrIndices * (200000 / closestPotentialDistanceMm))) / 3);
					totalTriangles += buffer.nrIndices / 3;
					node.stats.trianglesDrawing += buffer.nrTrianglesToDraw;
				}
			}
			for (var transparent of [false, true]) {
				var buffers = node.gpuBufferManager.getBuffers(transparent, true);
				for (var buffer of buffers) {
					buffer.nrTrianglesToDraw = Math.floor(Math.min(buffer.nrIndices, Math.floor(buffer.nrIndices * (200000 / closestPotentialDistanceMm))) / 3);
//					buffer.nrTrianglesToDraw = (buffer.nrIndices / 3) * buffer.numInstances;
					totalTriangles += (buffer.nrIndices / 3) * buffer.numInstances;
					node.stats.trianglesDrawing += buffer.nrTrianglesToDraw;
				}
			}
			node.normalizedDistanceFactor = node.stats.trianglesDrawing / totalTriangles;
			if (node.stats.trianglesDrawing == 0) {
				return true;
			}
		} else {
			if (closestPotentialDistanceMm < 800000) {
				return false;
			} else {
				node.normalizedDistanceFactor = 0;
				if (node.stats != null) {
					node.stats.trianglesDrawing = 0;
				}
				return true;
			}
		}
		// Default response
		return false;
	}
	
	prepareRender() {
		// This only needs to be recalculated if the camera has changed, so we keep track of the last view matrix
		if (this.lastViewMatrix == null || this.octree.size != this.lastOctreeSize || !mat4.equals(this.lastViewMatrix, this.viewer.camera.viewMatrix)) {
			this.lastViewMatrix = mat4.clone(this.viewer.camera.viewMatrix);

			this._frustum.init(this.viewer.camera.viewMatrix, this.viewer.camera.projMatrix);

			var renderingTiles = 0;
			var renderingTriangles = 0;
			var drawCalls = 0;
			
			this.octree.traverseBreathFirst((node) => {
				if (node.parent != null && node.parent.visibilityStatus == 0) {
					node.visibilityStatus = 0;
					return false;
				}
				if (this.cull(node)) {
					node.visibilityStatus = 0;
					return false;
				} else {
					node.visibilityStatus = 1;
					if (node.loadingStatus == 0) {
						this.tileLoader.loadTile(node);
					} else {
						if (node.stats != null) {
							renderingTiles++;
							renderingTriangles += (node.stats.trianglesDrawing ? node.stats.trianglesDrawing : 0);
							drawCalls += node.stats.drawCallsPerFrame;
						}
					}
				}
			});
			
			this.viewer.stats.setParameter("Drawing", "Draw calls per frame (L2)", drawCalls);
			this.viewer.stats.setParameter("Drawing", "Triangles to draw (L2)", renderingTriangles);
			this.viewer.stats.setParameter("Tiling", "Rendering", renderingTiles);
		}
	}
	
	renderBuffers(transparency, reuse, visibleElements) {
		// TODO when navigation is active (rotating, panning etc...), this would be the place to decide to for example not-render anything in this layer, or maybe apply more aggressive culling
		// if (this.viewer.navigationActive) {
		// 	return;
		// }
		
		// TODO would be nicer if this was passed as an integer argument, indicating the iteration count of this frame
		let picking = visibleElements.pass === 'pick';

		var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(reuse, picking));

		this.gl.useProgram(programInfo.program);

		if (!picking) {
			// TODO find out whether it's possible to do this binding before the program is used (possibly just once per frame, and better yet, a different location in the code)
			this.viewer.lighting.render(programInfo.uniformBlocks.LightData);
			this.gl.uniformMatrix3fv(programInfo.uniformLocations.viewNormalMatrix, false, this.viewer.camera.viewNormalMatrix);
		}

		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);
		if (this.settings.quantizeVertices) {
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
		}

		this.octree.traverse((node) => {
			// TODO at the moment a list (of non-empty tiles) is used to do traverseBreathFirst, but since a big optimization is possible by automatically culling 
			// child nodes of parent nodes that are culled, we might have to reconsider this and go back to tree-traversal, where returning false would indicate to 
			// skip the remaining child nodes
			
			if (node.visibilityStatus == 1) {
				if (node.gpuBufferManager == null) {
					// Not initialized yet
					return;
				}
				var buffers = node.gpuBufferManager.getBuffers(transparency, reuse);
				this.renderFinalBuffers(buffers, programInfo, visibleElements);
			} else {
				return false;
			}
		});
	}

	renderTileBorders() {
		if (this.drawTileBorders) {
			// The lines are rendered in the transparency-phase only
			this.lineBoxGeometry.renderStart(this.viewer);
			this.octree.traverse((node, level) => {
				var color = null;
				if (node.loadingStatus == 0) {
					// No visualisation, node is not empty (or parent node)
				} else if (node.loadingStatus == 1) {
					// Node is waiting to start loading
					color = [1, 0, 0, 1];
				} else if (node.loadingStatus == 2) {
					// Node is loading
				} else if (node.loadingStatus == 3) {
					// Node is loaded
					if (node.visibilityStatus == 0) {
						color = [0, 1, 0, 1];
					} else if (node.visibilityStatus == 1) {
						if (node.normalizedDistanceFactor == 1) {
							color = [0, 0, 0, 0];
						} else {
							color = [0, 0, 1, 1 - node.normalizedDistanceFactor];
						}
					}
				} else if (node.loadingStatus == 4) {
					// To be documented
					color = [0.5, 0.5, 0.5, 1];
				} else if (node.loadingStatus == 5) {
					// Node has been tried to load, but no objects were returned
				}
				if (color != null) {
					this.lineBoxGeometry.render(color, node.normalizedMatrix, 0.001);
				}
			});
			this.lineBoxGeometry.renderStop();
		}
	}

	addGeometry(loaderId, geometry, object) {
		var sizes = {
			vertices: geometry.positions.length,
			normals: geometry.normals.length,
			indices: geometry.indices.length,
			colors: (geometry.colors != null ? geometry.colors.length : 0),
			pickColors: geometry.positions.length
		};

		// TODO some of this is duplicate code, also in defaultrenderlayer.js
		if (geometry.reused > 1 && this.geometryDataToReuse != null && this.geometryDataToReuse.has(geometry.id)) {
			geometry.matrices.push(object.matrix);
			geometry.objects.push(object);

			this.viewer.stats.inc("Drawing", "Triangles to draw", geometry.indices.length / 3);

			return;
		}

		var node = this.loaderToNode[loaderId];
		
		if (node.bufferManager == null) {
			if (this.settings.useObjectColors) {
				node.bufferManager = new BufferManagerPerColor(this.viewer, this.viewer.settings, this, this.viewer.bufferSetPool);
			} else {
				node.bufferManager = new BufferManagerTransparencyOnly(this.viewer, this.viewer.settings, this, this.viewer.bufferSetPool);
			}
		}
		var buffer = node.bufferManager.getBufferSet(geometry.hasTransparency, geometry.color, sizes);
		buffer.node = node;
		
		super.addGeometry(loaderId, geometry, object, buffer, sizes);
	}
	
	dump() {
		console.log(this.tileLoader.executor);
	}

	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb) {
		var loader = this.getLoader(loaderId);
		var node = this.loaderToNode[loaderId];
		return super.createObject(loaderId, roid, oid, objectId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, node.gpuBufferManager, node);
	}

	addGeometryReusable(geometry, loader, gpuBufferManager) {
		super.addGeometryReusable(geometry, loader, gpuBufferManager);
		var node = this.loaderToNode[loader.loaderId];
		node.stats.triangles += ((geometry.indices.length / 3) * (geometry.matrices.length));
		node.stats.drawCallsPerFrame++;
		
		this.viewer.stats.inc("Drawing", "Draw calls per frame (L2)");
	}

	done(loaderId) {
		var loader = this.getLoader(loaderId);
		var node = this.loaderToNode[loaderId];
		
		// When a new tile has been loaded and the viewer is not moving, we need to force an update of the culling of the node
		if (this.cull(node)) {
			node.visibilityStatus = 0;
		} else {
			node.visibilityStatus = 1;
		}
		
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

		if (this.settings.autoCombineGpuBuffers) {
			var savedBuffers = node.gpuBufferManager.combineBuffers();
			this.viewer.stats.dec("Drawing", "Draw calls per frame (L2)", savedBuffers);
			this.viewer.stats.dec("Buffers", "Buffer groups", savedBuffers);
			node.stats.drawCallsPerFrame -= savedBuffers;
		}

		this.viewer.dirty = true;
		
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

	renderSelectionOutlines(ids, width) {
		for (var oid of ids) {
			// TODO this is already much more efficient than iterating over all octree nodes, but can be made more efficient for large selections by first 
			// organizing the oid's per node
			var viewObject = this.viewer.getViewObject(oid);
			super.renderSelectionOutlines(ids, width, viewObject.node);
		}
	}
	
	addCompleteBuffer(buffer, gpuBufferManager) {
		var newBuffer = super.addCompleteBuffer(buffer, gpuBufferManager);
		
		var node = this.loaderToNode[buffer.loaderId];
		node.stats.triangles += buffer.nrIndices / 3;
		node.stats.drawCallsPerFrame++;
		
		return newBuffer;
	}
	
	flushBuffer(buffer) {
		var node = buffer.node;
		let gpuBuffer = super.flushBuffer(buffer, node.gpuBufferManager);

		if (gpuBuffer == null) {
			debugger;
		}
		gpuBuffer.node = node;

		node.stats.triangles += buffer.nrIndices / 3;
		node.stats.drawCallsPerFrame++;

		if (node.bufferManager) {
			node.bufferManager.resetBuffer(buffer);
		}
		this.viewer.dirty = true;

		return gpuBuffer;
	}

	completelyDone() {
		this.flushAllBuffers();
		this.viewer.dirty = true;
	}
}