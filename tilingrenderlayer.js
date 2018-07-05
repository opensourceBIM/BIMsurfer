import RenderLayer from './renderlayer.js'
import Octree from './octree.js'
import BoundingBox from './boundingbox.js'
import LineBoxGeometry from './lineboxgeometry.js'
import Executor from './executor.js'
import GeometryLoader from "./geometryloader.js"
import BufferManagerTransparencyOnly from './buffermanagertransparencyonly.js'
import BufferManagerPerColor from './buffermanagerpercolor.js'
import Utils from './utils.js'

export default class TilingRenderLayer extends RenderLayer {
	constructor(viewer, bounds) {
		super(viewer);
		var slightlyLargerBounds = [bounds[0] - 0.1, bounds[1] - 0.1, bounds[2] - 0.1, bounds[3] + 0.2, bounds[4] + 0.2, bounds[5] + 0.2];

		this.octree = new Octree(slightlyLargerBounds);
		this.octree.split(3);
		this.lineBoxGeometry = new LineBoxGeometry(viewer, viewer.gl);
		
		this.loaderCounter = 0;
		this.loaderToNode = {};
		
		window.tiles = this;
		
		this.show = "all";
	}
	
	showAll() {
		this.show = "all";
		this.viewer.dirty = true;
	}

	load(bimServerApi, densityThreshold, roids) {
		var executor = new Executor(8, projects.length);

		// Traversing breath-first so the big chucks are loaded first
		this.octree.traverseBreathFirst((node) => {
			node.status = 0;
			node.liveBuffers = [];
			var bounds = node.getBounds();
			var query = {
				type: {
					name: "IfcProduct",
					includeAllSubTypes: true,
					exclude: ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"]
				},
				inBoundingBox: {
					"x": bounds[0],
					"y": bounds[1],
					"z": bounds[2],
					"width": bounds[3],
					"height": bounds[4],
					"depth": bounds[5],
					"partial": false,
					"excludeOctants": !node.leaf,
//					"useCenterPoint": true,
					"densityUpperThreshold": densityThreshold
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
			
//			query.loaderSettings.splitTriangles = true;

			if (this.viewer.vertexQuantization) {
				var map = {};
				for (var roid of roids) {
					map[roid] = this.viewer.vertexQuantization.getUntransformedVertexQuantizationMatrixForRoid(roid);
				}
			}
			
			// TODO this explodes when either the amount of roids gets high or the octree gets bigger, or both
			// TODO maybe it will be faster to just use one loader instead of potentially 180 loaders, this will however lead to more memory used because loaders can't be closed when they are done
			var geometryLoader = new GeometryLoader(this.loaderCounter++, bimServerApi, this, roids, this.viewer.settings.loaderSettings, map, this.viewer.stats, this.viewer.settings, query);
			this.registerLoader(geometryLoader.loaderId);
			this.loaderToNode[geometryLoader.loaderId] = node;
			geometryLoader.onStart = () => {
				node.status = 1;
				this.viewer.dirty = true;
			};
			executor.add(geometryLoader).then(() => {
				if ((node.liveBuffers == null || node.liveBuffers.length == 0) && (node.bufferManager == null || node.bufferManager.bufferSets.size == 0)) {
					node.status = 0;
				} else {
					node.status = 2;
				}
				this.done(geometryLoader.loaderId);
			});
		});

		executor.awaitTermination().then(() => {
			this.completelyDone();
			this.viewer.stats.requestUpdate();
			document.getElementById("progress").style.display = "none";
		});	

		return executor.awaitTermination();
	}

	sphereInFrustum(center, radius, frustumPlanes) {
		var result = "INSIDE";
		for (var i=0; i<6; i++) {
			var plane = frustumPlanes[i];

			var m = (center[0] * plane[0]) + (center[1] * plane[1]) + (center[2] * plane[2]) + plane[3];
			var n = (radius * Math.abs(plane[0])) + (radius * Math.abs(plane[1])) + (radius * Math.abs(plane[2]));

			if (m + n < 0) {
				return "OUTSIDE";
			}
			if (m - n < 0) result = "INTERSECT";

		}
		return result;
	}

	render(transparency) {
//		if (this.viewer.navigationActive) {
//			return;
//		}
		
		var renderableTiles = 0;

		var programInfo = this.viewer.programManager.getProgram({
			instancing: false,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices
		});
		this.gl.useProgram(programInfo.program);
		// TODO find out whether it's possible to do this binding before the program is used (possibly just once per frame, and better yet, a different location in the code)
		this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, programInfo.uniformBlocks.LightData, this.viewer.lighting.lightingBuffer);
		
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.projectionMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, this.viewer.normalMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, this.viewer.modelViewMatrix);
		if (this.settings.quantizeVertices) {
			this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getTransformedInverseVertexQuantizationMatrix());
		}

