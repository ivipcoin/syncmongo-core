"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataReferenceQuery = exports.DataReference = exports.DataRetrievalOptions = void 0;
const Subscription_1 = require("src/Lib/Subscription");
const snapshot_1 = require("./snapshot");
const PathInfo_1 = __importDefault(require("src/Lib/PathInfo"));
const ID_1 = __importDefault(require("src/Lib/ID"));
const proxy_1 = require("./proxy");
const OptionalObservable_1 = require("src/Lib/OptionalObservable");
class DataRetrievalOptions {
    /**
     * Options for data retrieval, allows selective loading of object properties
     */
    constructor(options) {
        if (!options) {
            options = {};
        }
        if (typeof options.include !== "undefined" && !(options.include instanceof Array)) {
            throw new TypeError("options.include must be an array");
        }
        if (typeof options.exclude !== "undefined" && !(options.exclude instanceof Array)) {
            throw new TypeError("options.exclude must be an array");
        }
        if (typeof options.child_objects !== "undefined" && typeof options.child_objects !== "boolean") {
            throw new TypeError("options.child_objects must be a boolean");
        }
        if (typeof options.cache_mode === "string" && !["allow", "bypass", "force"].includes(options.cache_mode)) {
            throw new TypeError("invalid value for options.cache_mode");
        }
        this.include = options.include || undefined;
        this.exclude = options.exclude || undefined;
        this.child_objects = typeof options.child_objects === "boolean" ? options.child_objects : undefined;
        this.cache_mode = typeof options.cache_mode === "string" ? options.cache_mode : typeof options.allow_cache === "boolean" ? (options.allow_cache ? "allow" : "bypass") : "allow";
        this.cache_cursor = typeof options.cache_cursor === "string" ? options.cache_cursor : undefined;
    }
}
exports.DataRetrievalOptions = DataRetrievalOptions;
const _private = Symbol("private");
class DataReference {
    /**
     * Creates a reference to a node
     */
    constructor(db, path, vars) {
        this.db = db;
        if (!path) {
            path = "";
        }
        path = path.replace(/^\/|\/$/g, ""); // Trim slashes
        const pathInfo = PathInfo_1.default.get(path);
        const key = pathInfo.key;
        const callbacks = [];
        this[_private] = {
            get path() {
                return path;
            },
            get key() {
                return key;
            },
            get callbacks() {
                return callbacks;
            },
            vars: vars || {},
            context: {},
            pushed: false,
            cursor: null,
        };
    }
    context(context, merge = false) {
        const currentContext = this[_private].context;
        if (typeof context === "object") {
            const newContext = context ? (merge ? currentContext || {} : context) : {};
            if (context) {
                // Merge new with current context
                Object.keys(context).forEach((key) => {
                    newContext[key] = context[key];
                });
            }
            this[_private].context = newContext;
            return this;
        }
        else if (typeof context === "undefined") {
            console.warn("Use snap.context() instead of snap.ref.context() to get updating context in event callbacks");
            return currentContext;
        }
        else {
            throw new Error("Invalid context argument");
        }
    }
    /**
     * Contains the last received cursor for this referenced path (if the connected database has transaction logging enabled).
     * If you want to be notified if this value changes, add a handler with `ref.onCursor(callback)`
     */
    get cursor() {
        return this[_private].cursor;
    }
    set cursor(value) {
        var _a;
        this[_private].cursor = value;
        (_a = this.onCursor) === null || _a === void 0 ? void 0 : _a.call(this, value);
    }
    get isWildcardPath() {
        return this.path.indexOf("*") >= 0 || this.path.indexOf("$") >= 0;
    }
    /**
     * The path this instance was created with
     */
    get path() {
        return this[_private].path;
    }
    /**
     * The key or index of this node
     */
    get key() {
        const key = this[_private].key;
        return typeof key === "number" ? `[${key}]` : key;
    }
    /**
     * If the "key" is a number, it is an index!
     */
    get index() {
        const key = this[_private].key;
        if (typeof key !== "number") {
            throw new Error(`"${key}" is not a number`);
        }
        return key;
    }
    /**
     * Returns a new reference to this node's parent
     */
    get parent() {
        const currentPath = PathInfo_1.default.fillVariables2(this.path, this.vars);
        const info = PathInfo_1.default.get(currentPath);
        if (info.parentPath === null) {
            return null;
        }
        return new DataReference(this.db, info.parentPath).context(this[_private].context);
    }
    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was
     * created by an event ("value", "child_added" etc), or in a type mapping path when serializing / instantiating typed objects
     */
    get vars() {
        return this[_private].vars;
    }
    /**
     * Returns a new reference to a child node
     * @param childPath Child key, index or path
     * @returns reference to the child
     */
    child(childPath) {
        childPath = typeof childPath === "number" ? childPath : childPath.replace(/^\/|\/$/g, "");
        const currentPath = PathInfo_1.default.fillVariables2(this.path, this.vars);
        const targetPath = PathInfo_1.default.getChildPath(currentPath, childPath);
        return new DataReference(this.db, targetPath).context(this[_private].context); //  `${this.path}/${childPath}`
    }
    /**
     * Sets or overwrites the stored value
     * @param value value to store in database
     * @param onComplete optional completion callback to use instead of returning promise
     * @returns promise that resolves with this reference when completed
     */
    async set(value, onComplete) {
        try {
            if (this.isWildcardPath) {
                throw new Error(`Cannot set the value of wildcard path "/${this.path}"`);
            }
            if (this.parent === null) {
                throw new Error("Cannot set the root object. Use update, or set individual child properties");
            }
            if (typeof value === "undefined") {
                throw new TypeError(`Cannot store undefined value in "/${this.path}"`);
            }
            if (!this.db.isReady) {
                await this.db.ready();
            }
            value = this.db.types.serialize(this.path, value);
            const { cursor } = await this.db.storage.set(this.path, value, { context: this[_private].context });
            this.cursor = cursor;
            if (typeof onComplete === "function") {
                try {
                    onComplete(null, this);
                }
                catch (err) {
                    console.error("Error in onComplete callback:", err);
                }
            }
        }
        catch (err) {
            if (typeof onComplete === "function") {
                try {
                    onComplete(err, this);
                }
                catch (err) {
                    console.error("Error in onComplete callback:", err);
                }
            }
            else {
                // throw again
                throw err;
            }
        }
        return this;
    }
    /**
     * Updates properties of the referenced node
     * @param updates containing the properties to update
     * @param onComplete optional completion callback to use instead of returning promise
     * @return returns promise that resolves with this reference once completed
     */
    async update(updates, onComplete) {
        try {
            if (this.isWildcardPath) {
                throw new Error(`Cannot update the value of wildcard path "/${this.path}"`);
            }
            if (!this.db.isReady) {
                await this.db.ready();
            }
            if (typeof updates !== "object" || updates instanceof Array || updates instanceof ArrayBuffer || updates instanceof Date) {
                await this.set(updates);
            }
            else if (Object.keys(updates).length === 0) {
                console.warn(`update called on path "/${this.path}", but there is nothing to update`);
            }
            else {
                updates = this.db.types.serialize(this.path, updates);
                const { cursor } = await this.db.storage.update(this.path, updates, { context: this[_private].context });
                this.cursor = cursor;
            }
            if (typeof onComplete === "function") {
                try {
                    onComplete(null, this);
                }
                catch (err) {
                    console.error("Error in onComplete callback:", err);
                }
            }
        }
        catch (err) {
            if (typeof onComplete === "function") {
                try {
                    onComplete(err, this);
                }
                catch (err) {
                    console.error("Error in onComplete callback:", err);
                }
            }
            else {
                // throw again
                throw err;
            }
        }
        return this;
    }
    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed.
     * @param callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns returns a promise that resolves with the DataReference once the transaction has been processed
     */
    async transaction(callback) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot start a transaction on wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        let throwError;
        const cb = (currentValue) => {
            currentValue = this.db.types.deserialize(this.path, currentValue);
            const snap = new snapshot_1.DataSnapshot(this, currentValue);
            let newValue;
            try {
                newValue = callback(snap);
            }
            catch (err) {
                // callback code threw an error
                throwError = err; // Remember error
                return; // cancel transaction by returning undefined
            }
            if (newValue instanceof Promise) {
                return newValue
                    .then((val) => {
                    return this.db.types.serialize(this.path, val);
                })
                    .catch((err) => {
                    throwError = err; // Remember error
                    return; // cancel transaction by returning undefined
                });
            }
            else {
                return this.db.types.serialize(this.path, newValue);
            }
        };
        const { cursor } = await this.db.storage.transaction(this.path, cb, { context: this[_private].context });
        this.cursor = cursor;
        if (throwError) {
            // Rethrow error from callback code
            throw throwError;
        }
        return this;
    }
    on(event, callback, cancelCallback) {
        if (this.path === "" && ["value", "child_changed"].includes(event)) {
            // Removed 'notify_value' and 'notify_child_changed' events from the list, they do not require additional data loading anymore.
            console.warn("WARNING: Listening for value and child_changed events on the root node is a bad practice. These events require loading of all data (value event), or potentially lots of data (child_changed event) each time they are fired");
        }
        let eventPublisher;
        const eventStream = new Subscription_1.EventStream((publisher) => {
            eventPublisher = publisher;
        });
        // Map OUR callback to original callback, so .off can remove the right callback(s)
        const cb = {
            event,
            stream: eventStream,
            userCallback: typeof callback === "function" ? callback : undefined,
            ourCallback: (err, path, newValue, oldValue, eventContext) => {
                if (err) {
                    // TODO: Investigate if this ever happens?
                    this.db.debug.error(`Error getting data for event ${event} on path "${path}"`, err);
                    return;
                }
                const ref = this.db.ref(path);
                ref[_private].vars = PathInfo_1.default.extractVariables(this.path, path);
                let callbackObject;
                if (event.startsWith("notify_")) {
                    // No data event, callback with reference
                    callbackObject = ref.context(eventContext || {});
                }
                else {
                    const values = {
                        previous: this.db.types.deserialize(path, oldValue),
                        current: this.db.types.deserialize(path, newValue),
                    };
                    if (event === "child_removed") {
                        callbackObject = new snapshot_1.DataSnapshot(ref, values.previous, true, values.previous, eventContext);
                    }
                    else if (event === "mutations") {
                        callbackObject = new snapshot_1.MutationsDataSnapshot(ref, values.current, eventContext);
                    }
                    else {
                        const isRemoved = event === "mutated" && values.current === null;
                        callbackObject = new snapshot_1.DataSnapshot(ref, values.current, isRemoved, values.previous, eventContext);
                    }
                }
                eventPublisher.publish(callbackObject);
                if (eventContext === null || eventContext === void 0 ? void 0 : eventContext.acebase_cursor) {
                    this.cursor = eventContext.acebase_cursor;
                }
            },
        };
        this[_private].callbacks.push(cb);
        const subscribe = () => {
            // (NEW) Add callback to event stream
            // ref.on('value', callback) is now exactly the same as ref.on('value').subscribe(callback)
            if (typeof callback === "function") {
                eventStream.subscribe(callback, (activated, cancelReason) => {
                    if (!activated) {
                        cancelCallback && cancelCallback(cancelReason);
                    }
                });
            }
            const advancedOptions = typeof callback === "object" ? callback : { newOnly: !callback }; // newOnly: if callback is not 'truthy', could change this to (typeof callback !== 'function' && callback !== true) but that would break client code that uses a truthy argument.
            if (typeof advancedOptions.newOnly !== "boolean") {
                advancedOptions.newOnly = false;
            }
            if (this.isWildcardPath) {
                advancedOptions.newOnly = true;
            }
            const cancelSubscription = (err) => {
                // Access denied?
                // Cancel subscription
                const callbacks = this[_private].callbacks;
                callbacks.splice(callbacks.indexOf(cb), 1);
                this.db.storage.unsubscribe(this.path, event, cb.ourCallback);
                // Call cancelCallbacks
                this.db.debug.error(`Subscription "${event}" on path "/${this.path}" canceled because of an error: ${err.message}`);
                eventPublisher.cancel(err.message);
            };
            const authorized = this.db.storage.subscribe(this.path, event, cb.ourCallback, {
                newOnly: advancedOptions.newOnly,
                cancelCallback: cancelSubscription,
                syncFallback: advancedOptions.syncFallback,
            });
            const allSubscriptionsStoppedCallback = () => {
                const callbacks = this[_private].callbacks;
                callbacks.splice(callbacks.indexOf(cb), 1);
                return this.db.storage.unsubscribe(this.path, event, cb.ourCallback);
            };
            if (authorized instanceof Promise) {
                // Web API now returns a promise that resolves if the request is allowed
                // and rejects when access is denied by the set security rules
                authorized
                    .then(() => {
                    // Access granted
                    eventPublisher.start(allSubscriptionsStoppedCallback);
                })
                    .catch(cancelSubscription);
            }
            else {
                // Local API, always authorized
                eventPublisher.start(allSubscriptionsStoppedCallback);
            }
            if (!advancedOptions.newOnly) {
                // If callback param is supplied (either a callback function or true or something else truthy),
                // it will fire events for current values right now.
                // Otherwise, it expects the .subscribe methode to be used, which will then
                // only be called for future events
                if (event === "value") {
                    this.get((snap) => {
                        eventPublisher.publish(snap);
                    });
                }
                else if (event === "child_added") {
                    this.get((snap) => {
                        const val = snap.val();
                        if (val === null || typeof val !== "object") {
                            return;
                        }
                        Object.keys(val).forEach((key) => {
                            const childSnap = new snapshot_1.DataSnapshot(this.child(key), val[key]);
                            eventPublisher.publish(childSnap);
                        });
                    });
                }
                else if (event === "notify_child_added") {
                    // Use the reflect API to get current children.
                    // NOTE: This does not work with AceBaseServer <= v0.9.7, only when signed in as admin
                    const step = 100, limit = step;
                    let skip = 0;
                    const more = async () => {
                        const { children } = await this.db.storage.reflect(this.path, "children", { limit, skip });
                        if (children && "more" in children) {
                            children.list.forEach((child) => {
                                const childRef = this.child(child.key);
                                eventPublisher.publish(childRef);
                                // typeof callback === 'function' && callback(childRef);
                            });
                            if (children.more) {
                                skip += step;
                                more();
                            }
                        }
                    };
                    more();
                }
            }
        };
        if (this.db.isReady) {
            subscribe();
        }
        else {
            this.db.ready(subscribe);
        }
        return eventStream;
    }
    off(event, callback) {
        const subscriptions = this[_private].callbacks;
        const stopSubs = subscriptions.filter((sub) => (!event || sub.event === event) && (!callback || sub.userCallback === callback));
        if (stopSubs.length === 0) {
            this.db.debug.warn(`Can't find event subscriptions to stop (path: "${this.path}", event: ${event || "(any)"}, callback: ${callback})`);
        }
        stopSubs.forEach((sub) => {
            sub.stream.stop();
        });
        return this;
    }
    get(optionsOrCallback, callback) {
        if (!this.db.isReady) {
            const promise = this.db.ready().then(() => this.get(optionsOrCallback, callback));
            return typeof optionsOrCallback !== "function" && typeof callback !== "function" ? promise : undefined; // only return promise if no callback is used
        }
        callback = typeof optionsOrCallback === "function" ? optionsOrCallback : typeof callback === "function" ? callback : undefined;
        if (this.isWildcardPath) {
            const error = new Error(`Cannot get value of wildcard path "/${this.path}". Use .query() instead`);
            if (typeof callback === "function") {
                throw error;
            }
            return Promise.reject(error);
        }
        const options = new DataRetrievalOptions(typeof optionsOrCallback === "object" ? optionsOrCallback : { cache_mode: "allow" });
        const promise = this.db.storage.get(this.path, options).then((result) => {
            var _a;
            const isNewApiResult = "context" in result && "value" in result;
            if (!isNewApiResult) {
                // acebase-core version package was updated but acebase or acebase-client package was not? Warn, but don't throw an error.
                console.warn("AceBase api.get method returned an old response value. Update your acebase or acebase-client package");
                result = { value: result, context: {} };
            }
            const value = this.db.types.deserialize(this.path, result.value);
            const snapshot = new snapshot_1.DataSnapshot(this, value, undefined, undefined, result.context);
            if ((_a = result.context) === null || _a === void 0 ? void 0 : _a.acebase_cursor) {
                this.cursor = result.context.acebase_cursor;
            }
            return snapshot;
        });
        if (callback) {
            promise.then(callback).catch((err) => {
                console.error("Uncaught error:", err);
            });
            return;
        }
        else {
            return promise;
        }
    }
    /**
     * Waits for an event to occur
     * @param event Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param options data retrieval options, to include or exclude specific child keys
     * @returns returns promise that resolves with a snapshot of the data
     */
    once(event, options) {
        if (event === "value" && !this.isWildcardPath) {
            // Shortcut, do not start listening for future events
            return this.get(options);
        }
        return new Promise((resolve) => {
            const callback = (snap) => {
                this.off(event, callback); // unsubscribe directly
                resolve(snap);
            };
            this.on(event, callback);
        });
    }
    /**
     * @param value optional value to store into the database right away
     * @param onComplete optional callback function to run once value has been stored
     * @returns returns promise that resolves with the reference after the passed value has been stored
     */
    push(value, onComplete) {
        if (this.isWildcardPath) {
            const error = new Error(`Cannot push to wildcard path "/${this.path}"`);
            if (typeof value === "undefined" || typeof onComplete === "function") {
                throw error;
            }
            return Promise.reject(error);
        }
        const id = ID_1.default.generate();
        const ref = this.child(id);
        ref[_private].pushed = true;
        if (typeof value !== "undefined") {
            return ref.set(value, onComplete).then(() => ref);
        }
        else {
            return ref;
        }
    }
    /**
     * Removes this node and all children
     */
    async remove() {
        if (this.isWildcardPath) {
            throw new Error(`Cannot remove wildcard path "/${this.path}". Use query().remove instead`);
        }
        if (this.parent === null) {
            throw new Error("Cannot remove the root node");
        }
        return this.set(null);
    }
    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns returns a promise that resolves with a boolean value
     */
    async exists() {
        if (this.isWildcardPath) {
            throw new Error(`Cannot check wildcard path "/${this.path}" existence`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.storage.exists(this.path);
    }
    /**
     * Creates a query object for current node
     */
    query() {
        return new DataReferenceQuery(this);
    }
    /**
     * Gets the number of children this node has, uses reflection
     */
    async count() {
        const info = await this.reflect("info", { child_count: true });
        return info.children.count;
    }
    async reflect(type, args) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot reflect on wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.storage.reflect(this.path, type, args);
    }
    async export(write, options = { format: "json", type_safe: true }) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot export wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        const writeFn = typeof write === "function" ? write : write.write.bind(write);
        return this.db.storage.export(this.path, writeFn, options);
    }
    /**
     * Imports the value of this node and all children
     * @param read Function that reads data from your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is imported
     */
    async import(read, options = { format: "json", suppress_events: false }) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot import to wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.storage.import(this.path, read, options);
    }
    proxy(options) {
        const isOptionsArg = typeof options === "object" && (typeof options.cursor !== "undefined" || typeof options.defaultValue !== "undefined");
        if (typeof options !== "undefined" && !isOptionsArg) {
            this.db.debug.warn("Warning: live data proxy is being initialized with a deprecated method signature. Use ref.proxy(options) instead of ref.proxy(defaultValue)");
            options = { defaultValue: options };
        }
        return proxy_1.LiveDataProxy.create(this, options);
    }
    /**
     * @param options optional initial data retrieval options.
     * Not recommended to use yet - given includes/excludes are not applied to received mutations,
     * or sync actions when using an AceBaseClient with cache db.
     */
    observe(options) {
        // options should not be used yet - we can't prevent/filter mutation events on excluded paths atm
        if (options) {
            throw new Error("observe does not support data retrieval options yet");
        }
        if (this.isWildcardPath) {
            throw new Error(`Cannot observe wildcard path "/${this.path}"`);
        }
        const Observable = (0, OptionalObservable_1.getObservable)();
        return new Observable((observer) => {
            let cache, resolved = false;
            let promise = Promise.all([this.get(options)]).then(([snap]) => {
                resolved = true;
                cache = snap.val();
                observer.next(cache);
            });
            const updateCache = (snap) => {
                if (!resolved) {
                    promise = promise.then(() => updateCache(snap));
                    return;
                }
                const mutatedPath = snap.ref.path;
                if (mutatedPath === this.path) {
                    cache = snap.val();
                    return observer.next(cache);
                }
                const trailKeys = PathInfo_1.default.getPathKeys(mutatedPath).slice(PathInfo_1.default.getPathKeys(this.path).length);
                let target = cache;
                while (trailKeys.length > 1) {
                    const key = trailKeys.shift();
                    if (typeof key === "string" || typeof key === "number") {
                        if (!(key in target)) {
                            // Happens if initial loaded data did not include / excluded this data,
                            // or we missed out on an event
                            target[key] = typeof trailKeys[0] === "number" ? [] : {};
                        }
                        target = target[key];
                    }
                }
                const prop = trailKeys.shift();
                const newValue = snap.val();
                if (typeof prop === "string" || typeof prop === "number") {
                    if (newValue === null) {
                        // Remove it
                        target instanceof Array && typeof prop === "number" ? target.splice(prop, 1) : delete target[prop];
                    }
                    else {
                        // Set or update it
                        target[prop] = newValue;
                    }
                }
                observer.next(cache);
            };
            this.on("mutated", updateCache); // TODO: Refactor to 'mutations' event instead
            // Return unsubscribe function
            return () => {
                this.off("mutated", updateCache);
            };
        });
    }
    async forEach(callbackOrOptions, callback) {
        let options;
        if (typeof callbackOrOptions === "function") {
            callback = callbackOrOptions;
        }
        else {
            options = callbackOrOptions;
        }
        if (typeof callback !== "function") {
            throw new TypeError("No callback function given");
        }
        // Get all children through reflection. This could be tweaked further using paging
        const { children } = await this.reflect("children", { limit: 0, skip: 0 }); // Gets ALL child keys
        const summary = {
            canceled: false,
            total: children && "list" in children ? children === null || children === void 0 ? void 0 : children.list.length : 0,
            processed: 0,
        };
        // Iterate through all children until callback returns false
        if (children && "list" in children) {
            for (let i = 0; i < children.list.length; i++) {
                const key = children.list[i].key;
                // Get child data
                const snapshot = await this.child(key).get(options);
                summary.processed++;
                if (!snapshot.exists()) {
                    // Was removed in the meantime, skip
                    continue;
                }
                // Run callback
                const result = await callback(snapshot);
                if (result === false) {
                    summary.canceled = true;
                    break; // Stop looping
                }
            }
        }
        return summary;
    }
    async getMutations(cursorOrDate) {
        const cursor = typeof cursorOrDate === "string" ? cursorOrDate : undefined;
        const timestamp = cursorOrDate === null || typeof cursorOrDate === "undefined" ? 0 : cursorOrDate instanceof Date ? cursorOrDate.getTime() : Date.now();
        return this.db.storage.getMutations({ path: this.path, cursor, timestamp });
    }
    async getChanges(cursorOrDate) {
        const cursor = typeof cursorOrDate === "string" ? cursorOrDate : undefined;
        const timestamp = cursorOrDate === null || typeof cursorOrDate === "undefined" ? 0 : cursorOrDate instanceof Date ? cursorOrDate.getTime() : Date.now();
        return this.db.storage.getChanges({ path: this.path, cursor, timestamp });
    }
}
exports.DataReference = DataReference;
class DataReferenceQuery {
    constructor(ref) { }
}
exports.DataReferenceQuery = DataReferenceQuery;
//# sourceMappingURL=reference.js.map