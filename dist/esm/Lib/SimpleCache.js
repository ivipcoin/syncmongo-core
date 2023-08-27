"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleCache = void 0;
const Utils_1 = require("./Utils.js");
const calculateExpiryTime = (expirySeconds) => (expirySeconds > 0 ? Date.now() + expirySeconds * 1000 : Infinity);
/**
 * Simple cache implementation that retains immutable values in memory for a limited time.
 * Immutability is enforced by cloning the stored and retrieved values. To change a cached value, it will have to be `set` again with the new value.
 */
class SimpleCache {
    get size() {
        return this.cache.size;
    }
    constructor(options) {
        this.enabled = true;
        this.defaultExpirySeconds = 100;
        if (typeof options === "number") {
            // Old signature: only expirySeconds given
            options = { expirySeconds: options };
        }
        options.cloneValues = options.cloneValues !== false;
        if (typeof options.expirySeconds !== "number" && typeof options.maxEntries !== "number") {
            throw new Error("Either expirySeconds or maxEntries must be specified");
        }
        this.options = options;
        this.cache = new Map();
        // Cleanup every minute
        const interval = setInterval(() => {
            this.cleanUp();
        }, 60 * 1000);
        interval.unref?.();
    }
    has(key) {
        if (!this.enabled) {
            return false;
        }
        return this.cache.has(key);
    }
    get(key) {
        if (!this.enabled) {
            return null;
        }
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        } // if (!entry || entry.expires <= Date.now()) { return null; }
        entry.expires = calculateExpiryTime(this.options.expirySeconds ?? this.defaultExpirySeconds);
        entry.accessed = Date.now();
        return this.options.cloneValues ? (0, Utils_1.cloneObject)(entry.value) : entry.value;
    }
    set(key, value) {
        if (this.options.maxEntries && this.options.maxEntries > 0 && this.cache.size >= this.options.maxEntries && !this.cache.has(key)) {
            // console.warn(`* cache limit ${this.options.maxEntries} reached: ${this.cache.size}`);
            // Remove an expired item or the one that was accessed longest ago
            let oldest = null;
            const now = Date.now();
            const entries = this.cache.entries();
            let current = entries.next();
            while (!current.done) {
                const [key, entry] = current.value;
                if (entry.expires <= now) {
                    // Found an expired item. Remove it now and stop
                    this.cache.delete(key);
                    oldest = null;
                    break;
                }
                if (!oldest || entry.accessed < oldest.accessed) {
                    oldest = { key, accessed: entry.accessed };
                }
                current = entries.next();
            }
            if (oldest !== null) {
                this.cache.delete(oldest.key);
            }
        }
        this.cache.set(key, {
            value: this.options.cloneValues ? (0, Utils_1.cloneObject)(value) : value,
            added: Date.now(),
            accessed: Date.now(),
            expires: calculateExpiryTime(this.options.expirySeconds ?? this.defaultExpirySeconds),
        });
    }
    remove(key) {
        this.cache.delete(key);
    }
    cleanUp() {
        const now = Date.now();
        this.cache.forEach((entry, key) => {
            if (entry.expires <= now) {
                this.cache.delete(key);
            }
        });
    }
}
exports.SimpleCache = SimpleCache;
//# sourceMappingURL=SimpleCache.js.map