import RenderLayer from './renderlayer.js'

/*
 * This class intended for debugging by rendering additional stuff on screen
 */

export default class DebugRenderLayer extends RenderLayer{
	constructor(viewer) {
		super(viewer);
		
		this.boundingBoxes = [];
		this.virtualFrustums = [];
	}

	addBoundingBox(bounds) {
		this.boundingBoxes.push(bounds);
	}

	render(transparency) {
//		for (var bb of this.boundingBoxes) {
//			this.viewer.gl.drawArrays(this.gl.LINES, 0, 12);
//		}
		for (var virtualFrustum of this.virtualFrustums) {
			virtualFrustum.render();
		}
	}

	pick() {
	}
	
	addVirtualFrustum(virtualFrustum) {
		this.virtualFrustums.push(virtualFrustum);
	}
}