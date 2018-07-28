import BufferManagerTransparencyOnly from './buffermanagertransparencyonly.js'
import BufferManagerPerColor from './buffermanagerpercolor.js'
import Utils from './utils.js'
import VertexQuantization from './vertexquantization.js'
import RenderLayer from './renderlayer.js'
import GpuBufferManager from './gpubuffermanager.js'

/*
 * This is the default renderer for what we called the base layer. Usually this layer should be small enough to be rendered at good FPS
 * 
 * This class does:
 * - Populate the CPU side buffers
 * - Allocate buffers on the GPU and flush buffers to it
 * - Render all buffers
 * 
 */

export default class DefaultRenderLayer extends RenderLayer {
	constructor(viewer, geometryDataToReuse) {
		super(viewer, geometryDataToReuse);

		if (this.settings.useObjectColors) {
			this.bufferManager = new BufferManagerPerColor(this.settings, this, this.viewer.bufferSetPool);
		} else {
			this.bufferManager = new BufferManagerTransparencyOnly(this.settings, this, this.viewer.bufferSetPool);
		}

		this.gpuBufferManager = new GpuBufferManager(this.viewer);
	}

	createObject(loaderId, roid, oid, objectId, geometryIds, matrix, scaleMatrix, hasTransparency, type) {
		var object = {
				id: objectId,
				visible: type != "IfcOpeningElement" && type != "IfcSpace",
				hasTransparency: hasTransparency,
				matrix: matrix,
				scaleMatrix: scaleMatrix,
				geometry: [],
				roid: roid,
//				object: this.viewer.model.objects[oid],
				add: (geometryId, objectId) => {
					this.addGeometryToObject(geometryId, objectId, loader, this.gpuBufferManager);
				}
		};

		var loader = this.getLoader(loaderId);
		loader.objects.set(oid , object);

		var viewObject = {
			objectId: objectId,
			oid: oid,
			pickId: this.viewer.viewObjectsByPickId.length
		};
		this.viewer.viewObjectsByPickId.push(viewObject);
		this.viewer.viewObjects[objectId] = viewObject;

		geometryIds.forEach((id) => {
			this.addGeometryToObject(id, object.id, loader, this.gpuBufferManager);
		});

		this.viewer.stats.inc("Models", "Objects");

		return object;
	}

	addGeometry(loaderId, geometry, object) {
		// TODO some of this is duplicate code, also in tilingrenderlayer.js

		if (geometry.reused > 1 && this.geometryDataToReuse.has(geometry.id)) {
			geometry.matrices.push(object.matrix);
			
			this.viewer.stats.inc("Drawing", "Triangles to draw (L1)", geometry.indices.length / 3);

			return;
		}

		var sizes = {
			vertices: geometry.positions.length,
			normals: geometry.normals.length,
			indices: geometry.indices.length,
			colors: (geometry.colors != null ? geometry.colors.length : 0)
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
		} else {
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

	flushBuffer(buffer) {
		super.flushBuffer(buffer, this.gpuBufferManager);

		this.viewer.stats.inc("Drawing", "Draw calls per frame (L1)");
		this.viewer.stats.inc("Drawing", "Triangles to draw (L1)", buffer.nrIndices / 3);

		this.bufferManager.resetBuffer(buffer);
	}

	renderBuffers(transparency, reuse) {
		var buffers = this.gpuBufferManager.getBuffers(transparency, reuse);
		if (buffers.length > 0) {
			var programInfo = this.viewer.programManager.getProgram({
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
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, this.viewer.camera.normalMatrix);
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, this.viewer.camera.viewMatrix);
			if (this.settings.quantizeVertices) {
				if (!reuse) {
					this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
				}
			}
	
			this.renderFinalBuffers(buffers, programInfo);
		}
	}

	renderForPick() {
		this.renderBuffersForPick(this.liveBuffers,  false);
		this.renderBuffersForPick(this.liveReusedBuffers, true);
	}

	renderBuffersForPick(buffers, reuse) {
		if (buffers.length > 0) {

			var pickProgramInfo = this.viewer.programManager.getProgram({
				picking: true,
				instancing: reuse,
				useObjectColors: !!this.settings.useObjectColors,
				quantizeVertices: !!this.settings.quantizeVertices
			});

			this.gl.useProgram(pickProgramInfo.program);

			this.gl.uniformMatrix4fv(pickProgramInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
			this.gl.uniformMatrix4fv(pickProgramInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);

			if (this.settings.quantizeVertices) {
				if (!reuse) {
					this.gl.uniformMatrix4fv(pickProgramInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
				}
			}

			// var lastUsedColorHash = null;

			for (let buffer of buffers) {
				// if (this.settings.useObjectColors) {
				// 	if (lastUsedColorHash == null || lastUsedColorHash != buffer.colorHash) {
				// 		this.gl.uniform4fv(pickProgramInfo.uniformLocations.objectColor, buffer.color);
				// 		lastUsedColorHash = buffer.colorHash;
				// 	}
				// }
				if (reuse) {
					this.renderReusedBufferForPick(buffer, pickProgramInfo);
				} else {
					this.renderBufferForPick(buffer, pickProgramInfo);
				}
			}
		}
	}

	renderReusedBufferForPick(buffer, pickProgramInfo) {
		this.gl.bindVertexArray(buffer.vaoPick);
		if (this.settings.quantizeVertices) {
			this.gl.uniformMatrix4fv(pickProgramInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForRoid(buffer.roid));
		}
		this.gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrIndices, buffer.indexType, 0, buffer.nrProcessedMatrices);
		this.gl.bindVertexArray(null);
	}

	renderBufferForPick(buffer, pickProgramInfo) {
		this.gl.bindVertexArray(buffer.vaoPick);
		this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);
		this.gl.bindVertexArray(null);
	}

	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
}