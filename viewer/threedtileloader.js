const b3dm = 0x6D643362;
const gltf = 0x46546c67;

export class ThreeDTileLoader {
    constructor(params) {
        this.url = params.url;
        this.refLatitude = params.refLatitude;
        this.refLongitude = params.refLongitude;
        this.callback = params.callback;
    }

    processB3dm(bounds, u) {
        return fetch(u).then(r => r.arrayBuffer()).then(r => {
            let b = new Uint32Array(r);
            if (b[0] !== b3dm) {
                throw new Error();
            }
            if (b[1] !== 1) {
                throw new Error();
            }
            if (b[2] !== b.byteLength) {
                throw new Error();
            }
            let featureTableJSONByteLength = b[3];
            let featureTableBinaryByteLength = b[4];
            let batchTableJSONByteLength = b[5];
            let batchTableBinaryByteLength = b[6];
            let glbOffset = 28 + featureTableJSONByteLength + featureTableBinaryByteLength + batchTableJSONByteLength + batchTableBinaryByteLength;
            if (b[2] !== b.byteLength) {
                throw new Error();
            }
            if (b[glbOffset / 4] !== gltf) {
                throw new Error();
            }
            let glbContent = r.slice(glbOffset);
            this.callback({
                buffer: glbContent,
                bounds: bounds
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

        let R = Array.from(t.boundingVolume.region);
        for (var i = 0; i < 4; ++i) {
            R[i] *= 180. / Math.PI;
        }
        let [west, south, east, north, low, high] = R;
        if (west < this.refLongitude && this.refLongitude < east && south < this.refLatitude && this.refLatitude < north) {
            if (t.content && t.content.uri) {
                let p = new URL(t.content.uri, u).href;
                if (p.endsWith('.json')) {
                    return this.load(p);
                } else {
                    return this.processB3dm(R, p);
                }            
            }
            let ps = (t.children || []).map(t => this.processTile(u, t));
            return Promise.all(ps);
        }
    }

    load(u) {
        return fetch(u || this.url).then(r => r.json()).then(r => {
            if (!r.asset || r.asset.version != '1.0') {
                throw new Error("Expected a 3D Tiles dataset");
            }

            return this.processTile(u || this.url, r.root);
        });
    }
}
