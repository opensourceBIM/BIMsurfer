export default class RenderLayer {
	constructor(viewer) {
		this.settings = viewer.settings;
		this.viewer = viewer;
		this.gl = viewer.gl;

		this.loaders = new Map();
	}
	
	createGeometry(loaderId, roid, geometryId, positions, normals, colors, color, indices, hasTransparency, reused) {
		var bytes = 0;
		if (this.settings.quantizeVertices) {
			bytes += positions.length * 2;
		} else {
			bytes += positions.length * 4;
		}
		if (colors != null) {
			bytes += colors.length * 4;
		}
		if (indices.length < 65536 && this.settings.useSmallIndicesIfPossible) {
			bytes += indices.length * 2;
		} else {
			bytes += indices.length * 4;
		}
		if (this.settings.quantizeNormals) {
			bytes += normals.length;
		} else {
			bytes += normals.length * 4;
		}
		var geometry = {
				id: geometryId,
				roid: roid,
				positions: positions,
				normals: normals,
				colors: colors,
				color: color,
				indices: indices,
				hasTransparency: hasTransparency,
				reused: reused, // How many times this geometry is reused, this does not necessarily mean the viewer is going to utilize this reuse
				reuseMaterialized: 0, // How many times this geometry has been reused in the viewer, when this number reaches "reused" we can flush the buffer fo' sho'
				bytes: bytes,
				matrices: []
		};
		
		var loader = this.getLoader(loaderId);

		loader.geometries[geometryId] = geometry;
		geometry.isReused = this.settings.reuseFn(reused, geometry);
		if (geometry.isReused) {
			this.viewer.stats.inc("Models", "Geometries reused");
		} else {
			this.viewer.stats.inc("Models", "Geometries");
		}

		return geometry;
	}

	getLoader(loaderId) {
		return this.loaders.get(loaderId);
	}
	
	removeLoader(loaderId) {
		this.loaders.delete(loaderId);
	}
	
	getObject(loaderId, identifier) {
		return this.getLoader(loaderId).objects[identifier];
	}
	
	registerLoader(loaderId) {
		this.loaders.set(loaderId, {
			loaderId: loaderId,
			objects: {},
			geometries: {}
		});
	}
}