import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import BimServerViewer from "./viewer/bimserverviewer.js"
import Stats from "./viewer/stats.js"
import Settings from "./viewer/settings.js"

/*
 * This class is where the applications starts, it's a mess, needs to go when we change this into an API
 */

export default class App {

	start() {
		this.animationEnabled = false;

		this.settingsView = new Settings(document.getElementById("settings"));
		
		// Deep-clone the settings, so we know we have a non-changing view of the settings
		this.settings = JSON.parse(JSON.stringify(this.settingsView.settings));
		
		this.canvas = document.getElementById("glcanvas");

		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				this.loadProjects();
			});
		});
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
		
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, this.canvas, window.innerWidth, window.innerHeight, stats);

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