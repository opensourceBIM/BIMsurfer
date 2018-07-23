import BimServerViewer from "./bimserverviewer.js"
import Stats from "./stats.js"
import Settings from "./settings.js"
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"

/*
 * This class is where the applications starts, it's a mess, needs to go when we change this into an API
 */

export default class App {
	constructor() {
	}

	applyAdditionalDefaultSettings() {
		// Apply the default settings that cannot at the moment be set by the settings UI
		
		// Setting this to true will result in nothing rendered, but all CPU side buffers are created and metrics still update
		this.settings.fakeLoading = false;

		this.settings.loaderSettings.splitGeometry = false;
		this.settings.loaderSettings.normalizeUnitsToMM = true;
		this.settings.loaderSettings.useSmallInts = false;
		this.settings.loaderSettings.reportProgress = false;
	}
	
	start() {
		this.animationEnabled = false;
		this.loaderCounter = 1;

		this.settingsView = new Settings(document.getElementById("settings"));
		
		// Deep-clone the settings, so we know we have a non-changing view of the settings
		this.settings = JSON.parse(JSON.stringify(this.settingsView.settings));
		this.applyAdditionalDefaultSettings();
		
		this.canvas = document.getElementById("glcanvas");

		this.resizeCanvas();
		window.addEventListener("resize", () => {
			this.resizeCanvas();
		}, false);

		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				this.loadProjects();
			});
		});
	}

	resizeCanvas() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		if (this.bimServerViewer != null) {
			this.bimServerViewer.viewer.setDimensions(this.canvas.width, this.canvas.height);
		}
	}

	loadProjects() {
		this.api.call("ServiceInterface", "getAllProjects", {
			onlyTopLevel: true,
			onlyActive: true
		}, (projects) => {
			projects.forEach((project) => {
				if (project.lastRevisionId == -1) {
					return;
				}
				var inside = document.getElementById("projects");
				var projectNode = document.createElement("div");
				var a = document.createElement("a");
				projectNode.appendChild(a);
				a.addEventListener("click", (event) => {
					event.preventDefault();
					var inside = document.getElementById("projects");
					while (inside.firstChild) {
						inside.removeChild(inside.firstChild);
					}
//					var back = document.createElement("a");
//					back.innerHTML = "back";
//					back.addEventListener("click", (event) => {
//						this.viewer.cleanup();
//						inside.removeChild(back);
//						event.preventDefault();
//						this.loadProjects();
//					});
//					inside.appendChild(back);
					this.loadModel(project);
				})
				a.innerHTML = project.name;
				inside.appendChild(projectNode);
			})
		})
	}

	loadModel(project) {
		var stats = new Stats();
		
		stats.setParameter("Models", "Name", project.name);
		
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, window.innerWidth, window.innerHeight, stats);

		this.bimServerViewer.viewer.addAnimationListener((deltaTime) => {
			if (this.animationEnabled) {
				this.bimServerViewer.viewer.camera.orbitYaw(0.3);
			}
		});

		document.addEventListener("keypress", (event) => {
			if (event.key == ' ') {
				event.preventDefault();
				this.animationEnabled = !this.animationEnabled;
				this.bimServerViewer.viewer.navigationActive = this.animationEnabled;
			}
		});
		
		this.bimServerViewer.loadModel(project);
	}
}

new App().start();