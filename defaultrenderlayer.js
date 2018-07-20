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
			this.gpuBufferManager.combineBuffers();
		}
		
		this.bufferManager.clear();
	}
	
	flushAllBuffers() {
		for (var buffer of this.bufferManager.getAllBuffers()) {
			this.flushBuffer(buffer);
		}
	}
	
	flushBuffer(buffer) {
		if (buffer == null) {
			return;
		}
		if (buffer.nrIndices == 0) {
			return;
		}
		
		var programInfo = this.viewer.programManager.getProgram({
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices
		});
		
		if (!this.settings.fakeLoading) {
			const positionBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.positions, this.gl.STATIC_DRAW, 0, buffer.positionsIndex);

			const normalBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.normals, this.gl.STATIC_DRAW, 0, buffer.normalsIndex);

			if (buffer.colors != null) {
				var colorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.colors, this.gl.STATIC_DRAW, 0, buffer.colorsIndex);
			}

			const indexBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
			this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, buffer.indices, this.gl.STATIC_DRAW, 0, buffer.indicesIndex);

			var vao = this.gl.createVertexArray();
			this.gl.bindVertexArray(vao);

			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
				if (this.settings.quantizeVertices) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
			}
			{
				const numComponents = 3;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
				if (this.settings.quantizeNormals) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.BYTE, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
			}
			
			if (!this.settings.useObjectColors) {
				const numComponents = 4;
				const type = this.gl.FLOAT;
				const normalize = false;
				const stride = 0;
				const offset = 0;
				this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents,	type, normalize, stride, offset);
				this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
			}

			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

			this.gl.bindVertexArray(null);

			var newBuffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				indexBuffer: indexBuffer,
				nrIndices: buffer.nrIndices,
				nrNormals: buffer.normalsIndex,
				nrPositions: buffer.positionsIndex,
				vao: vao,
				hasTransparency: buffer.hasTransparency,
				reuse: false
			};
			
			if (this.settings.useObjectColors) {
				newBuffer.color = [buffer.color.r, buffer.color.g, buffer.color.b, buffer.color.a];
				newBuffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
			} else {
				newBuffer.colorBuffer = colorBuffer;
				newBuffer.nrColors = buffer.colorsIndex;
			}
			
			this.gpuBufferManager.pushBuffer(newBuffer);
			this.viewer.dirty = true;
		}

		var toadd = buffer.positionsIndex * (this.settings.quantizeVertices ? 2 : 4) + buffer.normalsIndex * (this.settings.quantizeNormals ? 1 : 4) + (buffer.colorsIndex != null ? buffer.colorsIndex * 4 : 0) + buffer.indicesIndex * 4;

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		this.viewer.stats.inc("Data", "GPU bytes", toadd);
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);
		this.viewer.stats.inc("Buffers", "Buffer groups");
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
				quantizeVertices: this.settings.quantizeVertices
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
	
	setProgressListener(progressListener) {
		this.progressListener = progressListener;
	}
}