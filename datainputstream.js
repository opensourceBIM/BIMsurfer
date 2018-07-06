// Reuse the text decoder
let utf8TextDecoder = new TextDecoder("utf-8");

/*
 * This class keeps track of the position of reading, supplies get methods for most types and provides alignment methods.
 * All data is assumed to be in LITTLE_ENDIAN!
 */

export default class DataInputStream {

	constructor(arrayBuffer) {
		this.arrayBuffer = arrayBuffer;
		this.dataView = new DataView(arrayBuffer);
		this.pos = 0;
	}
	
	remaining() {
		return this.arrayBuffer.byteLength - this.pos;
	}

	readUTF8() {
		var length = this.dataView.getInt16(this.pos);
		this.pos += 2;
		var view = this.arrayBuffer.slice(this.pos, this.pos + length);
		var result = utf8TextDecoder.decode(view);
		this.pos += length;
		return result;
	}

	align4() {
		// Skips to the next alignment of 4 (source should have done the same!)
		var skip = 4 - (this.pos % 4);
		if(skip > 0 && skip != 4) {
			this.pos += skip;
		}
	}

	align8() {
		// Skips to the next alignment of 8 (source should have done the same!)
		var skip = 8 - (this.pos % 8);
		if(skip > 0 && skip != 8) {
			this.pos += skip;
		}
	}

	readBytes(size) {
		return this.arrayBuffer.slice(this.pos, this.pos + size);
	}
	
	readFloat() {
		var value = this.dataView.getFloat32(this.pos, true);
		this.pos += 4;
		return value;
	}

	readInt() {
		var value = this.dataView.getInt32(this.pos, true);
		this.pos += 4;
		return value;
	}

	readByte() {
		var value = this.dataView.getInt8(this.pos);
		this.pos += 1;
		return value;
	}

	readLong() {
		var value = this.dataView.getUint32(this.pos, true) + 0x100000000 * this.dataView.getUint32(this.pos + 4, true);
		this.pos += 8;
		return value;
	}

	readFloatArray2(length) {
		var results = [];
		for (var i=0; i<length; i++) {
			var value = this.dataView.getFloat32(this.pos, true);
			this.pos += 4;
			results.push(value);
		}
		return results;
	}
	
	readFloatArray(length) {
		try {
			var result = new Float32Array(this.arrayBuffer, this.pos, length);
			this.pos += length * 4;
			return result;
		} catch (e) {
			console.error(e, this.arrayBuffer.byteLength, this.pos, length);
		}
	}

	readByteArray(length) {
		try {
			var result = new Int8Array(this.arrayBuffer, this.pos, length);
			this.pos += length;
			return result;
		} catch (e) {
			console.error(e, this.arrayBuffer.byteLength, this.pos, length);
		}
	}
	
	readDoubleArray(length) {
		var result = new Float64Array(this.arrayBuffer, this.pos, length);
		this.pos += length * 8;
		return result;
	}

	readIntArray2(length) {
		var results = [];
		for (var i=0; i<length; i++) {
			var value = this.dataView.getInt32(this.pos, true);
			this.pos += 4;
			results.push(value);
		}
		return results;
	}
	
	readIntArray(length) {
		var result = new Int32Array(this.arrayBuffer, this.pos, length);
		this.pos += length * 4;
		return result;
	}
	
	readShortArray(length) {
		try {
			var result = new Int16Array(this.arrayBuffer, this.pos, length);
			this.pos += length * 2;
			return result;
		} catch (e) {
			console.error(e, this.pos, length);
		}
	}
}