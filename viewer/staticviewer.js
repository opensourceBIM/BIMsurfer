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

class executor {
    constructor() {
        this.current = null;
    }

    add(task) {
        if (this.current === null) {
            return this.current = task();
        } else {
            return this.current = this.current.then(task)
        }
    }
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

        this.baseUrl = "../scene";

        this.executor = new executor();
        
        request(`${this.baseUrl}/index.json`).then((resp) => {
            let tiles = [];
            var baseLayers = [];

            // @todo bounds based on actual geometry would be nicer
            let inf = Infinity;
            let bounds = [+inf, +inf, +inf, -inf, -inf, -inf];

            JSON.parse(resp).forEach((desc)=>{
                if (desc.id === "base") {
                    baseLayers.push(desc.url);
                } else {
                    tiles.push(desc);
                    for (let i = 0; i < 6; ++i) {
                        let fn = i < 3 ? Math.min : Math.max;
                        bounds[i] = fn(bounds[i], desc.bounds[i]);
                    }
                }
            });

            this.viewer.setModelBounds(bounds);

            var tilearray = new TileArray(this, tiles);
            var defaultLayer = new DefaultRenderLayer(this.viewer, {});
            var tilingLayer = new TilingRenderLayer(this.viewer, tilearray, {}, null);
            tilingLayer.tileLoader = tilearray;
            this.layers = [defaultLayer, tilingLayer];

            defaultLayer.registerLoader(0);
            tilearray.layer = tilingLayer;
            tilearray.layer.enabled = true;

            this.viewer.init().then(() => {
                this.loadFiles("base", 0, baseLayers, defaultLayer).then(() => {
                    this.resizeCanvas();
                    defaultLayer.flushAllBuffers();
                    this.viewer.setDimensions(this.canvas.width, this.canvas.height);
                    
                    // @todo ugh don't touch each other's privates
                    this.layers.forEach((layer) => {
                        this.viewer.renderLayers.push(layer);
                    });

                    let tiles = [];
                });                
            });   
        });
    }

    loadFiles(tileId, loaderId, urls, layer) {
        let urlsCopy = Array.from(urls);
        let task = () => {
            console.log("loading", tileId);
            return new Promise((resolve, reject) => {
                let loadone = () => {
                    let url = urlsCopy.pop();
                    const model = new xeogl.GLTFModel({
                        id: tileId,
                        src: `${this.baseUrl}/${url}`,
                        lambertMaterials: true,
                        quantizeGeometry: false,
                        viewer: this,
                        layer: layer,
                        loaderId: loaderId,
                        fire: (evt) => {
                            if (evt === "reallyLoaded") {
                                if (urlsCopy.length > 0) {
                                    loadone();
                                } else {
                                    this.viewer.stats.dec("Tiling", "Loading");
                                    this.viewer.stats.inc("Tiling", "Loaded");
                                    this.loaderPromise = null;
                                    resolve();
                                }
                            }
                        }
                    });
                };
                loadone();
            });
        };
        return this.executor.add(task);
    }

    resizeCanvas() {
		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.viewer.setDimensions(this.canvas.width, this.canvas.height);
	}
}