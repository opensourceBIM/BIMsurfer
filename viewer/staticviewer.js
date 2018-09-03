import DefaultRenderLayer from "./defaultrenderlayer.js";
import Viewer from "./viewer.js";
import Stats from "../viewer/stats.js"

export default class StaticViewer {

    constructor() {
        this.settings = {
            viewerBasePath: "../",
            loaderSettings: {}
        };
        
        var canvasWrapper = document.getElementById("canvasWrapper");
		this.canvas = document.createElement("canvas");
        canvasWrapper.appendChild(this.canvas);

        this.viewer = new Viewer(this.canvas, this.settings, new Stats(), window.innerWidth, window.innerHeight);
        
        this.layers = [
            new DefaultRenderLayer(this.viewer, {})
        ]
        this.layers[0].registerLoader(0);

        this.viewer.init().then(() => {
            const model = new xeogl.GLTFModel({
                id: "tile0",
                src: "../scene/tile.gltf",
                lambertMaterials: true,
                quantizeGeometry: false,
                viewer: this.viewer,
                layer: this.layers[0],
                fire: (evt) => {
                    if (evt === "loaded") {
                        debugger;
                        this.layers[0].flushAllBuffers();
                        this.viewer.setModelBounds(model.globalBounds);
                        // @todo ugh don't tuch each other's privates
                        this.viewer.renderLayers.push(this.layers[0]);
                    }
                }
            });     
        });   
    }
}