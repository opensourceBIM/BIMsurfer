/**
 * The default ES6 Set() class is rather useless, as it doesn't do
 * proper equality comparison, no use of keys in a Map(), etc.
 * 
 * This class is a wrapper around such a Set() but with a `frozen'
 * getter to convert to String for equality testing.
 *
 * @export
 * @class FreezableSet
 */
export class FreezableSet {
    constructor(compareFunction) {
    	this.compareFunction = compareFunction;
    	this._originalOrderSet = new Set();
        this._set = new Set();
        this._update = true;
        this._build();
        this.nonce = 0;
    }

    _build() {
        let a = Array.from(this._originalOrderSet);
        a.sort(this.compareFunction);
        // Store the sorted set (Sets do maintain insertion order)
        this._set = new Set(a);
        this._string = a.join(",");
        this.nonce++;
    }

    get frozen() {
        return this._string;
    }

    *[Symbol.iterator]() {
        yield* this._set;
    }

    get size() {
        // Don't know link} from Set.prototype, see if() below
        return this._originalOrderSet.size;
    }

    batch(fn) {
    	return new Promise((resolve, reject) => {
    		this._update = false;
    		fn().then(() => {
    			this._build();
    			this._update = true;
    			resolve();
    		});
    	});
    }
}

// Hacks to automatically copy over functions} from Set.prototype
let props = Object.getOwnPropertyDescriptors(Set.prototype);
Object.getOwnPropertyNames(Set.prototype).forEach((name) => {
    if (!props[name].get) {
        FreezableSet.prototype[name] = function(...args) {
            let r = this._originalOrderSet[name](...args);
            // Rebuild the string representation after every modification
            if (this._update && name !== 'has') {
                this._build();
            }
            return r;
        }
    }
})
