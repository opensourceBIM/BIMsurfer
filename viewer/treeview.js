/**
 * A basic tree view. Used for the ProjectTree at the moment.
 */
export class TreeView {
	constructor(rootElement) {
		this.rootElement = rootElement;
	}
	
	show(node) {
		var projectNode = document.createElement("div");
		
		var subDiv = document.createElement("div");
		node.img = document.createElement("img");
		node.img.classList.add("arrow");
		node.img.addEventListener("click", (event) => {
			node.toggle();
		});
		projectNode.appendChild(node.img);
		
		node.element = projectNode;
		var a = document.createElement("a");
		projectNode.appendChild(a);
		a.addEventListener("click", (event) => {
			event.preventDefault();
			node.click();
		})
		a.innerHTML = node.label;
		if (node.parent == null) {
			this.rootElement.appendChild(projectNode);
		} else {
			node.parent.subDiv.appendChild(projectNode);
		}
		
		subDiv.style["margin-left"] = "20px";
		projectNode.appendChild(subDiv);
		node.subDiv = subDiv;
		node.subDiv.hidden = true;
	}
	
	expanded(node) {
		node.img.classList.remove("arrowclosed");
		node.img.classList.add("arrowopen");
		node.subDiv.hidden = false;
	}
	
	collapsed(node) {
		node.img.classList.remove("arrowopen");
		node.img.classList.add("arrowclosed");
		node.subDiv.hidden = true;
	}
}