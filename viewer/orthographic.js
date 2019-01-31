/**
 * Configures orthographic projection mode for the camera.
 * In this projection mode, an object's size in the rendered image stays constant regardless of its distance} from the camera.
 * Orthographic projection is represented as a viewing frustum, given as six planes.
 */
export class Orthographic {

    constructor(viewer) {
        this.viewer = viewer;
        this._projMatrix = mat4.create();
        this._left = -1.0;
        this._bottom = -1.0;
        this._near = 0.1;
        this._right = 1.0;
        this._top = 1.0;
        this._far = 5000;
        this._dirty = true;
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = true;
    }

    /**
     Sets the position of the left plane on the negative View-space X-axis.

     @param {Number} left Position of the left plane.
     */
    set left(left) {
        left = left || -1.0;
        this._left = left;
        this._setDirty();
    }

    /**
     Gets the position of the left plane on the negative View-space X-axis.

     @return {Number} Position of the left plane.
     */
    get left() {
        return this._left;
    }

    /**
     Sets the position of bottom plane on the negative View-space Y-axis.

     @param {Number} bottom Position of the bottom plane.
     */
    set bottom(bottom) {
        bottom = bottom || -1.0;
        this._bottom = bottom;
        this._setDirty();
    }

    /**
     Gets the position of bottom plane on the negative View-space Y-axis.

     @return {Number} Position of the bottom plane.
     */
    get bottom() {
        return this._bottom;
    }

    /**
     Sets the position of the near plane on the positive View-space Z-axis. Default is 0.1.

     @param {Number} near Position of the near clipping plane. The valid range is between 0 and the current value of the far plane
     */
    set near(near) {
        this._near = near || 0.1;
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
     Sets the position of the right plane on the positive View-space X-axis.

     @param {Number} right Position of the right plane.
     */
    set right(right) {
        right = right || 1.0;
        this._right = right;
        this._setDirty();
    }

    /**
     Gets the position of the right plane on the positive View-space X-axis.

     @return {Number} Position of the right plane.
     */
    get right() {
        return this._right;
    }

    /**
     Sets the position of the top plane on the positive View-space Y-axis.

     @param {Number} top Position of the top plane.
     */
    set top(top) {
        this._top = top || 1.0;
        this._setDirty();
    }

    /**
     Gets the position of the top plane on the positive View-space Y-axis.

     @return {Number} Position of the top plane.
     */
    get top() {
        return this._top;
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
     Gets the current orthographic projection transform matrix.

     This will be the camera's current projection matrix when it's in orthographic projection mode.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get projMatrix() {
        if (this._dirty) {
            mat4.ortho(this._projMatrix, this._left, this._right, this._bottom, this._top, this._near, this._far);
            this._dirty = false;
        }
        return this._projMatrix;
    }
}