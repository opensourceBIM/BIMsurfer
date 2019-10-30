import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

/**
 * Configures the viewer's light sources.
 * @todo This class's API will probably change as we add ability to configure multiple light sources.
 */
export class Lighting {

    constructor(viewer) {

        this.viewer = viewer;
        this._dir = new Float32Array([-0.3, -0.7, -1.0]);
        vec3.normalize(this._dir, this._dir);
        this._color = new Float32Array([0.4, 0.4, 0.4]);
        this._ambientColor = new Float32Array([0.3, 0.3, 0.3]);
        this._intensity = 0.5;
        this._bufferData = new Float32Array(52);
        this._buffer = null;

        this._setDirty();
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = 2;
    }
    
    _update() {
        if (!this._dirty) {
            return;

        }
        var bufferData = this._bufferData;

        bufferData[0] = this._dir[0];
        bufferData[1] = this._dir[1];
        bufferData[2] = this._dir[2];
        bufferData[3] = 0; // unused
        bufferData[4] = this._color[0];
        bufferData[5] = this._color[1];
        bufferData[6] = this._color[2];
        bufferData[7] = 0; // unused
        bufferData[8] = this._ambientColor[0];
        bufferData[9] = this._ambientColor[1];
        bufferData[10] = this._ambientColor[2];
        bufferData[11] = 0; // unused;
        bufferData[12] = this._intensity;

        var gl = this.viewer.gl;

        this._buffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, bufferData, gl.DYNAMIC_DRAW, 0, 52);

        this._dirty = false;
    }

    setDir(dir) {
        this._dir.set(dir);
        this._setDirty();
    }

    setColor(color) {
        this._color.set(color);
        this._setDirty();
    }

    setAmbientColor(ambientColor) {
        this._ambientColor.set(ambientColor);
        this._setDirty();
    }

    setIntensity(intensity) {
        this._intensity = intensity;
        this._setDirty();
    }

    render(uniformBlockLocation) {
        if (this._dirty) {
            this._update();
        }
        this.viewer.gl.bindBufferBase(this.viewer.gl.UNIFORM_BUFFER, uniformBlockLocation, this._buffer);
    }
}