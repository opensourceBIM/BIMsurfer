import {BimServerClient} from "../../bimserverjavascriptapi/bimserverclient.js"
import {BimServerViewer} from "../viewer/bimserverviewer.js"
import {Stats} from "../viewer/stats.js"
import {Settings} from "../viewer/settings.js"
import {ProjectTreeModel} from "../viewer/projecttreemodel.js"
import {TreeView} from "../viewer/treeview.js"
import {DefaultSettings} from "../viewer/defaultsettings.js"

/*
 * This class is where the applications starts, it's a mess, needs to go when we change this into an API
 */

export default class Tests {

	start() {
		const configurableAspects = [
			{
				key: "vertexQuantization",
				values: [false, true]
			},
			{
				key: "normalQuantization",
				values: [false, true]
			},
			{
				key: "colorQuantization",
				values: [false, true]
			},
//			{
//				key: "useObjectColors",
//				values: [false, true]
//			},
//			{
//				key: "assumeGpuMemoryAvailable",
//				values: [0, 4000000000]
//			},
			{
				key: "assumeGpuMemoryAvailable",
				values: [0, 4000000000]
			},
//			{
//				key: "triangleThresholdDefaultLayer",
//				values: [0, 1000000, 4000000]
//			}
		];

		var testRuns = [];
		this.applyAspect(testRuns, 0, configurableAspects, {});
		
		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				this.api.call("ServiceInterface", "getProjectsByName", {
					name: "AC11"
				}, (projects) => {
					if (projects.length == 0) {
						console.error("No project found with name AC11");
					} else {
						var project = projects[0];
						this.runTest(project.lastRevisionId, testRuns, 0);
					}
				});
			});
		});
	}
	
	runTest(roid, tests, index) {
		console.log("Running test", index);
		
		var test = tests[index];
		var settings = DefaultSettings.create();
		settings.autoResize = false;
		for (var key in test) {
			settings[key] = test[key];
		}
		
		this.canvas = document.getElementById("glcanvas");
		var stats = new Stats(false);
		this.loadModel(roid, stats, settings).then(() => {
			var loadTime1 = stats.get("Loading time", "Layer 1");
			console.log(loadTime1);
			if (index < tests.length - 1) {
				this.runTest(roid, tests, index + 1);
			}
		});
	}

	applyAspect(testRuns, aspectIndex, configurableAspects, testRun) {
		var aspect = configurableAspects[aspectIndex];
		for (var vi=0; vi<aspect.values.length; vi++) {
			testRun[aspect.key] = aspect.values[vi];
			if (aspectIndex == configurableAspects.length - 1) {
				testRuns.push(JSON.parse(JSON.stringify(testRun)));
			} else {
				this.applyAspect(testRuns, aspectIndex + 1, configurableAspects, testRun);
			}
		}
	}

	loadModel(roid, stats, settings) {
		console.log(settings);
		var canvas = document.createElement("canvas");
		canvas.setAttribute("width", 320);
		canvas.setAttribute("height", 240);
		canvas.classList.add("viewer");
		var viewers = document.getElementById("viewers");
		viewers.appendChild(canvas);
		this.bimServerViewer = new BimServerViewer(settings, canvas, 320, 240, stats);

		return this.bimServerViewer.loadRevisionByRoid(this.api, roid);
	}
}

new Tests().start();