/**
 * This class builds a quick UI for changing basic settings and stores the settings in localStorage.
 * Changing any of these settings requires a reload of the model, or browser
 * 
 * @todo This class was quickly hacked together, should not be built upon
 */
export class Settings {
	constructor(element) {
		var settingsDefinition = {
			quantizeNormals: "boolean",
			quantizeVertices: "boolean",
			quantizeColors: "boolean",
			gpuReuse: "boolean",
			useObjectColors: "boolean",
			useSmallIndicesIfPossible: "boolean",
			defaultLayerEnabled: "boolean",
			triangleThresholdDefaultLayer: "number",
			tilingLayerEnabled: "boolean",
			maxOctreeDepth: "number",
			resetToDefaultViewOnLoad: "boolean",
			loaderSettings: {
				quantizeNormals: "boolean",
				octEncodeNormals: "boolean",
				quantizeVertices: "boolean", 
				quantizeColors: "boolean",
				useObjectColors: "boolean",
				tilingLayerReuse: "boolean",
				prepareBuffers: "boolean",
				generateLineRenders: "boolean",
				useUuidAndRid: "boolean"
			},
			realtimeSettings: {
				drawTileBorders: "boolean",
				drawLineRenders: "boolean",
				orderIndependentTransparency: "boolean",
				loadAllTiles: "button"
			}
		};
		
		var settingsObject = window.localStorage.getItem("settings") == null ? null : window.localStorage.getItem("settings");
		this.settings = settingsObject == null ? {
			quantizeNormals: true,
			quantizeVertices: true,
			quantizeColors: true,
			useObjectColors: false,
			gpuReuse: true,
			useSmallIndicesIfPossible: true,
			defaultLayerEnabled: true,
			triangleThresholdDefaultLayer: 100000,
			tilingLayerEnabled: true,
			maxOctreeDepth: 3,
			resetToDefaultViewOnLoad: true,
			loaderSettings: {
				quantizeNormals: true,
				octEncodeNormals: false,
				quantizeVertices: true,
				quantizeColors: true,
				useObjectColors: false,
				tilingLayerReuse: true,
				prepareBuffers: false,
				useUuidAndRid: false
			},
			realtimeSettings: {
				drawLineRenders: true,
				drawTileBorders: true,
				orderIndependentTransparency: true
			}
		} : JSON.parse(settingsObject);

		element.innerHTML = "<span>Settings</span>";

		this.processSettings(element, settingsDefinition, null, this.settings);
	}
	
	saveSettings() {
		window.localStorage.setItem("settings", JSON.stringify(this.settings));
	}
	
	processSettings(parent, settingsDefinition, keyPrefix, settings) {
		for (var key in settingsDefinition) {
			var value = settingsDefinition[key];
			if (typeof value == "string") {
				var div = document.createElement("div");
				div.classList.add("link");
				
				var label = document.createElement("label");
				label.innerHTML = key;
				if (key in {quantizeNormals: 1, quantizeVertices: 1}) {
					label.innerHTML += " (required for instancing)";
				}
				if (key == "tilingLayerReuse") {
					label.innerHTML += " (requires gpuReuse)";
				}
				parent.appendChild(label);
				var id = (keyPrefix == null ? "" : (keyPrefix + ".")) + key;
				label.setAttribute("for", id);
				
				if (value == "button") {
					var input = document.createElement("button");
					label.hidden = true;
					input.innerHTML = key;
				} else {
					var input = document.createElement("input");
				}
				if (value == "boolean") {
					input.setAttribute("type", "checkbox");
				}
				var settings = this.settings;
				if (id.indexOf(".") != -1) {
					settings = settings[id.substring(0, id.indexOf("."))];
				}
				if (settings != null) {
					if (settings[key] != null) {
						if (value == "boolean") {
							if (settings[key] == true) {
								input.setAttribute("checked", "checked");
							}
						} else {
							input.value = settings[key];
						}
					}
				} else {
					settings[key] = false;
				}
				input.id = id;
				input.setAttribute("key", key);
				input.setAttribute("valuetype", value);
				if (value == "button") {
					input.addEventListener("click", () => {
						if (this[key] != null) {
							this[key]();
						}
					});
				}
				input.addEventListener("change", (event) => {
					var el = event.target;
					var key = el.getAttribute("key");
					var settings = this.settings;
					if (el.id.indexOf(".") != -1) {
						settings = settings[el.id.substring(0, el.id.indexOf("."))];
					}
					var valueType = el.getAttribute("valuetype");
					if (valueType == "boolean") {
						settings[key] = el.checked;
					} else {
						settings[key] = parseInt(el.value);
					}
					this.saveSettings();
					if (this[key] != null) {
						this[key](el.checked);
					}
				});
				
				div.appendChild(input);
				div.appendChild(label);
				
				parent.appendChild(div);
			} else if (typeof value == "object") {
				var newParent = document.createElement("div");
				
				var title = document.createElement("span");
				title.innerHTML = key.charAt(0).toUpperCase() + key.substr(1).replace(/([A-Z])/g, " $1")
				
				newParent.appendChild(title);
				
				var container = document.createElement("div");
				container.style["padding-left"] = "20px";
				newParent.appendChild(container);
				
				parent.appendChild(document.createElement("hr"));
				parent.appendChild(newParent);
				
				if (settings[key] == null) {
					settings[key] = {};
				}
				this.processSettings(container, value, (keyPrefix == null ? "" : (keyPrefix + ".")) + key, settings);
			}
		}
	}
	
	loadAllTiles() {
		if (window.tilingRenderLayer != null) {
			window.tilingRenderLayer.tileLoader.loadAll();
		} else {
			alert("No tiling layer");
		}
	}
	
	drawTileBorders(value) {
		if (window.tilingRenderLayer != null) {
			window.tilingRenderLayer.drawTileBorders = value;
			window.bimServerViewer.viewer.dirty = 2;
		} else {
			alert("No tiling layer");
		}
	}

	drawLineRenders(value) {
		window.bimServerViewer.viewer.dirty = 2;
	}
	
	orderIndependentTransparency(value) {
		window.bimServerViewer.viewer.useOrderIndependentTransparency = value;
		window.bimServerViewer.viewer.dirty = 2;
	}
}