/**
 * Configures perspective projection mode for the camera.
 * Perspective projection is represented as a viewing frustum, given as six planes, along with a field of view (FOV) angle.
 */
export class Perspective {

    constructor(viewer) {
        this.viewer = viewer;
        this._projMatrix = mat4.create();
        this._projMatrixInverted = mat4.create();
        this._fov = 45;
        this._near = 0.01;
        this._far = 100;
        this._dirty = true;
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = true;
    }

    build() {
        var aspect = this.viewer.width / this.viewer.height;
        mat4.perspective(this._projMatrix, this._fov * Math.PI / 180.0, aspect, this._near, this._far);
        mat4.invert(this._projMatrixInverted, this._projMatrix);
        this._dirty = false;
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

    /**
     Sets the position of the near plane on the positive View-space Z-axis. Default is 0.1.

     @param {Number} near Position of the near clipping plane. The valid range is between 0 and the current value of the far plane
     */
    set near(near) {
        this._near = near || 0.01;
        this._setDirty();
    }

    /**
     Gets the position of the near plane on the positive View-space Z-axis.

     @return {Number} Position of the near clipping plane.
     */
    get near() {
        return this._near;
    }

    /**
     Sets the position of the far plane on the positive View-space Z-axis. Default is 5000.

     @param {Number} far Position of the far clipping plane. The valid range is between the current value of the near plane and infinity.
     */
    set far(far) {
        this._far = far || 5000;
        this._setDirty();
    }

    /**
     Gets the position of the far clipping plane on the positive View-space Z-axis.

     @return {Number} Position of the far clipping plane.
     */
    get far() {
        return this._far;
    }

    /**
     Gets the current projection projection transform matrix.

     This will be the camera's current projection matrix when it's in perspective projection mode.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get projMatrix() {
        if (this._dirty) {
            this.build();
        }
        return this._projMatrix;
    }

    get projMatrixInverted() {
        if (this._dirty) {
            this.build();
        }
        return this._projMatrixInverted;
    }
}