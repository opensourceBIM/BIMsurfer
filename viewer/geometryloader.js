import { Utils } from "./utils.js"
import { RenderLayer } from "./renderlayer.js"

export class GeometryLoader {
	processPreparedBufferInit(stream, hasTransparancy) {
		this.preparedBuffer = {};

		this.preparedBuffer.nrObjects = stream.readInt();
		this.preparedBuffer.nrIndices = stream.readInt();
		this.preparedBuffer.positionsIndex = stream.readInt();
		this.preparedBuffer.normalsIndex = stream.readInt();
		this.preparedBuffer.colorsIndex = stream.readInt();

		this.preparedBuffer.nrObjectsRead = 0;

		this.preparedBuffer.nrColors = this.preparedBuffer.positionsIndex * 4 / 3;

		this.preparedBuffer.indices = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrIndices, this.renderLayer.gl.ELEMENT_ARRAY_BUFFER, 3, WebGL2RenderingContext.UNSIGNED_INT, "Uint32Array");
		this.preparedBuffer.colors = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrColors, this.renderLayer.gl.ARRAY_BUFFER, 4, WebGL2RenderingContext.UNSIGNED_BYTE, "Uint8Array");
		this.preparedBuffer.vertices = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.positionsIndex, this.renderLayer.gl.ARRAY_BUFFER, 3, this.loaderSettings.quantizeVertices ? WebGL2RenderingContext.SHORT : WebGL2RenderingContext.FLOAT, this.loaderSettings.quantizeVertices ? "Int16Array" : "Float32Array");
		this.preparedBuffer.normals = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.normalsIndex, this.renderLayer.gl.ARRAY_BUFFER, 3, WebGL2RenderingContext.BYTE, "Int8Array");
		this.preparedBuffer.pickColors = Utils.createEmptyBuffer(this.renderLayer.gl, this.preparedBuffer.nrColors, this.renderLayer.gl.ARRAY_BUFFER, 4, WebGL2RenderingContext.UNSIGNED_BYTE, "Uint8Array");

		this.preparedBuffer.geometryIdToIndex = new Map();

		this.preparedBuffer.loaderId = this.loaderId;
		this.preparedBuffer.hasTransparency = hasTransparancy;

		if (this.loaderSettings.quantizeVertices) {
			this.preparedBuffer.unquantizationMatrix = this.unquantizationMatrix;
		}

		this.preparedBuffer.bytes = RenderLayer.calculateBytesUsed(this.settings, this.preparedBuffer.positionsIndex, this.preparedBuffer.nrColors, this.preparedBuffer.nrIndices, this.preparedBuffer.normalsIndex);
		
		stream.align8();
	}

	processPreparedBuffer(stream, hasTransparancy) {
		const nrObjects = stream.readInt();
		const totalNrIndices = stream.readInt();
		const positionsIndex = stream.readInt();
		const normalsIndex = stream.readInt();
		const colorsIndex = stream.readInt();

		if (this.preparedBuffer.nrIndices == 0) {
			return;
		}
		const previousStartIndex = this.preparedBuffer.indices.writePosition / 4;
		const previousColorIndex = this.preparedBuffer.colors.writePosition;
		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.indices, stream.dataView, stream.pos, totalNrIndices);
		stream.pos += totalNrIndices * 4;

		var nrColors = positionsIndex * 4 / 3;
		var colors = new Uint8Array(nrColors);
		var colors32 = new Uint32Array(colors.buffer);
		var createdObjects = null;

		if (hasTransparancy) {
			createdObjects = this.createdTransparentObjects;
		} else {
			createdObjects = this.createdOpaqueObjects;
		}

		var pickColors = new Uint8Array(positionsIndex * 4);
		var pickColors32 = new Uint32Array(pickColors.buffer);
		pickColors.i = 0;

		var currentColorIndex = 0;
		var tmpOids = new Set();
		for (var i = 0; i < nrObjects; i++) {
			var oid = stream.readLong();
			tmpOids.add(oid);
			var startIndex = stream.readInt();
			var nrIndices = stream.readInt();
			var nrVertices = stream.readInt();
			var minIndex = stream.readInt();
			var maxIndex = stream.readInt();
			var nrObjectColors = nrVertices / 3 * 4;

			const density = stream.readFloat();

			var colorPackSize = stream.readInt();
			if (createdObjects) {
				var object = createdObjects.get(oid);
				object.density = density;
			} else {
				this.renderLayer.viewer.addViewObject(oid, {pickId: oid});
				var pickColor = this.renderLayer.viewer.getPickColor(oid);
				var color32 = pickColor[0] + pickColor[1] * 256 + pickColor[2] * 256 * 256 + pickColor[3] * 256 * 256 * 256;
				pickColors32.fill(color32, pickColors.i / 4, (pickColors.i + nrObjectColors) / 4);
				pickColors.i += nrObjectColors;
			}

			const meta = {
				start: previousStartIndex + startIndex,
				length: nrIndices,
				color: previousColorIndex + currentColorIndex,
				colorLength: nrObjectColors,
				minIndex: minIndex,
				maxIndex: maxIndex
			};
			this.preparedBuffer.geometryIdToIndex.set(oid, [meta]);

			if (colorPackSize == 0) {
				// Generate default colors for this object
				var defaultColor = this.renderLayer.viewer.defaultColors[object.type];
				if (defaultColor == null) {
					defaultColor = this.renderLayer.viewer.defaultColors.DEFAULT;
				}
				if (defaultColor.asInt == null) {
					// Cache the integer version
					var color = new Uint8Array(4);
					color[0] = defaultColor.r * 255;
					color[1] = defaultColor.g * 255;
					color[2] = defaultColor.b * 255;
					color[3] = defaultColor.a * 255;
					defaultColor.asInt = color[0] + color[1] * 256 + color[2] * 65536 + color[3] * 16777216;
				}
				colors32.fill(defaultColor.asInt, currentColorIndex / 4, (currentColorIndex + nrObjectColors) / 4);
				currentColorIndex += nrObjectColors;
			}
			for (var j = 0; j < colorPackSize; j++) {
				var count = stream.readInt();
				var color = stream.readUnsignedByteArray(4);
				var color32 = color[0] + color[1] * 256 + color[2] * 65536 + color[3] * 16777216;
				colors32.fill(color32, (currentColorIndex / 4), (currentColorIndex + count) / 4);
				currentColorIndex += count;
			}
		}
		if (currentColorIndex != nrColors) {
			console.error(currentColorIndex, nrColors);
		}
		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.colors, colors, 0, nrColors);

		if (this.loaderSettings.quantizeVertices) {
			Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, stream.dataView, stream.pos, positionsIndex);
			stream.pos += positionsIndex * 2;
		} else {
			Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.vertices, stream.dataView, stream.pos, positionsIndex);
			stream.pos += positionsIndex * 4;
		}
		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.normals, stream.dataView, stream.pos, normalsIndex);
		stream.pos += normalsIndex;

		if (createdObjects) {
			for (var [oid, objectInfo] of createdObjects) {
				if (tmpOids.has(oid)) {
					var pickColor = this.renderLayer.viewer.getPickColor(oid);
					var color32 = pickColor[0] + pickColor[1] * 256 + pickColor[2] * 256 * 256 + pickColor[3] * 256 * 256 * 256;
					var lenObjectPickColors = objectInfo.nrColors;
					pickColors32.fill(color32, pickColors.i / 4, (pickColors.i + lenObjectPickColors) / 4);
					pickColors.i += lenObjectPickColors;
				}
			}
		}

		Utils.updateBuffer(this.renderLayer.gl, this.preparedBuffer.pickColors, pickColors, 0, pickColors.i);

		this.preparedBuffer.nrObjectsRead += nrObjects;
		if (this.preparedBuffer.nrObjectsRead == this.preparedBuffer.nrObjects) {
			// Making a copy of the map, making sure it's sorted by oid, which will make other things much faster later on
			this.preparedBuffer.geometryIdToIndex = Utils.sortMapKeys(this.preparedBuffer.geometryIdToIndex);
			this.renderLayer.addCompleteBuffer(this.preparedBuffer, this.gpuBufferManager);
		}

		stream.align8();
	}
}