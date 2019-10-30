import {BufferManager} from "./buffermanager.js";

/**
 * Buffer manager that keeps track of one buffer per color. This buffer is used when useObjectColor is on.
 */
export class BufferManagerPerColor extends BufferManager {
	constructor(viewer, settings, renderer, bufferSetPool) {
		super(viewer, settings, renderer, bufferSetPool);
	}

	/*
	 * The key here is a hash of the color
	 * TODO: JSON.stringify is a bit slow for this, need to look for a consistent hashing algo for 4 floats... 
	 */
	getKey(transparency, color, sizes) {
//		return color.r + color.g + color.b + color.a;
		return JSON.stringify(color);
	}
}