		this.octree.traverse((node) => {
			// Check whether this node is completely outside of the view frustum -> discard
			// TODO results of these checks we could store for the second render pass
			
			var center = node.getCenter();
			var radius = node.getBoundingSphereRadius();

			radius *= this.viewer.totalScale;
			
			vec4.transformMat4(center, center, this.viewer.modelViewMatrix);
			vec4.transformMat4(center, center, this.viewer.projectionMatrix);
			
			// Temporary hack to always show everything
			if (this.show != "all") {
				if (this.sphereInFrustum(center, radius, this.viewer.frustumPlanes) == "OUTSIDE") {
					node.visibilityStatus = 0;
					return;
				}
			}
			node.visibilityStatus = 1;
			renderableTiles++;
			var buffers = node.liveBuffers;
			if (buffers != null && buffers.length > 0) {
				var lastUsedColorHash = null;
				
				for (let buffer of buffers) {
					if (buffer.hasTransparency == transparency) {
						if (this.settings.useObjectColors) {
							if (lastUsedColorHash == null || lastUsedColorHash != buffer.colorHash) {
								this.gl.uniform4fv(programInfo.uniformLocations.vertexColor, buffer.color);
								lastUsedColorHash = buffer.colorHash;
							}
						}
						this.renderBuffer(buffer, programInfo);
					}
				}
			}
		}, false);
		
		this.viewer.stats.setParameter("Tiling", "Renderable tiles", renderableTiles);

