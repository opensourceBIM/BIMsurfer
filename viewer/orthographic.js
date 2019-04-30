import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {Projection} from "./projection.js";

/**
 * Configures orthographic projection mode for the camera.
 * In this projection mode, an object's size in the rendered image stays constant regardless of its distance} from the camera.
 * Orthographic projection is represented as a viewing frustum, given as six planes.
 */
export class Orthographic extends Projection {

    constructor(viewer) {
    	super(viewer);

        this._near = 0.1;
        this._far = 5000;
        this.zoomFactor = 3;
    }
    
	setModelBounds(modelBounds) {
		super.setModelBounds(modelBounds);
    }
    
    zoom(delta) {
    	this.zoomFactor += (delta / 10000);
    	this.build();
    }

    build() {
    	super.build();

    	var maxW = 0;
		for (let i=0; i<3; i++) {
			let w = this.modelBounds[3 + i] - this.modelBounds[i];
			if (w > maxW) {
				maxW = w;
			}
		}
		
		maxW *= this.zoomFactor;
		
        var aspect = this.viewer.width / this.viewer.height;
        const maxH = maxW / aspect;
		
		this._left =  -maxW / 2;
		this._bottom = -maxH / 2;
		this._right = maxW / 2;
		this._top = maxH / 2;
    	
        mat4.ortho(this._projMatrix, this._left, this._right, this._bottom, this._top, this._near, this._far);
        mat4.invert(this._projMatrixInverted, this._projMatrix);
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
}