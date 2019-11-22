/**
 * @ignore
 */
export class DefaultSettings {
	static create(settings) {
		if (settings == null) {
			var settings = {};
		}
		if (settings.autoRender == null) {
			settings.autoRender = true;
		}
		if (settings.useOverlay == null) {
			settings.useOverlay = true;
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
		if (settings.resetToDefaultViewOnLoad == null) {
			settings.resetToDefaultViewOnLoad = true;
		}
		if (settings.gpuReuse == null) {
			settings.gpuReuse = false;
		}
		if (settings.loaderSettings == null) {
			settings.loaderSettings = {};
		}
		if (settings.loaderSettings.useObjectColors == null) {
			settings.loaderSettings.useObjectColors = false;
		}
		if (settings.loaderSettings.useUuidAndRid == null) {
			settings.loaderSettings.useUuidAndRid = false;
		}
		if (settings.loaderSettings.quantizeNormals == null) {
			settings.loaderSettings.quantizeNormals = true;
		}
		if (settings.loaderSettings.octEncodeNormals == null) {
			settings.loaderSettings.octEncodeNormals = false;
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
		if (settings.defaultLayerEnabled == null) {
			settings.defaultLayerEnabled = true;
		}
		if (settings.tilingLayerEnabled == null) {
			settings.tilingLayerEnabled = true;
		}
		if (settings.maxOctreeDepth == null) {
			settings.maxOctreeDepth = 5;
		}
		if (settings.fakeLoading == null) {
			settings.fakeLoading = false;
		}
		if (settings.autoResize == null) {
			settings.autoResize = true;
		}
		if (settings.loaderSettings.splitGeometry == null) {
			settings.loaderSettings.splitGeometry = false;
		}
		if (settings.loaderSettings.generateLineRenders == null) {
			settings.loaderSettings.generateLineRenders = false;
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
		if (settings.autoCombineGpuBuffers == null) {
			settings.autoCombineGpuBuffers = false;
		}
		if (settings.regionSelector == null) {
			settings.regionSelector = (bbs) => {
				return Promise.resolve(bbs[0]);
			};
		}
		if (settings.excludedTypes == null) {
			settings.excludedTypes = ["IfcSpace", "IfcOpeningElement", "IfcAnnotation"];
		}
		if (settings.loaderSettings.tilingLayerReuse == null) {
			settings.loaderSettings.tilingLayerReuse = true;
		}
		if (settings.loaderSettings.reuseThreshold == null) {
			settings.loaderSettings.reuseThreshold = 25000;
		}
		if (settings.loaderSettings.prepareBuffers == null) {
			settings.loaderSettings.prepareBuffers = true;
		}
		if (settings.realtimeSettings == null) {
			settings.realtimeSettings = {};
		}
		if (settings.realtimeSettings.orderIndependentTransparency == null) {
			settings.realtimeSettings.orderIndependentTransparency = true;
		}
		if (settings.realtimeSettings.drawLineRenders == null) {
			settings.realtimeSettings.drawLineRenders = false;
		}
		return settings;
	}
}