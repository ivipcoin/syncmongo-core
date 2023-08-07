import { EventStream } from "src/Lib/Subscription";
import { DataSnapshot } from "./snapshot";
import DataBase from "..";
import { EventCallback, EventSettings, ForEachIteratorCallback, ForEachIteratorResult, IStreamLike, NotifyEvent, PathVariables, StreamReadFunction, StreamWriteFunction, ValueEvent } from "src/Types";
import { ReflectionNodeInfo, ValueChange, ValueMutation } from "src/Types/LocalStorage";
import { ILiveDataProxy, LiveDataProxyOptions } from "src/Types/Proxy";
import { type Observable } from "src/Lib/OptionalObservable";
export declare class DataRetrievalOptions {
    /**
     * child keys to include (will exclude other keys), can include wildcards (eg "messages/*\/title")
     */
    include?: Array<string | number>;
    /**
     * child keys to exclude (will include other keys), can include wildcards (eg "messages/*\/replies")
     */
    exclude?: Array<string | number>;
    /**
     * whether or not to include any child objects, default is true
     */
    child_objects?: boolean;
    /**
     * If a cached value is allowed to be served. A cached value will be used if the client is offline, if cache priority setting is true, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path. Default is `true`.
     * @deprecated Use `cache_mode: "allow"` instead
     * @default true
     */
    allow_cache?: boolean;
    /**
     * Use a cursor to update the local cache with mutations from the server, then load and serve the entire
     * value from cache. Only works in combination with `cache_mode: "allow"`
     *
     * Requires an `AceBaseClient` with cache db
     */
    cache_cursor?: string;
    /**
     * Determines if the value is allowed to be loaded from cache:
     * - `"allow"`: (default) a cached value will be used if the client is offline, if cache `priority` setting is `"cache"`, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path.
     * - `"bypass"`: Value will be loaded from the server. If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path
     * - `"force"`: Forces the value to be loaded from cache only
     *
     * A returned snapshot's context will reflect where the data was loaded from: `snap.context().acebase_origin` will be set to `"cache"`, `"server"`, or `"hybrid"` if a `cache_cursor` was used.
     *
     * Requires an `AceBaseClient` with cache db
     * @default "allow"
     */
    cache_mode?: "allow" | "bypass" | "force";
    /**
     * Options for data retrieval, allows selective loading of object properties
     */
    constructor(options: DataRetrievalOptions);
}
declare const _private: unique symbol;
export declare class DataReference<T = any> {
    readonly db: DataBase;
    private [_private];
    /**
     * Creates a reference to a node
     */
    constructor(db: DataBase, path: string, vars?: PathVariables);
    /**
     * Adds contextual info for database updates through this reference.
     * This allows you to identify the event source (and/or reason) of
     * data change events being triggered. You can use this for example
     * to track if data updates were performed by the local client, a
     * remote client, or the server. And, why it was changed, and by whom.
     * @param context Context to set for this reference.
     * @param merge whether to merge given context object with the previously set context. Default is false
     * @returns returns this instance, or the previously set context when calling context()
     * @example
     * // Somewhere in your backend code:
     * db.ref('accounts/123/balance')
     *  .context({ action: 'withdraw', description: 'ATM withdrawal of €50' })
     *  .transaction(snap => {
     *      let balance = snap.val();
     *      return balance - 50;
     *  });
     *
     * // And, somewhere in your frontend code:
     * db.ref('accounts/123/balance')
     *  .on('value', snap => {
     *      // Account balance changed, check used context
     *      const newBalance = snap.val();
     *      const updateContext = snap.context(); // not snap.ref.context()
     *      switch (updateContext.action) {
     *          case 'payment': alert('Your payment was processed!'); break;
     *          case 'deposit': alert('Money was added to your account'); break;
     *          case 'withdraw': alert('You just withdrew money from your account'); break;
     *      }
     * });
     */
    context(context: any, merge?: boolean): DataReference;
    /**
     * Gets a previously set context on this reference. If the reference is returned
     * by a data event callback, it contains the context used in the reference used
     * for updating the data
     * @returns returns the previously set context
     */
    context(): any;
    /**
     * Contains the last received cursor for this referenced path (if the connected database has transaction logging enabled).
     * If you want to be notified if this value changes, add a handler with `ref.onCursor(callback)`
     */
    get cursor(): string;
    private set cursor(value);
    /**
     * Attach a callback function to get notified of cursor changes for this reference. The cursor is updated in these occasions:
     * - After any of the following events have fired: `value`, `child_changed`, `child_added`, `child_removed`, `mutations`, `mutated`
     * - After any of these methods finished saving a value to the database `set`, `update`, `transaction`. If you are connected to
     * a remote server, the cursor is updated once the server value has been updated.
     */
    onCursor?: (cursor: string | null | undefined) => any;
    get isWildcardPath(): boolean;
    /**
     * The path this instance was created with
     */
    get path(): string;
    /**
     * The key or index of this node
     */
    get key(): string;
    /**
     * If the "key" is a number, it is an index!
     */
    get index(): number;
    /**
     * Returns a new reference to this node's parent
     */
    get parent(): DataReference | null;
    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was
     * created by an event ("value", "child_added" etc), or in a type mapping path when serializing / instantiating typed objects
     */
    get vars(): PathVariables;
    /**
     * Returns a new reference to a child node
     * @param childPath Child key, index or path
     * @returns reference to the child
     */
    child<Child = any>(childPath: string | number): DataReference<Child>;
    /**
     * Sets or overwrites the stored value
     * @param value value to store in database
     * @param onComplete optional completion callback to use instead of returning promise
     * @returns promise that resolves with this reference when completed
     */
    set(value: T, onComplete?: (err: Error, ref: DataReference) => void): Promise<this>;
    /**
     * Updates properties of the referenced node
     * @param updates containing the properties to update
     * @param onComplete optional completion callback to use instead of returning promise
     * @return returns promise that resolves with this reference once completed
     */
    update(updates: Partial<T>, onComplete?: (err: Error, ref: DataReference) => void): Promise<this>;
    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed.
     * @param callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns returns a promise that resolves with the DataReference once the transaction has been processed
     */
    transaction<Value = T>(callback: (currentValue: DataSnapshot<Value>) => any): Promise<this>;
    /**
     * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed",
     * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the
     * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed",
     * "notify_child_removed" events instead, which will run the callback with a DataReference to the changed
     * data. This enables you to manually retrieve data upon changes (eg if you want to exclude certain child
     * data from loading)
     * @param event Name of the event to subscribe to
     * @param callback Callback function, event settings, or whether or not to run callbacks on current values when using "value" or "child_added" events
     * @param cancelCallback Function to call when the subscription is not allowed, or denied access later on
     * @param fireForCurrentValue Whether or not to run callbacks on current values when using "value" or "child_added" events
     * @param options Advanced options
     * @returns returns an EventStream
     */
    on<Val = T>(event: ValueEvent): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, callback: EventCallback<DataSnapshot<Val>>): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, callback: EventCallback<DataSnapshot<Val>>, cancelCallback: (error: string) => void): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, options: EventSettings): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: NotifyEvent): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, callback: EventCallback<DataReference<Val>>): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, callback: EventCallback<DataReference<Val>>, cancelCallback: (error: string) => void): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, options: EventSettings): EventStream<DataReference<Val>>;
    /** @deprecated Use `on(event, { newOnly: boolean })` signature instead */
    on<Val = T>(event: ValueEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataSnapshot<Val>>;
    /** @deprecated Use `on(event, { newOnly: boolean })` signature instead */
    on<Val = T>(event: NotifyEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataReference<Val>>;
    /**
     * Unsubscribes from a previously added event
     * @param event Name of the event
     * @param callback callback function to remove
     * @returns returns this `DataReference` instance
     */
    off(event?: ValueEvent, callback?: EventCallback<DataSnapshot>): this;
    off(event?: NotifyEvent, callback?: EventCallback<DataReference>): this;
    /**
     * Gets a snapshot of the stored value
     * @returns returns a promise that resolves with a snapshot of the data
     */
    get<Value = T>(): Promise<DataSnapshot<Value>>;
    /**
     * Gets a snapshot of the stored value, with/without specific child data
     * @param options data retrieval options to include or exclude specific child keys.
     * @returns returns a promise that resolves with a snapshot of the data
     */
    get<Value = T>(options: DataRetrievalOptions): Promise<DataSnapshot<Value>>;
    /**
     * Gets a snapshot of the stored value. Shorthand method for .once("value", callback)
     * @param callback callback function to run with a snapshot of the data instead of returning a promise
     * @returns returns nothing because a callback is used
     */
    get<Value = T>(callback: EventCallback<DataSnapshot<Value>>): void;
    /**
     * Gets a snapshot of the stored value, with/without specific child data
     * @param {DataRetrievalOptions} options data retrieval options to include or exclude specific child keys.
     * @param callback callback function to run with a snapshot of the data instead of returning a promise
     * @returns returns nothing because a callback is used
     */
    get<Value = T>(options: DataRetrievalOptions, callback: EventCallback<DataSnapshot<Value>>): void;
    get<Value = T>(optionsOrCallback?: DataRetrievalOptions | EventCallback<DataSnapshot<Value>>, callback?: EventCallback<DataSnapshot<Value>>): Promise<DataSnapshot<Value>> | void;
    /**
     * Waits for an event to occur
     * @param event Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param options data retrieval options, to include or exclude specific child keys
     * @returns returns promise that resolves with a snapshot of the data
     */
    once(event: ValueEvent | NotifyEvent, options?: DataRetrievalOptions): Promise<DataSnapshot<T> | void>;
    /**
     * Creates a new child with a unique key and returns the new reference.
     * If a value is passed as an argument, it will be stored to the database directly.
     * The returned reference can be used as a promise that resolves once the
     * given value is stored in the database
     * @param value optional value to store into the database right away
     * @param onComplete optional callback function to run once value has been stored
     * @returns returns promise that resolves with the reference after the passed value has been stored
     * @example
     * // Create a new user in "game_users"
     * const ref = await db.ref("game_users")
     *   .push({ name: "Betty Boop", points: 0 });
     * // ref is a new reference to the newly created object,
     * // eg to: "game_users/7dpJMeLbhY0tluMyuUBK27"
     * @example
     * // Create a new child reference with a generated key,
     * // but don't store it yet
     * let userRef = db.ref("users").push();
     * // ... to store it later:
     * await userRef.set({ name: "Popeye the Sailor" });
     */
    push<Value = any>(value: Value, onComplete?: (err: Error, ref: DataReference) => void): Promise<DataReference<Value>>;
    /**
     * @returns returns a reference to the new child
     */
    push(): DataReference;
    /**
     * Removes this node and all children
     */
    remove(): Promise<this>;
    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns returns a promise that resolves with a boolean value
     */
    exists(): Promise<boolean>;
    /**
     * Creates a query object for current node
     */
    query(): DataReferenceQuery;
    /**
     * Gets the number of children this node has, uses reflection
     */
    count(): Promise<number>;
    /**
     * Gets info about a node and/or its children without retrieving any child object values
     * @param type reflection type
     * @returns Returns promise that resolves with the node reflection info
     */
    reflect(type: "info", args: {
        /**
         * Whether to get a count of the number of children, instead of enumerating the children
         * @default false
         */
        child_count?: boolean;
        /**
         * Max number of children to enumerate
         * @default 50
         */
        child_limit?: number;
        /**
         * Number of children to skip when enumerating
         * @default 0
         */
        child_skip?: number;
        /**
         * Skip children before AND given key when enumerating
         */
        child_from?: string;
    }): Promise<ReflectionNodeInfo>;
    /**
     * @returns Returns promise that resolves with the node children reflection info
     */
    reflect(type: "children", args: {
        /**
         * Max number of children to enumerate
         * @default 50
         */
        limit?: number;
        /**
         * Number of children to skip when enumerating
         * @default 0
         */
        skip?: number;
        /**
         * Skip children before AND given key when enumerating
         */
        from?: string;
    }): Promise<ReflectionNodeInfo>;
    /**
     * Exports the value of this node and all children
     * @param write Function that writes data to your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is exported
     */
    export(write: StreamWriteFunction, options?: {
        format?: "json";
        type_safe?: boolean;
    }): Promise<void>;
    /**
     * @deprecated use method signature with stream writer function argument instead
     */
    export(stream: IStreamLike, options?: {
        format?: "json";
        type_safe?: boolean;
    }): Promise<void>;
    /**
     * Imports the value of this node and all children
     * @param read Function that reads data from your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is imported
     */
    import(read: StreamReadFunction, options?: {
        format: string;
        suppress_events: boolean;
    }): Promise<void>;
    /**
     * Creates a live data proxy for the given reference. The data of the referenced path will be loaded, and kept in-sync
     * with live data by listening for 'mutations' events. Any change made to the value by the client will be automatically
     * be synced back to the database. This allows you to forget about data storage, and code as if you are only handling
     * in-memory objects. Also works offline when a cache database is used. Synchronization never was this easy!
     * @param options Initialization options or the proxy, such as the default value
     * be written to the database.
     * @example
     * const ref = db.ref('chats/chat1');
     * const proxy = await ref.proxy();
     * const chat = proxy.value;
     * console.log(`Got chat "${chat.title}":`, chat);
     * // chat: { message: 'This is an example chat', members: ['Ewout'], messages: { message1: { from: 'Ewout', text: 'Welcome to the proxy chat example' } } }
     *
     * // Change title:
     * chat.title = 'Changing the title in the database too!';
     *
     * // Add participants to the members array:
     * chat.members.push('John', 'Jack', 'Pete');
     *
     * // Add a message to the messages collection (NOTE: automatically generates an ID)
     * chat.messages.push({ from: 'Ewout', message: 'I am changing the database without programming against it!' });
     */
    proxy<T = any>(options?: LiveDataProxyOptions<T>): Promise<ILiveDataProxy<T>>;
    /** @deprecated Use options argument instead */
    proxy<T = any>(defaultValue: T): Promise<ILiveDataProxy<T>>;
    /**
     * Returns a RxJS Observable that can be used to observe
     * updates to this node and its children. It does not return snapshots, so
     * you can bind the observable straight to a view. The value being observed
     * is updated internally using the new "mutated" event. All mutations are
     * applied to the original value, and kept in-memory.
     * @example
     * <!-- In your Angular view template: -->
     * <ng-container *ngIf="liveChat | async as chat">
     *    <Message *ngFor="let item of chat.messages | keyvalue" [message]="item.value"></Message>
     * </ng-container>
     *
     * // In your code:
     * ngOnInit() {
     *    this.liveChat = db.ref('chats/chat_id').observe();
     * }
     *
     * // Or, if you want to monitor updates yourself:
     * ngOnInit() {
     *    this.observer = db.ref('chats/chat_id').observe().subscribe(chat => {
     *       this.chat = chat;
     *    });
     * }
     * ngOnDestroy() {
     *    // DON'T forget to unsubscribe!
     *    this.observer.unsubscribe();
     * }
     */
    observe<T = any>(): Observable<T>;
    /**
     * Iterate through each child in the referenced collection by streaming them one at a time.
     * @param callback function to call with a `DataSnapshot` of each child. If your function
     * returns a `Promise`, iteration will wait until it resolves before loading the next child.
     * Iterating stops if callback returns (or resolves with) `false`
     * @returns Returns a Promise that resolves with an iteration summary.
     * @example
     * ```js
     * const result = await db.ref('books').forEach(bookSnapshot => {
     *   const book = bookSnapshot.val();
     *   console.log(`Got book "${book.title}": "${book.description}"`);
     * });
     *
     * // In above example we're only using 'title' and 'description'
     * // of each book. Let's only load those to increase performance:
     * const result = await db.ref('books').forEach(
     *    { include: ['title', 'description'] },
     *    bookSnapshot => {
     *       const book = bookSnapshot.val();
     *       console.log(`Got book "${book.title}": "${book.description}"`);
     *    }
     * );
     * ```
     */
    forEach<Child = any>(callback: ForEachIteratorCallback<Child>): Promise<ForEachIteratorResult>;
    /**
     * @param options specify what data to load for each child. Eg `{ include: ['title', 'description'] }`
     * will only load each child's title and description properties
     */
    forEach<Child = any>(options: DataRetrievalOptions, callback: ForEachIteratorCallback<Child>): Promise<ForEachIteratorResult>;
    /**
     * Gets mutations to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(cursor?: string | null): Promise<{
        used_cursor: string | null;
        new_cursor: string;
        mutations: ValueMutation[];
    }>;
    /**
     * Gets mutations to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(since?: Date): Promise<{
        used_cursor: string | null;
        new_cursor: string;
        mutations: ValueMutation[];
    }>;
    /**
     * Gets changes to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(cursor?: string | null): Promise<{
        used_cursor: string;
        new_cursor: string;
        changes: ValueChange[];
    }>;
    /**
     * Gets changes to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(since?: Date): Promise<{
        used_cursor: string | null;
        new_cursor: string;
        changes: ValueChange[];
    }>;
}
export declare class DataReferenceQuery {
    constructor(ref: DataReference);
}
export {};
//# sourceMappingURL=reference.d.ts.map