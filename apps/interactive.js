// At the moment this API is loaded from a BIMserver, you could also include the API files in your viewer
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import BimServerViewer from "../viewer/bimserverviewer.js"
import TreeView from "../viewer/treeview.js"
import ProjectTreeModel from "../viewer/projecttreemodel.js"

/*
 * This class is where the demo1 application starts
 */

export default class Interactive {

	constructor() {
		// You need to change these to something that makes sense
		this.settings = {
			viewerBasePath: "../"
		};
	}
	
	start() {
		document.getElementById("login").hidden = true;
		var defaultServers = [
			{
				title: "Default local development BIMserver",
				description: "Default address when running BIMserver from code",
				address: "http://localhost:8080",
				username: "admin@bimserver.org",
				password: "admin"
			}, {
				title: "Default local BIMserver JAR",
				description: "Default address when running BIMserver as a JAR",
				address: "http://localhost:8082"
			}, {
				title: "Experimental BIMserver",
				description: "An online server used for testing. NO GUARANTEES AT ALL that this is up/working. You need to have an account.",
				address: "https://thisisanexperimentalserver.com"
			}, {
				title: "Logic Labs - Epic BIMserver",
				description: "An online server used for testing. NO GUARANTEES AT ALL that this is up/working. You need to have an account.",
				address: "https://epic.logic-labs.nl"
			}
		];
		
		document.getElementById("address").focus();
		
		for (const server of defaultServers) {
			var interactive = document.getElementById("serverList");
			var serverDiv = document.createElement("div");
			serverDiv.classList.add("server");
			serverDiv.click(() => {
				this.connectServer(server);
			});
			var title = document.createElement("h3");
			title.innerHTML = server.title;
			var status = document.createElement("div");
			status.innerHTML = "Unknown";
			status.classList.add("serverstatus");
			var description = document.createElement("p");
			var url = document.createElement("a");
			url.setAttribute("href", server.address);
			url.innerHTML = server.address;
			description.innerHTML = server.description;
			serverDiv.appendChild(title);
			serverDiv.appendChild(url);
			serverDiv.appendChild(description);
			serverDiv.appendChild(status);
			interactive.appendChild(serverDiv);
			var button = document.createElement("button");
			button.innerHTML = "Connect";
			button.addEventListener("click", () => {
				this.connectServer(server);
			});
			serverDiv.appendChild(button);
			this.ping(server, status);
		}
		document.getElementById("connectButton").addEventListener("click", (event) => {
			event.preventDefault();
			this.connectServer({
				address: document.getElementById("address").value
			});
		});
	}
	
	connectServer(server) {
		console.log("Connecting...", server.address);
		
		this.api = new BimServerClient(server.address);
		this.api.init().then(() => {
			document.getElementById("servers").hidden = true;
			document.getElementById("login").hidden = false;
			document.getElementById("username").focus();
			var loginButton = document.getElementById("loginButton");
			loginButton.addEventListener("click", () => {
				document.getElementById("loginStatus").innerHTML = "Logging in...";
				this.api.login(document.getElementById("username").value, document.getElementById("password").value, () => {
					document.getElementById("loginStatus").innerHTML = "Logging successfull";
					document.getElementById("login").hidden = true;
					document.getElementById("selectproject").hidden = false;
					this.loadProjects();
				}, (error) => {
					document.getElementById("loginStatus").innerHTML = error.message;
				});
			});
		});
	}
	
	loadProjects() {
		var treeView = new TreeView(document.getElementById("selectproject"));
		this.projectTreeModel = new ProjectTreeModel(this.api, treeView);
		this.projectTreeModel.load((node) => {
			document.getElementById("selectproject").hidden = true;
			document.getElementById("viewer").hidden = false;
			this.loadModel(node.project);
		});
	}
	
	loadModel(project) {
		var canvas = document.getElementById("glcanvas");
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, canvas, window.innerWidth, window.innerHeight);
		this.bimServerViewer.loadModel(project);
	}
	
	ping(server, status) {
		var request = new XMLHttpRequest();
		request.open("GET", server.address, true);
		request.addEventListener("load", () => {
			status.innerHTML = "UP";
			status.classList.add("up");
		});
		request.addEventListener("error", () => {
			status.innerHTML = "DOWN";
			status.classList.add("down");
		});
		request.addEventListener("abort", () => {
			status.innerHTML = "DOWN";
			status.classList.add("down");
		});
		request.send();
	}
}

new Interactive().start();