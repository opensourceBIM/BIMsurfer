import FatLineRenderer from './fatlinerenderer.js'

// Simple (reusable) class to draw a linebox
export default class LineBoxGeometry extends FatLineRenderer {
	constructor(viewer, gl) {
		super(gl);
		this.idx = 0;
		
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
		
		this.pushVertices(a, b);
		this.pushVertices(b, c);
		this.pushVertices(c, d);
		this.pushVertices(d, a);
		
		this.pushVertices(e, f);
		this.pushVertices(f, g);
		this.pushVertices(g, h);
		this.pushVertices(h, e);

		this.pushVertices(a, e);
		this.pushVertices(b, f);
		this.pushVertices(c, g);
		this.pushVertices(d, h);

		this.finalize();
	}	
}