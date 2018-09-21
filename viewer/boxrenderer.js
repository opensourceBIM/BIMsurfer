import FaceRenderer from './facerenderer.js'

// Simple (reusable) class to draw a box with faces
export default class BoxRenderer extends FaceRenderer {
	constructor(viewer, gl) {
		super(gl);
		this.gl = gl;
		this.viewer = viewer;
		
		var a = [-0.5, 0.5, -0.5];
		var b = [0.5, 0.5, -0.5];
		var c = [0.5, -0.5, -0.5];
		var d = [-0.5, -0.5, -0.5];
		var e = [-0.5, 0.5, 0.5];
		var f = [0.5, 0.5, 0.5];
		var g = [0.5, -0.5, 0.5];
		var h = [-0.5, -0.5, 0.5];
		
		this.pushTriangle(a, c, b);
		this.pushTriangle(a, d, c);

		this.pushTriangle(b, g, f);
		this.pushTriangle(b, c, g);

		this.pushTriangle(f, h, e);
		this.pushTriangle(f, g, h);

		this.pushTriangle(e, d, a);
		this.pushTriangle(e, h, d);

		this.pushTriangle(d, g, c);
		this.pushTriangle(d, h, g);

		this.pushTriangle(e, b, f);
		this.pushTriangle(e, a, b);

		this.finalize();
	}
}