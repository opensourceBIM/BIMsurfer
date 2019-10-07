// Reuse the text decoder
let utf8TextDecoder = "TextDecoder" in window ? new TextDecoder("utf-8") : null;


var _byteToHex = [];
var _hexToByte = {};
for (var i = 0; i < 256; i++) {
  _byteToHex[i] = (i + 0x100).toString(16).substr(1);
  _hexToByte[_byteToHex[i]] = i;
}

/**
 * This class keeps track of the position of reading, supplies get methods for most types and provides alignment methods.
 * All data is assumed to be in LITTLE_ENDIAN!
 */
export class DataInputStream {

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
		const result = this.arrayBuffer.slice(this.pos, this.pos + size);
		this.pos += size;
		return result;
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

	readUnsignedByte() {
		var value = this.dataView.getUint8(this.pos);
		this.pos += 1;
		return value;
	}

	readLong() {
		var value = this.dataView.getUint32(this.pos, true) + 0x100000000 * this.dataView.getUint32(this.pos + 4, true);
		this.pos += 8;
		return value;
	}

	// Disabled for now as only Chrome currently supports this (27-11-2018)
//	readLongAsBigInt() {
//		var value = this.dataView.getBigInt64(this.pos, true);
//		var value = this.dataView.getUint32(this.pos, true) + 0x100000000 * this.dataView.getUint32(this.pos + 4, true);
//		this.pos += 8;
//		return value;
//	}

	readUuid() {
		const bytes = this.readUnsignedByteArray(16);
		// LITTLE_ENDIAN, Most significant long first
		var bth = _byteToHex;
		return bth[bytes[7]] + bth[bytes[6]] + 
		bth[bytes[5]] + bth[bytes[4]] + "-" + 
		bth[bytes[3]] + bth[bytes[2]] + "-" + 
		bth[bytes[1]] + bth[bytes[0]] + "-" + 
		bth[bytes[15]] + bth[bytes[14]] + "-" + 
		bth[bytes[13]] + bth[bytes[12]] + 
		bth[bytes[11]] + bth[bytes[10]] + 
		bth[bytes[9]] + bth[bytes[8]];
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

	readUnsignedByteArray(length) {
		try {
			var result = new Uint8Array(this.arrayBuffer, this.pos, length);
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

	readDoubleArrayCopy(length) {
		var result = Float64Array.from(new Float64Array(this.arrayBuffer, this.pos, length));
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