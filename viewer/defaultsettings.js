export default class DefaultSettings {
	static create(settings) {
		if (settings == null) {
			var settings = {};
		}
		if (settings.useObjectColors == null) {
			settings.useObjectColors = false;
		}
		if (settings.useSmallIndicesIfPossible == null) {
			settings.useSmallIndicesIfPossible = true;
		}
		if (settings.quantizeNormals == null) {
			settings.quantizeNormals = true;
		}
		if (settings.quantizeVertices == null) {
			settings.quantizeVertices = true;
		}
		if (settings.quantizeColors == null) {
			settings.quantizeColors = true;
		}
		if (settings.loaderSettings == null) {
			settings.loaderSettings = {};
		}
		if (settings.loaderSettings.useObjectColors == null) {
			settings.loaderSettings.useObjectColors = false;
		}
		if (settings.loaderSettings.quantizeNormals == null) {
			settings.loaderSettings.quantizeNormals = true;
		}
		if (settings.loaderSettings.quantizeVertices == null) {
			settings.loaderSettings.quantizeVertices = true;
		}
		if (settings.loaderSettings.quantizeColors == null) {
			settings.loaderSettings.quantizeColors = true;
		}
		if (settings.triangleThresholdDefaultLayer == null) {
			settings.triangleThresholdDefaultLayer = 1000000;
		}
		if (settings.assumeGpuMemoryAvailable == null) {
			settings.assumeGpuMemoryAvailable = 1000000000;
		}
		if (settings.defaultLayerEnabled == null) {
			settings.defaultLayerEnabled = true;
		}
		if (settings.tilingLayerEnabled == null) {
			settings.tilingLayerEnabled = true;
		}
		if (settings.maxOctreeDepth == null) {
			settings.maxOctreeDepth = 5;
		}
		if (settings.drawTileBorders == null) {
			settings.drawTileBorders = false;
		}
		if (settings.fakeLoader == null) {
			settings.fakeLoading = false;
		}
		if (settings.autoResize == null) {
			settings.autoResize = true;
		}
		if (settings.loaderSettings.splitGeometry == null) {
			settings.loaderSettings.splitGeometry = false;
		}
		if (settings.loaderSettings.normalizeUnitsToMM == null) {
			settings.loaderSettings.normalizeUnitsToMM = true;
		}
		if (settings.loaderSettings.useSmallInts == null) {
			settings.loaderSettings.useSmallInts = false;
		}
		if (settings.loaderSettings.reportProgress == null) {
			settings.loaderSettings.reportProgress = false;
		}
		if (settings.viewerBasePath == null) {
			settings.viewerBasePath = "./";
		}
		if (settings.regionSelector == null) {
			settings.regionSelector = (bbs) => {
				return bbs[0];
			};
		}
		if (settings.distanceCulling == null) {
			settings.distanceCulling = false;
		}
		if (settings.occlusionCulling == null) {
			settings.occlusionCulling = true;
		}
		if (settings.loaderSettings.tilingLayerReuse == null) {
			settings.loaderSettings.tilingLayerReuse = true;
		}
		if (settings.loaderSettings.reuseThreshold == null) {
			settings.loaderSettings.reuseThreshold = 1000;
		}
		return settings;
	}
}