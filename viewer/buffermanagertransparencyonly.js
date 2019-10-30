import {BufferManager} from "./buffermanager.js";

/**
 * A buffer manager that keeps track of only 2 buffers, one opaque and one with transparent data.
 * The buffers in this class use an additional buffer to store vertex-colors.
 */
export class BufferManagerTransparencyOnly extends BufferManager {
	constructor(viewer, settings, renderer, bufferSetPool) {
		super(viewer, settings, renderer, bufferSetPool);
	}

	/*
	 * This implementation uses only the transparency for the key, since transparency is a boolean, there are only two slots.
	 */
	getKey(transparency, color, sizes) {
		return transparency;
	}
	
	shouldFlush(sizes, buffer) {
		if (super.shouldFlush(sizes, buffer)) {
			return true;
		}
		return sizes.colors + (buffer != null ? buffer.colorsIndex : 0) > this.MAX_BUFFER_SIZE * this.colorBufferFactor;
	}
	
	getDefaultByteSize() {
		return super.getDefaultByteSize() + this.defaultSizes.colors * (this.settings.quantizeColors ? 1 : 4);
	}
	
	/* 
	 * In addition to a default buffer, also add a color buffer
	 */
	createBufferSet(transparency, color, sizes) {
		var buffer = super.createBufferSet(transparency, color, sizes);
		buffer.colors = this.settings.quantizeColors ? new Uint8Array(sizes.colors) : new Float32Array(sizes.colors);
		buffer.colorsIndex = 0;
		return buffer;
	}
	
	/*
	 * Additionally reset the color buffer
	 */
	resetBuffer(buffer) {
		super.resetBuffer(buffer);
		buffer.colorsIndex = 0;
	}
}