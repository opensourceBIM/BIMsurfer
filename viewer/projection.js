import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

export class Projection {
	constructor(viewer) {
        this.viewer = viewer;
        
        this._projMatrix = mat4.create();
        this._projMatrixInverted = mat4.create();

        this._dirty = true;
	}
	
	setModelBounds(modelBounds) {
		this.modelBounds = modelBounds;
	}
	
	build() {
    	if (this.viewer.width == null || this.viewer.height == null) {
    		throw "Viewer dimensions unknown, cannot continue";
    	}
        this._dirty = false;
	}
	
    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = 2;
    }
    
    /**
	 * Sets the position of the near plane on the positive View-space Z-axis.
	 * Default is 0.1.
	 * 
	 * @param {Number}
	 *            near Position of the near clipping plane. The valid range is
	 *            between 0 and the current value of the far plane
	 */
   set near(near) {
       this._near = near || 0.01;
       this._setDirty();
   }

   /**
	 * Gets the position of the near plane on the positive View-space Z-axis.
	 * 
	 * @return {Number} Position of the near clipping plane.
	 */
   get near() {
       return this._near;
   }

   /**
	 * Sets the position of the far plane on the positive View-space Z-axis.
	 * Default is 5000.
	 * 
	 * @param {Number}
	 *            far Position of the far clipping plane. The valid range is
	 *            between the current value of the near plane and infinity.
	 */
   set far(far) {
       this._far = far || 5000;
       this._setDirty();
   }

   /**
	 * Gets the position of the far clipping plane on the positive View-space
	 * Z-axis.
	 * 
	 * @return {Number} Position of the far clipping plane.
	 */
   get far() {
       return this._far;
   }
    
    /**
	 * Gets the current projection projection transform matrix.
	 * 
	 * This will be the camera's current projection matrix when it's in
	 * perspective projection mode.
	 * 
	 * @return {Float32Array} 4x4 column-order matrix as an array of 16
	 *         contiguous floats.
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