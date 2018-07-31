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

	// TODO: Move into base class
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
            type: type,
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
				if (!reuse) {
					this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
				}
			}
	
			this.renderFinalBuffers(buffers, programInfo);
		}
	}

	pickBuffers(transparency, reuse) {
		var buffers = this.gpuBufferManager.getBuffers(transparency, reuse);
		if (buffers.length > 0) {
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
				if (!reuse) {
					this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
				}
			}
			this.pickFinalBuffers(buffers, programInfo);
		}
	}

	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
}