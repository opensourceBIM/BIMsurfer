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
    constructor() {
        this._set = new Set();
        this._update = true;
        this._build();
    }

    _build() {
        let a = Array.from(this._set);
        a.sort();
        this._string = a.join(",");
    }

    get frozen() {
        return this._string;
    }

    *[Symbol.iterator]() {
        yield* this._set;
    }

    get size() {
        // Don't know link} from Set.prototype, see if() below
        return this._set.size;
    }

    batch(fn) {
        this._update = false;
        fn();
        this._build();
        this._update = true;
    }
}

// Hacks to automatically copy over functions} from Set.prototype
let props = Object.getOwnPropertyDescriptors(Set.prototype);
Object.getOwnPropertyNames(Set.prototype).forEach((name) => {
    if (!props[name].get) {
        FreezableSet.prototype[name] = function(...args) {
            let r = this._set[name](...args);
            // Rebuild the string representation after every modification
            if (this._update && name !== 'has') {
                this._build();
            }
            return r;
        }
    }
})
