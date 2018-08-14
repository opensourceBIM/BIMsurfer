import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import BimServerViewer from "../viewer/bimserverviewer.js"
import Stats from "../viewer/stats.js"
import Settings from "../viewer/settings.js"
import ProjectTreeModel from "../viewer/projecttreemodel.js"
import TreeView from "../viewer/treeview.js"

/*
 * This class is where the applications starts, it's a mess, needs to go when we change this into an API
 */

export default class Dev {

	start() {
		this.animationEnabled = false;

		this.settingsView = new Settings(document.getElementById("settings"));
		document.getElementById("backButton").addEventListener("click", () => {
			if (this.bimServerViewer != null) {
				document.removeEventListener("keypress", this.keyPressHandler);
				window._debugViewer = null;
				window.tilingRenderLayer = null;
				this.canvas.remove();
				this.canvas = null;
				this.bimServerViewer.cleanup();
				this.bimServerViewer = null;
			}
			this.loadProjects();
		});
		
		// Deep-clone the settings, so we know we have a non-changing view of the settings
		this.settings = JSON.parse(JSON.stringify(this.settingsView.settings));
		this.settings.viewerBasePath = "../";
		this.settings.drawTileBorders = true;
		
		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				this.loadProjects();
			});
		});
	}

	loadProjects() {
		document.getElementById("viewer").style.display = "none";
		document.getElementById("projects").style.display = "block";

		var treeView = new TreeView(document.getElementById("projects"));
		this.projectTreeModel = new ProjectTreeModel(this.api, treeView);
		this.projectTreeModel.load((node) => {
			this.loadModel(node.project);
		});
	}
	
	keyPressListener(event) {
		if (event.key == ' ') {
			event.preventDefault();
			this.animationEnabled = !this.animationEnabled;
			this.bimServerViewer.viewer.navigationActive = this.animationEnabled;
		}
	}

	loadModel(project) {
		document.getElementById("projects").style.display = "none";
		document.getElementById("viewer").style.display = "block";

		this.animationEnabled = false;
		
		var canvasWrapper = document.getElementById("canvasWrapper");
		this.canvas = document.createElement("canvas");
		canvasWrapper.appendChild(this.canvas);

		var stats = new Stats();
		
		stats.setParameter("Models", "Name", project.name);
		
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, this.canvas, window.innerWidth, window.innerHeight, stats);

		this.bimServerViewer.viewer.addAnimationListener((deltaTime) => {
			if (this.animationEnabled) {
				this.bimServerViewer.viewer.camera.orbitYaw(0.3);
			}
		});

		this.keyPressHandler = (event) => {
			this.keyPressListener(event);
		};
		document.addEventListener("keypress", this.keyPressHandler);
		
		this.bimServerViewer.loadModel(project);
	}
}

new Dev().start();