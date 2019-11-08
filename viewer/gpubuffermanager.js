/**
 * Responsible for managing GPU buffers. There are 4 types of buffers:
 * - Transparent batched
 * - Opaque batched
 * - Transparent reused
 * - Opaque reused
 *  
 */
export class GpuBufferManager {
	constructor(viewer) {
		this.viewer = viewer;
		this.gl = this.viewer.gl;
		this.settings = this.viewer.settings;
		
		this.liveBuffersTransparent = [];
		this.liveBuffersOpaque = [];
		this.liveReusedBuffersOpaque = [];
		this.liveReusedBuffersTransparent = [];
	}
	
	isEmpty() {
		// This variable is required because of bug in Firefox
		var isEmpty =
			(this.liveBuffersOpaque == null || this.liveBuffersOpaque.length == 0) && 
			(this.liveBuffersTransparent == null || this.liveBuffersTransparent.length == 0) &&
			(this.liveReusedBuffersOpaque == null || this.liveReusedBuffersOpaque.length == 0) &&
			(this.liveReusedBuffersTransparent == null || this.liveReusedBuffersTransparent.length == 0);
		return isEmpty;
	}
	
	/* 
	 * Get a buffer based on two booleans: transparency and reuse
	 */
	getBuffers(transparency, reuse) {
		if (reuse) {
			if (transparency) {
				return this.liveReusedBuffersTransparent;
			} else {
				return this.liveReusedBuffersOpaque;
			}
		} else {
			if (transparency) {
				return this.liveBuffersTransparent;
			} else {
				return this.liveBuffersOpaque;
			}
		}
	}
	
	pushBuffer(buffer) {
		// TODO this can potentially become slow when there are a lot of buffers
		let buffers = this.getBuffers(buffer.hasTransparency, buffer.reuse);
		buffers.push(buffer);
		if (buffer.croid) {
			this.sortBuffersByCroid(buffers);
		}
	}

	deleteBuffer(buffer) {
		let arr = this.getBuffers(buffer.hasTransparency, buffer.reuse);
		let idx = arr.indexOf(buffer);
		if (idx === -1) {
			throw "Unable to find buffer to delete";
		}
		arr.splice(idx, 1);
	}
	
	sortAllBuffersByColor() {
		this.sortBuffersByColor(this.liveBuffersOpaque);
		this.sortBuffersByColor(this.liveBuffersTransparent);
		this.sortBuffersByColor(this.liveReusedBuffersOpaque);
		this.sortBuffersByColor(this.liveReusedBuffersTransparent);
	}
	
	sortBuffersByColor(buffers) {
		buffers.sort((a, b) => {
			for (var i=0; i<4; i++) {
				if (a.color[i] == b.color[i]) {
					continue;
				}
				return a.color[i] - b.color[i];
			}
			// Colors are the same
			return 0;
		});
	}
	
	sortBuffersByCroid(buffers) {
		buffers.sort((a, b) => {
			return a.croid - b.croid;
		});
	}
	
	/*
	 * This method will combine buffers on the GPU. It's disabled for now, not that it doesn't work, but it seems to generate quite a bit of "stuttering". Maybe we need to use a different type of buffer.
	 */
	combineBuffers() {
		// TODO this is not working currently
		
		for (var transparency of [false, true]) {
			var buffers = this.getBuffers(transparency, false);
			
			// This is only done when useObjectColors is false for now, probably because that's going to be the default anyways
			
			if (buffers.length > 1 && !this.viewer.settings.useObjectColors) {
				console.log("Combining buffers", buffers.length);
				
				var nrPositions = 0;
				var nrNormals = 0;
				var nrIndices = 0;
				var nrColors = 0;
				
				for (var buffer of buffers) {
					nrPositions += buffer.nrPositions;
					nrNormals += buffer.nrNormals;
					nrIndices += buffer.nrIndices;
					nrColors += buffer.nrColors;
				}
				
				const positionBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, positionBuffer);
				this.gl.bufferData(this.gl.COPY_WRITE_BUFFER, nrPositions * (this.settings.quantizeVertices ? 2 : 4) , this.gl.STATIC_DRAW);
				
				const normalBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, normalBuffer);
				this.gl.bufferData(this.gl.COPY_WRITE_BUFFER, nrNormals * (this.settings.quantizeNormals ? 1 : 4), this.gl.STATIC_DRAW);

				var colorBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, colorBuffer);
				this.gl.bufferData(this.gl.COPY_WRITE_BUFFER, nrColors * (this.settings.quantizeColors ? 1 : 4), this.gl.STATIC_DRAW);
				
