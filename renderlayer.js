import BufferTransformer from './buffertransformer.js'
import Utils from './utils.js'
import GpuBufferManager from './gpubuffermanager.js'

export default class RenderLayer {
	constructor(viewer, geometryDataToReuse) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;
		this.geometryDataToReuse = geometryDataToReuse;

		this.loaders = new Map();
		this.bufferTransformer = new BufferTransformer(this.settings, viewer.vertexQuantization);
	}

	createGeometry(loaderId, roid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		var bytes = 0;
		if (this.settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			if (this.settings.quantizeColors) {
				bytes += colors.length;
			} else {
				bytes += colors.length * 4;
			}
		}
		if (indices.length < 65536 && this.settings.useSmallIndicesIfPossible) {
			bytes += indices.length * 2;
		} else {
			bytes += indices.length * 4;
		}
		if (this.settings.quantizeNormals) {
			bytes += normals.length;
		} else {
			bytes += normals.length * 4;
		}
		var geometry = {
				id: geometryId,
				roid: roid,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: []
		};
		
		var loader = this.getLoader(loaderId);

		loader.geometries.set(geometryId, geometry);
		geometry.isReused = geometry.reused > 1 && this.geometryDataToReuse.has(geometry.id);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}

		return geometry;
	}

	addGeometry(loaderId, geometry, object, buffer, sizes) {
		var startIndex = buffer.positionsIndex / 3;

		try {
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
				// TODO there is a possible performance improvement possible for all modelset where the totalBounds of the modelSet are the same as for each individual submodel (for example all projects without subprojects).
				// In that case we won't have to unquantize + quantize again
				
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
	
				// TODO Magnitude does not really matter for normals right(?), so why can't we just keep the normals quantized?? Should test disabling this when the shaders are actually shading...
//				if (this.settings.loaderSettings.quantizeNormals) {
//					normal[0] = normal[0] / 127;
//					normal[1] = normal[1] / 127;
//					normal[2] = normal[2] / 127;
//				}
				vec3.transformMat4(normal, normal, object.matrix);
				vec3.normalize(normal, normal);
//				if (this.settings.quantizeNormals) {
//					normal[0] = normal[0] * 127;
//					normal[1] = normal[1] * 127;
//					normal[2] = normal[2] * 127;
//				}
	
				buffer.normals.set(normal, buffer.normalsIndex);
				buffer.normalsIndex += 3;
			}
			if (geometry.colors != null) {
				if (geometry.colors instanceof Uint8Array == this.settings.quantizeColors) {
					// The same, just copy
					buffer.colors.set(geometry.colors, buffer.colorsIndex);
					buffer.colorsIndex += geometry.colors.length;
				} else {
					// Different, conversion required
					var color = new Array(4);
					for (var i=0; i<geometry.colors.length; i+=4) {
						color[0] = geometry.colors[i + 0];
						color[1] = geometry.colors[i + 1];
						color[2] = geometry.colors[i + 2];
						color[3] = geometry.colors[i + 3];
						if (this.settings.quantizeColors) {
							// Quantize
							color[0] = color[0] * 255;
							color[1] = color[1] * 255;
							color[2] = color[2] * 255;
							color[3] = color[3] * 255;
						} else {
							// Unquantize
							color[0] = color[0] / 255;
							color[1] = color[1] / 255;
							color[2] = color[2] / 255;
							color[3] = color[3] / 255;
						}
						
						buffer.colors.set(color, buffer.colorsIndex);
						buffer.colorsIndex += 4;
					}
				}
			}

			var viewObject = this.viewer.viewObjects[object.id];
			if (viewObject) {
				var pickColor = this.viewer.getPickColor(viewObject.pickId);
				var numPickColors = (geometry.positions.length / 3) * 4;
				for (var j = buffer.pickColorsIndex, lenj = buffer.pickColorsIndex + numPickColors; j < lenj; j+=4) {
					buffer.pickColors[j + 0] = pickColor[0];
					buffer.pickColors[j + 1] = pickColor[1];
					buffer.pickColors[j + 2] = pickColor[2];
					buffer.pickColors[j + 3] = pickColor[3];
				}
				buffer.pickColorsIndex += numPickColors;
			} else {
				console.log("viewObject not found: " + object.id);
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
		} catch (e) {
			console.error(e);
			console.log(sizes);
			console.log(buffer);
			throw e;
		}

		buffer.nrIndices += geometry.indices.length;
		
		if (buffer.needsToFlush) {
			this.flushBuffer(buffer);
		}
	}
	
	addGeometryToObject(geometryId, objectId, loader, gpuBufferManager) {
		var geometry = loader.geometries.get(geometryId);
		if (geometry == null) {
			return;
		}
		var object = loader.objects.get(objectId);
		if (object.visible) {
			this.addGeometry(loader.loaderId, geometry, object);
			object.geometry.push(geometryId);
		} else {
			this.viewer.stats.inc("Primitives", "Nr primitives hidden", geometry.indices.length / 3);
			if (this.progressListener != null) {
				this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
			}
		}
		if (geometry.isReused) {
			geometry.reuseMaterialized++;
			if (geometry.reuseMaterialized == geometry.reused) {
				this.addGeometryReusable(geometry, loader, gpuBufferManager);
			}
		}
	}
	
	addGeometryReusable(geometry, loader, gpuBufferManager) {
		const positionBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferTransformer.convertVertices(loader.roid, geometry.positions), this.gl.STATIC_DRAW, 0, 0);
		
		const normalBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.bufferTransformer.convertNormals(geometry.normals), this.gl.STATIC_DRAW, 0, 0);
		
		if (geometry.colors != null) {
			var colorBuffer = this.gl.createBuffer();
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.colors, this.gl.STATIC_DRAW, 0, 0);
		}

		const indexBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		var indices = this.bufferTransformer.convertIndices(geometry.indices, geometry.positions.length);
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_READ, 0, 0);

		const instancesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancesBuffer);
		var matrices = new Float32Array(geometry.matrices.length * 16);
		geometry.matrices.forEach((matrix, index) => {
			matrices.set(matrix, index * 16);
		});
		this.gl.bufferData(this.gl.ARRAY_BUFFER, matrices, this.gl.STATIC_DRAW, 0, 0);

		var vao = this.gl.createVertexArray();
		this.gl.bindVertexArray(vao);
		
		var programInfo = this.viewer.programManager.getProgram({
			instancing: true,
			useObjectColors: this.settings.useObjectColors,
			quantizeNormals: this.settings.quantizeNormals,
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
		});

		{
			const numComponents = 3;
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
			
			if (this.settings.quantizeVertices) {
				this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexPosition, numComponents, this.gl.SHORT, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition,	numComponents, this.gl.FLOAT, normalize, stride, offset);
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
			const normalize = false;
			const stride = 0;
			const offset = 0;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			if (this.settings.quantizeColors) {
				this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.UNSIGNED_BYTE, normalize, stride, offset);
			} else {
				this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.FLOAT, normalize, stride, offset);
			}
			this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
		}

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, instancesBuffer);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 0, 4, this.gl.FLOAT, false, 64, 0);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 1);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 1, 4, this.gl.FLOAT, false, 64, 16);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 2);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 2, 4, this.gl.FLOAT, false, 64, 32);

		this.gl.enableVertexAttribArray(programInfo.attribLocations.instances + 3);
		this.gl.vertexAttribPointer(programInfo.attribLocations.instances + 3, 4, this.gl.FLOAT, false, 64, 48);

		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 0, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 1, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 2, 1);
		this.gl.vertexAttribDivisor(programInfo.attribLocations.instances + 3, 1);

		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);		  

		this.gl.bindVertexArray(null);

		var buffer = {
				positionBuffer: positionBuffer,
				normalBuffer: normalBuffer,
				indexBuffer: indexBuffer,
				nrIndices: geometry.indices.length,
				vao: vao,
//				matrices: geometry.matrices,
//				dirtyMatrices: false,
				nrProcessedMatrices: geometry.matrices.length,
//				geometry: geometry,
				instancesBuffer: instancesBuffer,
				roid: geometry.roid,
//				instances: matrices,
				hasTransparency: geometry.hasTransparency,
				indexType: indices instanceof Uint16Array ? this.gl.UNSIGNED_SHORT : this.gl.UNSIGNED_INT,
				reuse: true
		};
		
		if (this.settings.useObjectColors) {
			buffer.colorBuffer = colorBuffer;
			buffer.color = [geometry.color.r, geometry.color.g, geometry.color.b, geometry.color.a];
			buffer.colorHash = Utils.hash(JSON.stringify(buffer.color));
		}
		
		loader.geometries.delete(geometry.id);
		gpuBufferManager.pushBuffer(buffer);

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", (buffer.nrIndices / 3) * geometry.matrices.length);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}

		var toadd = geometry.bytes + geometry.matrices.length * 16 * 4;
		this.viewer.stats.inc("Drawing", "Draw calls per frame");
		this.viewer.stats.inc("Data", "GPU bytes reuse", toadd);
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);

		geometry.buffer = buffer;
	}
	
	getLoader(loaderId) {
		return this.loaders.get(loaderId);
	}
	
	removeLoader(loaderId) {
		this.loaders.delete(loaderId);
	}
	
	getObject(loaderId, identifier) {
		return this.getLoader(loaderId).objects.get(identifier);
	}
	
	registerLoader(loaderId) {
		this.loaders.set(loaderId, {
			loaderId: loaderId,
			objects: new Map(),
			geometries: new Map()
		});
	}
	
	renderBuffers(transparency, reuse) {
		console.log("Not implemented in this layer");
	}
	
	render(transparency) {
		this.renderBuffers(transparency, false);
		this.renderBuffers(transparency, true);
	}
	
	renderFinalBuffers(buffers, programInfo) {
		if (buffers != null && buffers.length > 0) {
			var lastUsedColorHash = null;
			
			for (let buffer of buffers) {
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
	
	renderBuffer(buffer, programInfo) {
		if (buffer.reuse) {
			this.gl.bindVertexArray(buffer.vao);
			
			if (this.viewer.settings.quantizeVertices) {
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, this.viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForRoid(buffer.roid));
			}
			this.gl.drawElementsInstanced(this.gl.TRIANGLES, buffer.nrIndices, buffer.indexType, 0, buffer.nrProcessedMatrices);
			
			this.gl.bindVertexArray(null);
		} else {
			this.gl.bindVertexArray(buffer.vao);
			
			this.gl.drawElements(this.gl.TRIANGLES, buffer.nrIndices, this.gl.UNSIGNED_INT, 0);
			
			this.gl.bindVertexArray(null);
		}
	}
	
	flushBuffer(buffer, gpuBufferManager) {
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
			quantizeVertices: this.settings.quantizeVertices,
			quantizeColors: this.settings.quantizeColors
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
			this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, buffer.indices, this.gl.STATIC_READ, 0, buffer.indicesIndex);

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
				if (this.settings.quantizeColors) {
					this.gl.vertexAttribIPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.UNSIGNED_BYTE, normalize, stride, offset);
				} else {
					this.gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, numComponents, this.gl.FLOAT, normalize, stride, offset);
				}
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
			
			gpuBufferManager.pushBuffer(newBuffer);
			this.viewer.dirty = true;
		}
		
		var toadd = buffer.positionsIndex * (this.settings.quantizeVertices ? 2 : 4) + buffer.normalsIndex * (this.settings.quantizeNormals ? 1 : 4) + (buffer.colorsIndex != null ? buffer.colorsIndex * (this.settings.quantizeColors ? 1 : 4) : 0) + buffer.indicesIndex * 4;

		this.viewer.stats.inc("Primitives", "Nr primitives loaded", buffer.nrIndices / 3);
		if (this.progressListener != null) {
			this.progressListener(this.viewer.stats.get("Primitives", "Nr primitives loaded") + this.viewer.stats.get("Primitives", "Nr primitives hidden"));
		}
		this.viewer.stats.inc("Data", "GPU bytes", toadd);
		this.viewer.stats.inc("Data", "GPU bytes total", toadd);
		this.viewer.stats.inc("Buffers", "Buffer groups");
	}
}