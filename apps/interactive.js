// At the moment this API is loaded from a BIMserver, you could also include the API files in your viewer
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import BimServerViewer from "../viewer/bimserverviewer.js"

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
			description.innerHTML = server.description;
			serverDiv.appendChild(title);
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
	}
	
	connectServer(server) {
		console.log("Connecting...", server.title);
		
		this.api = new BimServerClient(server.address);
		this.api.init().then(() => {
			document.getElementById("servers").hidden = false;
			document.getElementById("login").hidden = true;
			document.getElementById("loginButton").addEventHandler("click", () => {
				this.api.login(document.getElementById("username").value, document.getElementById("password").value);
			});
		});
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