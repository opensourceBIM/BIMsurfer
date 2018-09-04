import DefaultRenderLayer from "./defaultrenderlayer.js";
import Viewer from "./viewer.js";
import Stats from "../viewer/stats.js"
import TilingRenderLayer from "./tilingrenderlayer.js";
import TileArray from "./tilearray.js";

function request(url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        xhr.send();
    });
}

export default class StaticViewer {

    constructor() {
        this.settings = {
            viewerBasePath: "../",
            loaderSettings: {}
        };

        this.stats = new Stats();
        
        var canvasWrapper = document.getElementById("canvasWrapper");
		this.canvas = document.createElement("canvas");
        canvasWrapper.appendChild(this.canvas);

        this.viewer = new Viewer(this.canvas, this.settings, this.stats, window.innerWidth, window.innerHeight);

        let baseUrl = "../scene";
        
        request(`${baseUrl}/index.json`).then((resp) => {
            let tiles = [];
            var baseLayer;
            JSON.parse(resp).forEach((desc)=>{
                if (desc.id === "base") {
                    baseLayer = desc.url;
                } else {
                    tiles.push(desc);
                }
            });

            var tilearray = new TileArray(this, baseUrl, tiles);
            this.layers = [
                new DefaultRenderLayer(this.viewer, {}),
                new TilingRenderLayer(this.viewer, tilearray, {}, null)
            ]
            this.layers[0].registerLoader(0);
            tilearray.layer = this.layers[1];
            tilearray.layer.enabled = true;

            this.viewer.init().then(() => {
                const model = new xeogl.GLTFModel({
                    id: "base",
                    src: `${baseUrl}/${baseLayer}`,
                    lambertMaterials: true,
                    quantizeGeometry: false,
                    viewer: this.viewer,
                    layer: this.layers[0],
                    fire: (evt) => {
                        if (evt === "loaded") {
                            this.resizeCanvas();
                            this.layers[0].flushAllBuffers();
                            this.viewer.setDimensions(this.canvas.width, this.canvas.height);
                            this.viewer.setModelBounds(model.globalBounds);
                            // @todo ugh don't tuch each other's privates
                            this.layers.forEach((layer) => {
                                this.viewer.renderLayers.push(layer);
                            });

                            tilearray.traverse((node)=>{
                                tilearray.loadTile(node);
                            });
                        }
                    }
                });     
            });   
        });
    }

    resizeCanvas() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.viewer.setDimensions(this.canvas.width, this.canvas.height);
	}
}