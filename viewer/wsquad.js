import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

/**
 * A World-space quadrangle used for rendering a capping polygon for the sectionplane.
 *
 * @export
 * @class WSQuad
 */

export class WSQuad {

    constructor(viewer, gl) {
        this.gl = gl;
        this.viewer = viewer;

        this.temp = vec3.create();
        
        let vao = this.vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        let positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1., +1.,   -1., -1.,   +1., -1.,
            -1., +1.,   +1., -1.,   +1., +1.
        ]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        let vs_source = `#version 300 es
        precision highp float;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        layout(location=0) in vec4 vertexPosition;
        layout(std140) uniform Placement {
            /* vec4 for alignment */
            vec4 position;
            vec4 axis1;
            vec4 axis2;
            /* float size; size is in the position.w */
        } placement;
        out vec2 uv;
        void main() {
            gl_Position = projectionMatrix * viewMatrix * vec4(placement.position.xyz + 
                vertexPosition.x * placement.axis1.xyz * placement.position.w + 
                vertexPosition.y * placement.axis2.xyz * placement.position.w, 1.);
        }`;

        let fs_source = `#version 300 es
        precision highp float;
        out vec4 fragColor;
        void main() {
            fragColor = vec4(0.1, 0.1, 0.1, 1.0);
        }`;

        let vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vs_source);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(vs));
        }
        let fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fs_source);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(fs));
        }
        let p = this.program = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(p));
        }
        
        this.locations = {
            placement: gl.getUniformBlockIndex(p, "Placement"),
            viewMatrix: gl.getUniformLocation(p, "viewMatrix"),
            projectionMatrix: gl.getUniformLocation(p, "projectionMatrix")
        };

        this.placementData = new Float32Array(12);
    }

    position(bounds, planeEq) {
        const Z = vec3.fromValues(0,0,1);
        
        let l = vec3.len(planeEq);
        for (var i = 0; i < 3; ++i) {
            this.placementData[i] = planeEq[3] * planeEq[i] / l;
        }

        let X = this.placementData.subarray(4, 7);
        let Y = this.placementData.subarray(8, 11);
        let XY = [X, Y];
        vec3.cross(X, planeEq, Z);
        vec3.normalize(X, X);
        vec3.cross(Y, X, planeEq)
        vec3.normalize(Y, Y);
        let scale = 0.;
        
        let zero_one = [0,1];
        for (let i of zero_one) {
            for (let j of zero_one) {
                for (let k of zero_one) {
                    let p = vec3.fromValues(bounds[3*i+0], bounds[3*j+1], bounds[3*k+2]);
                    vec3.subtract(this.temp, p, planeEq);
                    let d = vec3.dot(planeEq, this.temp);
                    vec3.scale(this.temp, planeEq, d);
                    vec3.subtract(this.temp, p, this.temp);
                    for (let i = 0; i < 2; ++i) {
                        let d = Math.abs(vec3.dot(this.temp, XY[i]));
                        if (d > scale) {
                            scale = d;
                        }
                    }
                }
            }
        }
        this.placementData[3] = scale;
        
        let gl = this.gl;
        this._buffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, this.placementData, gl.DYNAMIC_DRAW);        
    }

    draw(vm, pm) {
        let gl = this.gl;

        gl.useProgram(this.program);
        
        gl.uniformMatrix4fv(this.locations.projectionMatrix, false, this.viewer.camera.projMatrix);
        gl.uniformMatrix4fv(this.locations.viewMatrix, false, this.viewer.camera.viewMatrix);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this.locations.placement, this._buffer);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }
}