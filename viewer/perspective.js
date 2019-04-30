import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {Projection} from "./projection.js";

/**
 * Configures perspective projection mode for the camera.
 * Perspective projection is represented as a viewing frustum, given as six planes, along with a field of view (FOV) angle.
 */
export class Perspective extends Projection {

    constructor(viewer) {
    	super(viewer);
    	
        this._fov = 45;
        this._near = 0.01;
        this._far = 100;
    }

    build() {
    	super.build();
        var aspect = this.viewer.width / this.viewer.height;
        mat4.perspective(this._projMatrix, this._fov * Math.PI / 180.0, aspect, this._near, this._far);
        mat4.invert(this._projMatrixInverted, this._projMatrix);
    }

    /**
     Sets the frustum's vertical field of view,} from bottom to top of view, in degrees. Default is 45.

     @param {Number} fov Field of view angle, in degrees.
     */
    set fov(fov) {
        fov = fov || 45;
        fov = Math.min(fov, 120);
        this._fov = fov;
        this._setDirty();
    }

    /**
     Gets the frustum's vertical field of view,} from bottom to top of view, in degrees.

     @return {Number} Field of view angle, in degrees.
     */
    get fov() {
        return this._fov;
    }
}