				const indexBuffer = this.gl.createBuffer();
				this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
				this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, nrIndices * 4, this.gl.STATIC_DRAW);

				var positionsOffset = 0;
				var normalsOffset = 0;
				var indicesOffset = 0;
				var colorsOffset = 0;

				for (var buffer of buffers) {
					this.gl.bindBuffer(this.gl.COPY_READ_BUFFER, buffer.positionBuffer);
					this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, positionBuffer);
					this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.COPY_WRITE_BUFFER, 0, positionsOffset * (this.settings.quantizeVertices ? 2 : 4), buffer.nrPositions * (this.settings.quantizeVertices ? 2 : 4));
					
					this.gl.bindBuffer(this.gl.COPY_READ_BUFFER, buffer.normalBuffer);
					this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, normalBuffer);
					this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.COPY_WRITE_BUFFER, 0, normalsOffset * (this.settings.quantizeNormals ? 1 : 4), buffer.nrNormals * (this.settings.quantizeNormals ? 1 : 4));

					this.gl.bindBuffer(this.gl.COPY_READ_BUFFER, buffer.colorBuffer);
					this.gl.bindBuffer(this.gl.COPY_WRITE_BUFFER, colorBuffer);
					this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.COPY_WRITE_BUFFER, 0, colorsOffset * (this.settings.quantizeColors ? 1 : 4), buffer.nrColors * (this.settings.quantizeColors ? 1 : 4));

					if (positionsOffset == 0) {
						// Minor optimization for the first buffer
						this.gl.bindBuffer(this.gl.COPY_READ_BUFFER, buffer.indexBuffer);
						this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
						this.gl.copyBufferSubData(this.gl.COPY_READ_BUFFER, this.gl.ELEMENT_ARRAY_BUFFER, 0, 0, buffer.nrIndices * 4);
					} else {
						var startIndex = positionsOffset / 3;
						
						this.gl.bindBuffer(this.gl.COPY_READ_BUFFER, buffer.indexBuffer);
						var tmpIndexBuffer = new Int32Array(buffer.nrIndices);
						this.gl.getBufferSubData(this.gl.COPY_READ_BUFFER, 0, tmpIndexBuffer, 0, buffer.nrIndices);
						
						for (var i=0; i<buffer.nrIndices; i++) {
							tmpIndexBuffer[i] = tmpIndexBuffer[i] + startIndex;
						}
						
						this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
						this.gl.bufferSubData(this.gl.ELEMENT_ARRAY_BUFFER, indicesOffset * 4, tmpIndexBuffer, 0, buffer.nrIndices);
					}

					this.gl.deleteBuffer(buffer.positionBuffer);
					this.gl.deleteBuffer(buffer.normalBuffer);
					this.gl.deleteBuffer(buffer.colorBuffer);
					this.gl.deleteBuffer(buffer.indexBuffer);
					
					this.gl.deleteVertexArray(buffer.vao);
					
					positionsOffset += buffer.nrPositions;
					normalsOffset += buffer.nrNormals;
					indicesOffset += buffer.nrIndices;
					colorsOffset += buffer.nrColors;
				}
				
				var programInfo = this.viewer.programManager.getProgram({
					picking: false,
					instancing: false,
					useObjectColors: this.settings.useObjectColors,
					quantizeNormals: this.settings.quantizeNormals,
					quantizeVertices: this.settings.quantizeVertices,
					quantizeColors: this.settings.quantizeColors
				});
				
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
				{
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

				this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

				this.gl.bindVertexArray(null);
				
				var newBuffer = {
					positionBuffer: positionBuffer,
					normalBuffer: normalBuffer,
					indexBuffer: indexBuffer,
					colorBuffer: colorBuffer,
					nrIndices: indicesOffset,
					nrPositions: positionsOffset,
					nrNormals: normalsOffset,
					nrColors: colorsOffset,
					vao: vao,
					hasTransparency: transparency,
					reuse: false
				};
				
				var previousLength = buffers.length;
				buffers.length = 0;
				buffers.push(newBuffer);
				
				return previousLength - 1;
			}
		}
		return 0;
	}
}