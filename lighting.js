/*
 * Static lighting
 */

export default class Lighting {
	constructor(gl) {
		this.lightDir = [1.0, 0.0, -1.0];
		this.lightColor = [0.4, 0.4, 0.4];
		this.shininess = 0.1;
		this.ambientColor = [0.3, 0.3, 0.3];
		
		this.gl = gl;
		this.createLightingBuffer();
	}

	createLightingBuffer() {
		var buffer = new Float32Array(52);
		buffer[0] = this.lightDir[0];
		buffer[1] = this.lightDir[1];
		buffer[2] = this.lightDir[2];
		buffer[3] = 0; // unused
		buffer[4] = this.lightColor[0];
		buffer[5] = this.lightColor[1];
		buffer[6] = this.lightColor[2];
		buffer[7] = 0; // unused
		buffer[8] = this.ambientColor[0];
		buffer[9] = this.ambientColor[1];
		buffer[10] = this.ambientColor[2];
		buffer[11] = 0; // unused;
		buffer[12] = this.shininess;

		this.lightingBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.lightingBuffer);
		this.gl.bufferData(this.gl.UNIFORM_BUFFER, buffer, this.gl.DYNAMIC_DRAW, 0, 52);
	}
}