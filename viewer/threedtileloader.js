import * as vec2 from "./glmatrix/vec2.js";

import Cartesian3 from "../viewer/cesium/Core/Cartesian3.js";
import Transforms from "../viewer/cesium/Core/Transforms.js";

const b3dm = 0x6D643362;
const gltf = 0x46546c67;

export class ThreeDTileLoader {
    constructor(params) {
        this.url = params.url;
        this.refLatitude = params.refLatitude;
        this.refLongitude = params.refLongitude;
        this.callback = params.callback;

        let cesiumMatrix = Transforms.eastNorthUpToFixedFrame(
			Cartesian3.fromDegrees(this.refLongitude, this.refLatitude, 0.)
        );
        this.refPoint = new Float32Array(Array.from(cesiumMatrix)).subarray(12,15);
    }

    processB3dm(bounds, u) {
        return fetch(u).then(r => r.arrayBuffer()).then(r => {
            const headerSize = 28;
            let b = new Uint32Array(r.slice(0, headerSize));
            if (b[0] !== b3dm) {
                throw new Error();
            }
            if (b[1] !== 1) {
                throw new Error();
            }
            if (b[2] !== r.byteLength) {
                throw new Error();
            }
            let featureTableJSONByteLength = b[3];
            let featureTableBinaryByteLength = b[4];
            let batchTableJSONByteLength = b[5];
            let batchTableBinaryByteLength = b[6];

            let decoder = new TextDecoder("utf-8");
            let content = r.slice(headerSize + featureTableJSONByteLength + featureTableBinaryByteLength,
                headerSize + featureTableJSONByteLength + featureTableBinaryByteLength + batchTableJSONByteLength + batchTableBinaryByteLength);
            let contentString = decoder.decode(content);

            let glbOffset = headerSize + featureTableJSONByteLength + featureTableBinaryByteLength + batchTableJSONByteLength + batchTableBinaryByteLength;
            let b2 = new Uint32Array(r.slice(glbOffset, glbOffset+4));
            if (b2[0] !== gltf) {
                throw new Error();
            }

            // sigh another fix for broken glTF exporters: length includes padding
            contentString = contentString.replace(/\x00+$/, "");

            // sigh and yet another fix: garbage after JSON
            try {
                JSON.parse(contentString);
            } catch {
                contentString = contentString.substr(0, contentString.lastIndexOf("}")+1);
            }

            let glbContent = r.slice(glbOffset);
            this.callback({
                buffer: glbContent,
                bounds: bounds,
                features: JSON.parse(contentString)
            });
        });
    }

    processTile(u, t) {
        /*
        if (t.refine === "REPLACE") {
            // empty on purpose we do nothing
        } else if (tile.refine === "ADD") {
            this.loadTile(tile);
        } else {
            throw new Error(tile.refine + " is invalid for refine");
        }
        (tile.children || []).forEach((t) => {this.fetchTile(t, tile)});
        */

        let R;
        if (t.boundingVolume.region) {
            R = Array.from(t.boundingVolume.region);
            for (var i = 0; i < 4; ++i) {
                R[i] *= 180. / Math.PI;
            }
            let [west, south, east, north, low, high] = R;
            if (west < this.refLongitude && this.refLongitude < east && south < this.refLatitude && this.refLatitude < north) {
                // continue;
            } else {
                return;
            }
        } else if (t.boundingVolume.box) {
            R = new Float32Array(Array.from(t.boundingVolume.box));
            let center = R.subarray(0, 2);
            let x_dir = R.subarray(3, 5);
            let y_dir = R.subarray(6, 8);
            let relative = vec2.subtract(vec2.create(), this.refPoint, center);
            for (let d of [x_dir, y_dir]) {
                let extent = vec2.len(d);
                let norm = vec2.normalize(vec2.create(), d);
                if (Math.abs(vec2.dot(relative, norm)) > extent) {
                    return;
                }
            }
        } else {
            throw new Error("Unimplemented region");
        }

        let ps = [];        
        if (t.content && (t.content.uri || t.content.url)) {
            let p = new URL(t.content.uri || t.content.url, u).href;
            if (p.endsWith('.json')) {
                ps.push(this.load(p));
            } else {
                ps.push(this.processB3dm(R, p));
            }            
        }
        ps.concat(...(t.children || []).map(t => this.processTile(u, t)));
        return Promise.all(ps);
    }

    load(u) {
        return fetch(u || this.url).then(r => r.json()).then(r => {
            if (!r.asset || (r.asset.version != '1.0' && r.asset.version != '0.0')) {
                throw new Error("Expected a 3D Tiles dataset");
            }

            return this.processTile(u || this.url, r.root);
        });
    }
}
