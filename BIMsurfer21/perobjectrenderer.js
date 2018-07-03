// Deprecated
// The idea was that this is an alternative renderer to OneBufferRenderer, which is actually still a good idea, but this class is not maintained for now

export default class PerObjectRenderer {
	constructor(viewer) {
		this.objects = {};
		this.geometry = {};
		this.viewer = viewer;
		this.gl = viewer.gl;
	}

	getObject(identifier) {
		return this.objects[identifier];
	}
	
	createGeometry(geometryId, positions, normals, colors, indices, hasTransparency) {
		var geometry = {
			id: geometryId
		};
		  const positionBuffer = this.gl.createBuffer();
		  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		  this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

		  const normalBuffer = this.gl.createBuffer();
		  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
		  this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
		  
		  if (colors != null) {
			  const colorBuffer = this.gl.createBuffer();
			  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
			  this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.STATIC_DRAW);
			  geometry.color = colorBuffer;
		  }

		  const indexBuffer = this.gl.createBuffer();
		  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		  this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);

		  // TMP
// geometry.positions = positions;
		  
		  geometry.hasTransparency = hasTransparency;
		  geometry.nrVertices = positions.length / 3;
		  geometry.nrTriangles = indices.length / 3;
		  geometry.nrIndices = indices.length;
		  geometry.nrColors = colors.length / 4;
		  geometry.position = positionBuffer;
		  geometry.normals = normalBuffer;
		  geometry.indices = indexBuffer;

		  this.geometry[geometryId] = geometry;
		  this.viewer.setParameter("Geometries", Object.keys(this.geometry).length);
		  return geometry;
	}
	
	createObject(modelId, roid, oid, objectId, geometryIds, type, matrix, hasTransparency) {
		var object = {
			id: objectId,
			hasTransparency: hasTransparency,
			matrix: matrix,
			geometry: [],
			object: this.viewer.model.objects[oid],
			add: (id) => {
				object.geometry.push(id);
			}
		};
		
		geometryIds.forEach((id) => {
			object.geometry.push(id);
		});
		
		this.objects[oid] = object;
		  this.viewer.setParameter("Objects", Object.keys(this.objects).length);
		
		return object;
	}
	
	renderObject(modelViewMatrix, normalMatrix, object) {
		if (object.objectMatrix == null) {
			object.objectMatrix = mat4.create();
		}
		  mat4.multiply(object.objectMatrix, modelViewMatrix, object.matrix);
		  object.geometry.forEach((geometryId) => {
			  var geometry = this.geometry[geometryId];
			  {
				    const numComponents = 3;
				    const type = this.gl.FLOAT;
				    const normalize = false;
				    const stride = 0;
				    const offset = 0;
				    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.position);
				    this.gl.vertexAttribPointer(
				        this.viewer.programInfo.attribLocations.vertexPosition,
				        numComponents,
				        type,
				        normalize,
				        stride,
				        offset);
				    this.gl.enableVertexAttribArray(
				    	this.viewer.programInfo.attribLocations.vertexPosition);
				  }
			  {
				  const numComponents = 3;
				  const type = this.gl.FLOAT;
				  const normalize = false;
				  const stride = 0;
				  const offset = 0;
				  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.normals);
				  this.gl.vertexAttribPointer(
						  this.viewer.programInfo.attribLocations.vertexNormal,
						  numComponents,
						  type,
						  normalize,
						  stride,
						  offset);
				  this.gl.enableVertexAttribArray(
						  this.viewer.programInfo.attribLocations.vertexNormal);
			  }

				  {
				    const numComponents = 4;
				    const type = this.gl.FLOAT;
				    const normalize = false;
				    const stride = 0;
				    const offset = 0;
				    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, geometry.color);
				    this.gl.vertexAttribPointer(
				    	this.viewer.programInfo.attribLocations.vertexColor,
				        numComponents,
				        type,
				        normalize,
				        stride,
				        offset);
				    this.gl.enableVertexAttribArray(
				    	this.viewer.programInfo.attribLocations.vertexColor);
				  }
				  
				  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices);
				  this.gl.useProgram(this.viewer.programInfo.program);

				  this.gl.uniformMatrix4fv(this.viewer.programInfo.uniformLocations.projectionMatrix, false, this.viewer.projectionMatrix);
				  this.gl.uniformMatrix4fv(this.viewer.programInfo.uniformLocations.normalMatrix, false, normalMatrix);
				  this.gl.uniformMatrix4fv(this.viewer.programInfo.uniformLocations.modelViewMatrix, false, object.objectMatrix);
				  
				  this.gl.uniform3fv(this.viewer.programInfo.uniformLocations.lightPosition, this.viewer.lightPosition);
				  this.gl.uniform3fv(this.viewer.programInfo.uniformLocations.lightColor, this.viewer.lightColor);
				  this.gl.uniform1f(this.viewer.programInfo.uniformLocations.shininess, this.viewer.shininess);
				  this.gl.uniform3fv(this.viewer.programInfo.uniformLocations.ambientColor, this.viewer.ambientColor);

				  {
				    const type = this.gl.UNSIGNED_SHORT;
				    const offset = 0;
				    
// this.gl.drawArrays(this.gl.TRIANGLES, 0, geometry.nrIndices / 3);
				    this.gl.drawElements(this.gl.TRIANGLES, geometry.nrIndices, type, offset);
// var error = gl.getError();
// if (error != gl.NO_ERROR) {
// console.error(error);
// this.running = false;
// }
				  }		  
		  	});			  
	}

	render() {
		  for (const oid in this.objects) {
			  const object = this.objects[oid];
			  if (!object.hasTransparency) {
				  this.renderObject(this.viewer.modelViewMatrix, this.viewer.normalMatrix, object);
			  }
		  }
		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
		this.gl.depthMask(false);

	  for (const oid in this.objects) {
		  const object = this.objects[oid];
		  if (object.hasTransparency) {
			  this.renderObject(this.viewer.modelViewMatrix, this.viewer.normalMatrix, object);
		  }
	  }
	}

	done() {
		
	}
}