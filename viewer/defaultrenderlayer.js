import {BufferManagerTransparencyOnly} from "./buffermanagertransparencyonly.js";
import {BufferManagerPerColor} from "./buffermanagerpercolor.js";
import {Utils} from "./utils.js";
import {VertexQuantization} from "./vertexquantization.js";
import {RenderLayer} from "./renderlayer.js";
import {GpuBufferManager} from "./gpubuffermanager.js";

/**
 * This is the default renderer for what we called the base layer. Usually this layer should be small enough to be rendered at good FPS
 *
 * This class does:
 * - Populate the CPU side buffers
 * - Allocate buffers on the GPU and flush buffers to it
 * - Render all buffers
 *
 */
export class DefaultRenderLayer extends RenderLayer {
	constructor(viewer, geometryDataToReuse) {
		super(viewer, geometryDataToReuse);

		if (this.settings.useObjectColors) {
			this.bufferManager = new BufferManagerPerColor(this.viewer, this.settings, this, this.viewer.bufferSetPool);
		} else {
			this.bufferManager = new BufferManagerTransparencyOnly(this.viewer, this.settings, this, this.viewer.bufferSetPool);
		}

		this.gpuBufferManager = new GpuBufferManager(this.viewer);
		
		window.defaultRenderLayer = this;
	}

	createObject(loaderId, roid, uniqueId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb) {
		return super.createObject(loaderId, roid, uniqueId, geometryIds, matrix, normalMatrix, scaleMatrix, hasTransparency, type, aabb, this.gpuBufferManager);
	}

	addGeometryReusable(geometry, loader, gpuBufferManager) {
		super.addGeometryReusable(geometry, loader, gpuBufferManager);
		this.viewer.stats.inc("Drawing", "Draw calls per frame (L1)");
	}
	
	addGeometry(loaderId, geometry, object) {
		// TODO some of this is duplicate code, also in tilingrenderlayer.js
		if (geometry.reused > 1 && this.geometryDataToReuse != null && this.geometryDataToReuse.has(geometry.id)) {
			geometry.matrices.push(object.matrix);
			geometry.objects.push(object);

			this.viewer.stats.inc("Drawing", "Triangles to draw (L1)", geometry.indices.length / 3);

			return;
		}

		var sizes = {
			vertices: geometry.positions.length,
			normals: geometry.normals.length,
			indices: geometry.indices.length,
			lineIndices: geometry.lineIndices.length,
			colors: (geometry.colors != null ? geometry.colors.length : 0),
			pickColors: geometry.positions.length
		};
		var buffer = this.bufferManager.getBufferSet(geometry.hasTransparency, geometry.color, sizes);

		super.addGeometry(loaderId, geometry, object, buffer, sizes);
	}

	done(loaderId) {
		var loader = this.getLoader(loaderId);

		for (var geometry of loader.geometries.values()) {
			if (geometry.isReused) {
				this.addGeometryReusable(geometry, loader, this.gpuBufferManager);
			}
		}

		for (var object of loader.objects.values()) {
			object.add = null;
		}

		this.removeLoader(loaderId);
	}

	completelyDone() {
		this.flushAllBuffers();

		if (this.settings.useObjectColors) {
			// When using object colors, it makes sense to sort the buffers by color, so we can potentially skip a few uniform binds
			// It might be beneficiary to do this sorting on-the-lfy and not just when everything is loaded
			this.gpuBufferManager.sortAllBuffers();
		} else if (this.settings.autoCombineGpuBuffers) {
			var savedBuffers = this.gpuBufferManager.combineBuffers();

			this.viewer.stats.dec("Drawing", "Draw calls per frame (L1)", savedBuffers);
			this.viewer.stats.dec("Buffers", "Buffer groups", savedBuffers);
		}

		this.bufferManager.clear();
	}

	flushAllBuffers() {
		for (var buffer of this.bufferManager.getAllBuffers()) {
			this.flushBuffer(buffer);
		}
	}

	addCompleteBuffer(buffer, gpuBufferManager) {
		var newBuffer = super.addCompleteBuffer(buffer, gpuBufferManager);
		
		this.viewer.stats.inc("Drawing", "Draw calls per frame (L1)");
		this.viewer.stats.inc("Drawing", "Triangles to draw (L1)", buffer.nrIndices / 3);
		
		return newBuffer;
	}
	
	flushBuffer(buffer) {
		let gpuBuffer = super.flushBuffer(buffer, this.gpuBufferManager);

		this.viewer.stats.inc("Drawing", "Draw calls per frame (L1)");
		this.viewer.stats.inc("Drawing", "Triangles to draw (L1)", buffer.nrIndices / 3);

		this.bufferManager.resetBuffer(buffer);

		return gpuBuffer;
	}

	renderBuffers(transparency, reuse, lines, visibleElements) {
		var buffers = this.gpuBufferManager.getBuffers(transparency, reuse);
		if (buffers.length > 0) {
			let picking = visibleElements.pass === 'pick';
			
			if (picking && lines) {
				// No rendering of lines for picking
				return;
			}

			var programInfo = this.viewer.programManager.getProgram(this.viewer.programManager.createKey(reuse, picking, lines));
			this.gl.useProgram(programInfo.program);
			// TODO find out whether it's possible to do this binding before the program is used (possibly just once per frame, and better yet, a different location in the code)

			if (!picking && !lines) {
				this.viewer.lighting.render(programInfo.uniformBlocks.LightData);
				this.gl.uniformMatrix3fv(programInfo.uniformLocations.viewNormalMatrix, false, this.viewer.camera.viewNormalMatrix);
			}

			this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);
			this.gl.uniform3fv(programInfo.uniformLocations.postProcessingTranslation, this.postProcessingTranslation);
			this.gl.uniform4fv(programInfo.uniformLocations.sectionPlane, this.viewer.sectionPlaneValues);

			this.renderFinalBuffers(buffers, programInfo, visibleElements, lines);
		}
	}

	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
}