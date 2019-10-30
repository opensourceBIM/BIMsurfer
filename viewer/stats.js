/**
 * Keeps track of statistics. Initially only a UI, but can also be used "headless" by given a false value for the `active` constructor argument
 */
export class Stats {
	constructor(active = true) {
		this.active = active;
		this.parameters = {};
		this.dirty = true;
		this.updateRequested = true;
		
		this.groups = {
			"Tiling": [
				"Rendering",
				"Empty",
				"Full",
				"Loading",
				"Loaded"
			],
			"Loading time": [
				"Layer 1",
				"Layer 2",
				"Total"
			], "Rendering": [
				"FPS"
			], "Stats": [
				"Updates"
			], "Models": [
				"Name",
				"Models to load",
				"Models loaded",
				"Objects",
				"Geometries",
				"Geometries reused",
			], "Primitives": [
				"Primitives to load (L1)",
				"Primitives to load (L2)",
				"Nr primitives loaded",
				"Nr primitives hidden"
			], "Data": [
				"GPU bytes",
				"GPU bytes reuse",
				"GPU bytes total"
			], "Drawing": [
				"Triangles to draw (L1)",
				"Triangles to draw (L2)",
				"Draw calls per frame (L1)",
				"Draw calls per frame (L2)"
			], "Network": [
				"Bytes OTL"
			], "Buffers": [
				"Buffer groups",
			], "BufferSet pool": [
				"Used",
				"Available",
				"Total memory"
			], "Renderer settings": [
				"Object colors",
				"Small indices if possible",
				"Quantize normals",
				"Quantize vertices"
			], "Loader settings": [
				"Object colors",
				"Quantize normals",
				"Quantize vertices",
			]
		};
		
		for (var groupName in this.groups) {
			var group = this.groups[groupName];
			var groupObject = {};
			this.parameters[groupName] = groupObject;
			for (var key of group) {
				groupObject[key] = 0;
			}
		}
	}

	get(group, key) {
		return this.parameters[group][key];
	}

	setParameter(group, key, value) {
		var group = this.parameters[group];
		if (group[key] == value) {
			return;
		}
		group[key] = value;
		this.dirty = true;
	}

	inc(groupName, key, value) {
		var group = this.parameters[groupName];
		if (group[key] == null) {
			group[key] = 0;
		}
		if (value == null) {
			group[key] = group[key] + 1;
		} else {
			group[key] = group[key] + value;
		}
		this.dirty = true;
	}

	dec(groupName, key, value) {
		var group = this.parameters[groupName];
		if (group[key] == null) {
			group[key] = 0;
		}
		if (value == null) {
			group[key] = group[key] - 1;
		} else {
			group[key] = group[key] - value;
		}
		this.dirty = true;
	}

	numberWithCommas(x) {
		return Number(x).toLocaleString();
	}

	requestUpdate() {
		this.updateRequested = true;
	}
	
	update() {
		if (this.active && document.getElementById("stats")) {
			if (!this.updateRequested) {
				return;
			}
			this.inc("Stats", "Updates");
			this.updates++;
			for (var groupName in this.groups) {
				var group = this.groups[groupName];
				var groupElement = document.getElementById(groupName + "-group");
				if (groupElement == null) {
					groupElement = document.createElement("div");
					groupElement.id = groupName + "-group";
					document.getElementById("stats").appendChild(groupElement);
					
					var groupTitle = document.createElement("h3");
					groupTitle.innerHTML = groupName;
					groupElement.appendChild(groupTitle);
				}
				for (var key of group) {
					var fullKey = groupName + "_" + key;
					var value = this.parameters[groupName][key];
					var element = document.getElementById(fullKey);
					if (element == null) {
						element = document.createElement("div");
						element.id = fullKey;
						groupElement.appendChild(element);
					}
					var newStringValue = value;
					if (value == null) {
						newStringValue = key + ": 0";
					} else {
						if (typeof value == "number") {
							newStringValue = key + ": " + this.numberWithCommas(value);
						} else {
							newStringValue = key + ": " + value;
						}
					}
					if (newStringValue != element.textContent) {
						element.textContent  = newStringValue;
					}
				}
			}
			this.updateRequested = false;
			this.dirty = false;
		}
	}
	
	cleanup() {
		var stats = document.getElementById("stats");
		if (stats != null) {
			while (stats.firstChild) {
				stats.removeChild(stats.firstChild);
			}
			this.dirty = true;
		}
	}
}