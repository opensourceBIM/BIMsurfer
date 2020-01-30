import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

import {FrustumPlane} from "./frustumplane.js";

/**
 * Frustum for fast World-space frustum-AABB collision testing
 * 
 * @export
 * @class Frustum
 */
export class Frustum {

    constructor() {
    	this.tempMat4 = mat4.create();
    	
        this.planes = [ // Allocate now, init when needed
            new FrustumPlane(),
            new FrustumPlane(),
            new FrustumPlane(),
            new FrustumPlane(),
            new FrustumPlane(),
            new FrustumPlane()
        ];
    }

    init(viewMatrix, projMatrix) { // Builds frustum planes} from view and projection matrices
        var m = this.tempMat4;
        mat4.multiply(m, projMatrix, viewMatrix);
        var m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
        var m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7];
        var m8 = m[8], m9 = m[9], m10 = m[10], m11 = m[11];
        var m12 = m[12], m13 = m[13], m14 = m[14], m15 = m[15];
        this.planes[0].init(m3 - m0, m7 - m4, m11 - m8, m15 - m12);
        this.planes[1].init(m3 + m0, m7 + m4, m11 + m8, m15 + m12);
        this.planes[2].init(m3 - m1, m7 - m5, m11 - m9, m15 - m13);
        this.planes[3].init(m3 + m1, m7 + m5, m11 + m9, m15 + m13);
        this.planes[4].init(m3 - m2, m7 - m6, m11 - m10, m15 - m14);
        this.planes[5].init(m3 + m2, m7 + m6, m11 + m10, m15 + m14);
    }

    // Tests for intersection with World-space AABB, which is assumed to be: [xmin, ymin, zmin, xwidth, ywidth, zwidth]
    intersectsWorldAABB(minmax) {
        var result = Frustum.INSIDE_FRUSTUM;
        var plane = null;
        var normal;
        var offset;
        var testVertex;
        for (var i = 0; i < 6; ++i) {
            plane = this.planes[i];
            normal = plane.normal;
            offset = plane.offset;
            testVertex = plane.testVertex;
            if (((normal[0] * minmax[testVertex[0]][0]) + (normal[1] * minmax[testVertex[1]][1]) + (normal[2] * minmax[testVertex[2]][2]) + (offset)) < 0.0) {
                return Frustum.OUTSIDE_FRUSTUM;
            }
            if (((normal[0] * minmax[1 - testVertex[0]][0]) + (normal[1] * minmax[1 - testVertex[1]][1]) + (normal[2] * minmax[1 - testVertex[2]][2]) + (offset)) < 0.0) {
                result = Frustum.INTERSECT_FRUSTUM; // May still become OUTSIDE_FRUSTUM
            }
        }
        return result;
    }
}

Frustum.OUTSIDE_FRUSTUM = 0;
Frustum.INTERSECT_FRUSTUM = 1;
Frustum.INSIDE_FRUSTUM = 2;