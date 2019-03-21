import * as vec3 from "./glmatrix/vec3.js";

/**
 * @ignore
 */
export class FrustumPlane {

    constructor(nx = 0, ny = 0, nz = 1, offset = 1.0) {

        this.normal = vec3.create();
        this.testVertex = vec3.create();
        this.offset = 0;

        this.init(nx, ny, nz, offset);
    }

    init(nx = 0, ny = 0, nz = 1, offset = 1.0) {

        var s = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

        this.normal[0] = nx * s;
        this.normal[1] = ny * s;
        this.normal[2] = nz * s;

        this.offset = offset * s;

        this.testVertex[0] = this.normal[0] >= 0.0 ? 1 : 0;
        this.testVertex[1] = this.normal[1] >= 0.0 ? 1 : 0;
        this.testVertex[2] = this.normal[2] >= 0.0 ? 1 : 0;
    }
}