		if (transparency) {
			this.lineBoxGeometry.renderStart();
			this.octree.traverse((node) => {
				var color = null;
				if (node.status == 0) {
					
				} else if (node.status == 1) {
					color = [1, 0, 0, 0.5];
				} else if (node.status == 2) {
					if (node.visibilityStatus == 0) {
						color = [0, 1, 0, 0.5];
					} else if (node.visibilityStatus == 1) {
						color = [0, 0, 1, 0.5];
					}
				} else if (node.status == 3) {
					color = [0.5, 0.5, 0.5, 0.5];
				}
				if (color != null) {
					this.lineBoxGeometry.render(color, node.getMatrix());
				}
			});
			this.lineBoxGeometry.renderStop();
		}
	}

	renderBuffer(buffer, programInfo) {
		this.gl.bindVertexArray(buffer.vao);

		this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);

		this.gl.bindVertexArray(null);
	}
	
	addGeometry(loaderId, geometry, object) {
		var sizes = {
			vertices: geometry.positions.length,
			normals: geometry.normals.length,
			indices: geometry.indices.length,
			colors: (geometry.colors != null ? geometry.colors.length : 0)
		};
		
		var node = this.loaderToNode[loaderId];
		
		if (node.bufferManager == null) {
			if (this.settings.useObjectColors) {
				node.bufferManager = new BufferManagerPerColor(this.viewer.settings, this, this.viewer.bufferSetPool);
			} else {
				node.bufferManager = new BufferManagerTransparencyOnly(this.viewer.settings, this, this.viewer.bufferSetPool);
			}
		}
		var buffer = node.bufferManager.getBufferSet(geometry.hasTransparency, geometry.color, sizes, node);

		var startIndex = buffer.positionsIndex / 3;

		var vertex = Array(3);
		for (var i=0; i<geometry.positions.length; i+=3) {
			// When quantizeVertices is on and we use the buffers in a combined buffer (which is what this method, addGeometry does),
			// we need to un-quantize the vertices, transform them, then quantize them again (so the shaders can again unquantize them).
			// This because order does matter (object transformation sometimes even mirror stuff)
			// Obviously quantization slows down both CPU (only initially) and GPU (all the time)
			vertex[0] = geometry.positions[i + 0];
			vertex[1] = geometry.positions[i + 1];
			vertex[2] = geometry.positions[i + 2];
			
			// If the geometry loader loads quantized data we need to unquantize first
			if (this.settings.loaderSettings.quantizeVertices) {
				vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForRoid(geometry.roid));
			}
			vec3.transformMat4(vertex, vertex, object.matrix);
			if (this.settings.quantizeVertices) {
				vec3.transformMat4(vertex, vertex, this.viewer.vertexQuantization.getTransformedVertexQuantizationMatrix());
			}

			buffer.positions.set(vertex, buffer.positionsIndex);
			buffer.positionsIndex += 3;
		}
		var normal = Array(3);
		for (var i=0; i<geometry.normals.length; i+=3) {
			normal[0] = geometry.normals[i + 0];
			normal[1] = geometry.normals[i + 1];
			normal[2] = geometry.normals[i + 2];

			if (this.settings.loaderSettings.quantizeNormals) {
				normal[0] = normal[0] / 127;
				normal[1] = normal[1] / 127;
				normal[2] = normal[2] / 127;
			}
			vec3.transformMat4(normal, normal, object.matrix);
			vec3.normalize(normal, normal);
			if (this.settings.quantizeNormals) {
				normal[0] = normal[0] * 127;
				normal[1] = normal[1] * 127;
				normal[2] = normal[2] * 127;
			}

			buffer.normals.set(normal, buffer.normalsIndex);
			buffer.normalsIndex += 3;
		}
		if (geometry.colors != null) {
			buffer.colors.set(geometry.colors, buffer.colorsIndex);
			buffer.colorsIndex += geometry.colors.length;
		}
		if (startIndex == 0) {
			// Small optimization, if this is the first object in the buffer, no need to add the startIndex to each index
			buffer.indices.set(geometry.indices, 0);
			buffer.indicesIndex = geometry.indices.length;
		} else {
			var index = Array(3);
			for (var i=0; i<geometry.indices.length; i+=3) {
				index[0] = geometry.indices[i + 0] + startIndex;
				index[1] = geometry.indices[i + 1] + startIndex;
				index[2] = geometry.indices[i + 2] + startIndex;
				
				buffer.indices.set(index, buffer.indicesIndex);
				buffer.indicesIndex += 3;
			}
		}

		buffer.nrIndices += geometry.indices.length;
		
		if (buffer.needsToFlush) {
			this.flushBuffer(buffer, node);
		}
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
//			object: this.viewer.model.objects[oid],
			add: (geometryId, objectId) => {
				this.addGeometryToObject(geometryId, objectId, loader);
			}
		};

		var loader = this.getLoader(loaderId);
		loader.objects[oid] = object;

		geometryIds.forEach((id) => {
			this.addGeometryToObject(id, object.id, loader);
		});

		this.viewer.stats.inc("Models", "Objects");

		return object;
	}
	
	addGeometryToObject(geometryId, objectId, loader) {
		var geometry = loader.geometries[geometryId];
		if (geometry == null) {
			return;
		}
		var object = loader.objects[objectId];
		if (object.visible) {
			this.addGeometry(loader.loaderId, geometry, object);
			object.geometry.push(geometryId);
		} else {
			this.viewer.stats.inc("Primitives", "Nr primitives hidden", geometry.indices.length / 3);
			if (this.progressListener != null) {
				this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
			}
		}
	}

	done(loaderId) {
		var node = this.loaderToNode[loaderId];
		var bufferManager = node.bufferManager;
		if (bufferManager != null) {
			for (var buffer of bufferManager.getAllBuffers()) {
				this.flushBuffer(buffer, node);
			}
			node.bufferManager = null;
		}

		var loader = this.getLoader(loaderId);

		Object.keys(loader.objects).forEach((key, index) => {
			var object = loader.objects[key];
			object.add = null;
		});

		this.removeLoader(loaderId);
	}

	flushAllBuffers() {
		this.octree.traverse((node) => {
			var bufferManager = node.bufferManager;
			if (bufferManager != null) {
				for (var buffer of bufferManager.getAllBuffers()) {
					this.flushBuffer(buffer, node);
				}
				if (this.settings.useObjectColors) {
					// When using object colors, it makes sense to sort the buffers by color, so we can potentially skip a few uniform binds
					// It might be beneficiary to do this sorting on-the-lfy and not just when everything is loaded
					this.sortBuffers(node.liveBuffers);
				}
			}
		}, false);
	}
	
	flushBuffer(buffer, node) {
		if (buffer == null) {
			return;
		}
		if (buffer.nrIndices == 0) {
			return;
		}
		
		this.viewer.stats.inc("Buffers", "Flushed buffers");
		
		var programInfo = this.viewer.programManager.getProgram({
			instancing: false,
			useObjectColors: buffer.colors == null,
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
			
			if (buffer.colors != null) {
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
				vao: vao,
				hasTransparency: buffer.hasTransparency
			};
			
			if (buffer.colors != null) {
				newBuffer.colorBuffer = colorBuffer;
			}
			
			if (this.settings.useObjectColors) {
				newBuffer.color = [buffer.color.r, buffer.color.g, buffer.color.b, buffer.color.a];
				newBuffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
			}
			
			node.liveBuffers.push(newBuffer);
		}

		var toadd = buffer.positionsIndex * (this.settings.quantizeVertices ? 2 : 4) + buffer.normalsIndex * (this.settings.quantizeNormals ? 1 : 4) + (buffer.colorsIndex != null ? buffer.colorsIndex * 4 : 0) + buffer.indicesIndex * 4;

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		this.viewer.stats.inc("Data", "GPU bytes", toadd);
		this.viewer.stats.inc("Drawing", "Draw calls per frame");
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);
		this.viewer.stats.inc("Buffers", "Buffer groups");
		this.viewer.stats.inc("Drawing", "Triangles to draw", buffer.nrIndices / 3);

		node.bufferManager.resetBuffer(buffer);
		this.viewer.dirty = true;
	}
	
	completelyDone() {
		this.flushAllBuffers();
		this.viewer.dirty = true;
	}
}