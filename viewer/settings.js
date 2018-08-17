/*
 * This class builds a quick UI for changing basic settings and stores the settings in localStorage.
 * Changing any of these settings requires a reload of the model, or browser
 * 
 * TODO: This class was quickly hacked together, should not be built upon
 */
export default class Settings {
	constructor(element) {
		var settingsDefinition = {
			quantizeNormals: "boolean",
			quantizeVertices: "boolean",
			quantizeColors: "boolean",
			useObjectColors: "boolean",
			useSmallIndicesIfPossible: "boolean",
			defaultLayerEnabled: "boolean",
			triangleThresholdDefaultLayer: "number",
			tilingLayerEnabled: "boolean",
			maxOctreeDepth: "number",
			assumeGpuMemoryAvailable: "number",
			loaderSettings: {
				quantizeNormals: "boolean",
				quantizeVertices: "boolean",
				quantizeColors: "boolean",
				useObjectColors: "boolean"
			}
		};
		
		var settingsObject = localStorage.getItem("settings") == null ? null : localStorage.getItem("settings");
		this.settings = settingsObject == null ? {
			quantizeNormals: true,
			quantizeVertices: true,
			quantizeColors: true,
			useObjectColors: false,
			useSmallIndicesIfPossible: true,
			defaultLayerEnabled: true,
			triangleThresholdDefaultLayer: 100000,
			tilingLayerEnabled: true,
			maxOctreeDepth: 3,
			assumeGpuMemoryAvailable: 1024 * 1024 * 1024,
			loaderSettings: {
				quantizeNormals: true,
				quantizeVertices: true,
				quantizeColors: true,
				useObjectColors: false
			}
		} : JSON.parse(settingsObject);
		console.log("settings loaded", this.settings);
		this.processSettings(element, settingsDefinition, null, this.settings);
	}
	
	saveSettings() {
		console.log("save", this.settings);
		localStorage.setItem("settings", JSON.stringify(this.settings));
	}
	
	processSettings(parent, settingsDefinition, keyPrefix, settings) {
		for (var key in settingsDefinition) {
			var value = settingsDefinition[key];
			if (typeof value == "string") {
				var div = document.createElement("div");
				div.classList.add("link");
				
				var label = document.createElement("label");
				label.innerHTML = key;
				parent.appendChild(label);
				var id = (keyPrefix == null ? "" : (keyPrefix + ".")) + key;
				label.setAttribute("for", id);
				
				var input = document.createElement("input");
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
				});
				
				div.appendChild(input);
				div.appendChild(label);
				
				parent.appendChild(div);
			} else if (typeof value == "object") {
				var newParent = document.createElement("div");
				
				var title = document.createElement("span");
				title.innerHTML = key;
				
				newParent.appendChild(title);
				
				var container = document.createElement("div");
				container.style["padding-left"] = "20px";
				newParent.appendChild(container);
				
				parent.appendChild(newParent);
				
				if (settings[key] == null) {
					settings[key] = {};
				}
				this.processSettings(container, value, (keyPrefix == null ? "" : (keyPrefix + ".")) + key, settings);
			}
		}
	}
}