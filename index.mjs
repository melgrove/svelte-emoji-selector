function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function subscribe(store, callback) {
    const unsub = store.subscribe(callback);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, fn) {
    return definition[1]
        ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
        : ctx.$$scope.ctx;
}
function get_slot_changes(definition, ctx, changed, fn) {
    return definition[1]
        ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
        : ctx.$$scope.changed || {};
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}
function null_to_empty(value) {
    return value == null ? '' : value;
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function stop_propagation(fn) {
    return function (event) {
        event.stopPropagation();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.data !== data)
        text.data = data;
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}
function custom_event(type, detail) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, false, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function createEventDispatcher() {
    const component = current_component;
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}
function setContext(key, context) {
    get_current_component().$$.context.set(key, context);
}
function getContext(key) {
    return get_current_component().$$.context.get(key);
}
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        callbacks.slice().forEach(fn => fn(event));
    }
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function tick() {
    schedule_update();
    return resolved_promise;
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function add_flush_callback(fn) {
    flush_callbacks.push(fn);
}
function flush() {
    const seen_callbacks = new Set();
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                callback();
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}
function update($$) {
    if ($$.fragment) {
        $$.update($$.dirty);
        run_all($$.before_update);
        $$.fragment.p($$.dirty, $$.ctx);
        $$.dirty = null;
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}

function bind(component, name, callback) {
    if (component.$$.props.indexOf(name) === -1)
        return;
    component.$$.bound[name] = callback;
    callback(component.$$.ctx[name]);
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    if (component.$$.fragment) {
        run_all(component.$$.on_destroy);
        component.$$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        component.$$.on_destroy = component.$$.fragment = null;
        component.$$.ctx = {};
    }
}
function make_dirty(component, key) {
    if (!component.$$.dirty) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty = blank_object();
    }
    component.$$.dirty[key] = true;
}
function init(component, options, instance, create_fragment, not_equal, prop_names) {
    const parent_component = current_component;
    set_current_component(component);
    const props = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props: prop_names,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty: null
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, props, (key, value) => {
            if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                if ($$.bound[key])
                    $$.bound[key](value);
                if (ready)
                    make_dirty(component, key);
            }
        })
        : props;
    $$.update();
    ready = true;
    run_all($$.before_update);
    $$.fragment = create_fragment($$.ctx);
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

var faBuilding = {
  prefix: 'far',
  iconName: 'building',
  icon: [448, 512, [], "f1ad", "M128 148v-40c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12h-40c-6.6 0-12-5.4-12-12zm140 12h40c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12zm-128 96h40c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12zm128 0h40c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12zm-76 84v-40c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12h40c6.6 0 12-5.4 12-12zm76 12h40c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-40c-6.6 0-12 5.4-12 12v40c0 6.6 5.4 12 12 12zm180 124v36H0v-36c0-6.6 5.4-12 12-12h19.5V24c0-13.3 10.7-24 24-24h337c13.3 0 24 10.7 24 24v440H436c6.6 0 12 5.4 12 12zM79.5 463H192v-67c0-6.6 5.4-12 12-12h40c6.6 0 12 5.4 12 12v67h112.5V49L80 48l-.5 415z"]
};
var faFlag = {
  prefix: 'far',
  iconName: 'flag',
  icon: [512, 512, [], "f024", "M336.174 80c-49.132 0-93.305-32-161.913-32-31.301 0-58.303 6.482-80.721 15.168a48.04 48.04 0 0 0 2.142-20.727C93.067 19.575 74.167 1.594 51.201.104 23.242-1.71 0 20.431 0 48c0 17.764 9.657 33.262 24 41.562V496c0 8.837 7.163 16 16 16h16c8.837 0 16-7.163 16-16v-83.443C109.869 395.28 143.259 384 199.826 384c49.132 0 93.305 32 161.913 32 58.479 0 101.972-22.617 128.548-39.981C503.846 367.161 512 352.051 512 335.855V95.937c0-34.459-35.264-57.768-66.904-44.117C409.193 67.309 371.641 80 336.174 80zM464 336c-21.783 15.412-60.824 32-102.261 32-59.945 0-102.002-32-161.913-32-43.361 0-96.379 9.403-127.826 24V128c21.784-15.412 60.824-32 102.261-32 59.945 0 102.002 32 161.913 32 43.271 0 96.32-17.366 127.826-32v240z"]
};
var faFrown = {
  prefix: 'far',
  iconName: 'frown',
  icon: [496, 512, [], "f119", "M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"]
};
var faLightbulb = {
  prefix: 'far',
  iconName: 'lightbulb',
  icon: [352, 512, [], "f0eb", "M176 80c-52.94 0-96 43.06-96 96 0 8.84 7.16 16 16 16s16-7.16 16-16c0-35.3 28.72-64 64-64 8.84 0 16-7.16 16-16s-7.16-16-16-16zM96.06 459.17c0 3.15.93 6.22 2.68 8.84l24.51 36.84c2.97 4.46 7.97 7.14 13.32 7.14h78.85c5.36 0 10.36-2.68 13.32-7.14l24.51-36.84c1.74-2.62 2.67-5.7 2.68-8.84l.05-43.18H96.02l.04 43.18zM176 0C73.72 0 0 82.97 0 176c0 44.37 16.45 84.85 43.56 115.78 16.64 18.99 42.74 58.8 52.42 92.16v.06h48v-.12c-.01-4.77-.72-9.51-2.15-14.07-5.59-17.81-22.82-64.77-62.17-109.67-20.54-23.43-31.52-53.15-31.61-84.14-.2-73.64 59.67-128 127.95-128 70.58 0 128 57.42 128 128 0 30.97-11.24 60.85-31.65 84.14-39.11 44.61-56.42 91.47-62.1 109.46a47.507 47.507 0 0 0-2.22 14.3v.1h48v-.05c9.68-33.37 35.78-73.18 52.42-92.16C335.55 260.85 352 220.37 352 176 352 78.8 273.2 0 176 0z"]
};
var faSmile = {
  prefix: 'far',
  iconName: 'smile',
  icon: [496, 512, [], "f118", "M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"]
};

var faCat = {
  prefix: 'fas',
  iconName: 'cat',
  icon: [512, 512, [], "f6be", "M290.59 192c-20.18 0-106.82 1.98-162.59 85.95V192c0-52.94-43.06-96-96-96-17.67 0-32 14.33-32 32s14.33 32 32 32c17.64 0 32 14.36 32 32v256c0 35.3 28.7 64 64 64h176c8.84 0 16-7.16 16-16v-16c0-17.67-14.33-32-32-32h-32l128-96v144c0 8.84 7.16 16 16 16h32c8.84 0 16-7.16 16-16V289.86c-10.29 2.67-20.89 4.54-32 4.54-61.81 0-113.52-44.05-125.41-102.4zM448 96h-64l-64-64v134.4c0 53.02 42.98 96 96 96s96-42.98 96-96V32l-64 64zm-72 80c-8.84 0-16-7.16-16-16s7.16-16 16-16 16 7.16 16 16-7.16 16-16 16zm80 0c-8.84 0-16-7.16-16-16s7.16-16 16-16 16 7.16 16 16-7.16 16-16 16z"]
};
var faCoffee = {
  prefix: 'fas',
  iconName: 'coffee',
  icon: [640, 512, [], "f0f4", "M192 384h192c53 0 96-43 96-96h32c70.6 0 128-57.4 128-128S582.6 32 512 32H120c-13.3 0-24 10.7-24 24v232c0 53 43 96 96 96zM512 96c35.3 0 64 28.7 64 64s-28.7 64-64 64h-32V96h32zm47.7 384H48.3c-47.6 0-61-64-36-64h583.3c25 0 11.8 64-35.9 64z"]
};
var faFutbol = {
  prefix: 'fas',
  iconName: 'futbol',
  icon: [512, 512, [], "f1e3", "M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zm-48 0l-.003-.282-26.064 22.741-62.679-58.5 16.454-84.355 34.303 3.072c-24.889-34.216-60.004-60.089-100.709-73.141l13.651 31.939L256 139l-74.953-41.525 13.651-31.939c-40.631 13.028-75.78 38.87-100.709 73.141l34.565-3.073 16.192 84.355-62.678 58.5-26.064-22.741-.003.282c0 43.015 13.497 83.952 38.472 117.991l7.704-33.897 85.138 10.447 36.301 77.826-29.902 17.786c40.202 13.122 84.29 13.148 124.572 0l-29.902-17.786 36.301-77.826 85.138-10.447 7.704 33.897C442.503 339.952 456 299.015 456 256zm-248.102 69.571l-29.894-91.312L256 177.732l77.996 56.527-29.622 91.312h-96.476z"]
};
var faHistory = {
  prefix: 'fas',
  iconName: 'history',
  icon: [512, 512, [], "f1da", "M504 255.531c.253 136.64-111.18 248.372-247.82 248.468-59.015.042-113.223-20.53-155.822-54.911-11.077-8.94-11.905-25.541-1.839-35.607l11.267-11.267c8.609-8.609 22.353-9.551 31.891-1.984C173.062 425.135 212.781 440 256 440c101.705 0 184-82.311 184-184 0-101.705-82.311-184-184-184-48.814 0-93.149 18.969-126.068 49.932l50.754 50.754c10.08 10.08 2.941 27.314-11.313 27.314H24c-8.837 0-16-7.163-16-16V38.627c0-14.254 17.234-21.393 27.314-11.314l49.372 49.372C129.209 34.136 189.552 8 256 8c136.81 0 247.747 110.78 248 247.531zm-180.912 78.784l9.823-12.63c8.138-10.463 6.253-25.542-4.21-33.679L288 256.349V152c0-13.255-10.745-24-24-24h-16c-13.255 0-24 10.745-24 24v135.651l65.409 50.874c10.463 8.137 25.541 6.253 33.679-4.21z"]
};
var faMusic = {
  prefix: 'fas',
  iconName: 'music',
  icon: [512, 512, [], "f001", "M511.99 32.01c0-21.71-21.1-37.01-41.6-30.51L150.4 96c-13.3 4.2-22.4 16.5-22.4 30.5v261.42c-10.05-2.38-20.72-3.92-32-3.92-53.02 0-96 28.65-96 64s42.98 64 96 64 96-28.65 96-64V214.31l256-75.02v184.63c-10.05-2.38-20.72-3.92-32-3.92-53.02 0-96 28.65-96 64s42.98 64 96 64 96-28.65 96-64l-.01-351.99z"]
};
var faSearch = {
  prefix: 'fas',
  iconName: 'search',
  icon: [512, 512, [], "f002", "M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"]
};
var faTimes = {
  prefix: 'fas',
  iconName: 'times',
  icon: [352, 512, [], "f00d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"]
};

/* node_modules/fa-svelte/src/Icon.html generated by Svelte v3.8.1 */

function add_css() {
	var style = element("style");
	style.id = 'svelte-p8vizn-style';
	style.textContent = ".fa-svelte.svelte-p8vizn{width:1em;height:1em;overflow:visible;display:inline-block}";
	append(document.head, style);
}

function create_fragment(ctx) {
	var svg, path_1;

	return {
		c() {
			svg = svg_element("svg");
			path_1 = svg_element("path");
			attr(path_1, "fill", "currentColor");
			attr(path_1, "d", ctx.path);
			attr(svg, "aria-hidden", "true");
			attr(svg, "class", "" + null_to_empty(ctx.classes) + " svelte-p8vizn");
			attr(svg, "role", "img");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg, "viewBox", ctx.viewBox);
		},

		m(target, anchor) {
			insert(target, svg, anchor);
			append(svg, path_1);
		},

		p(changed, ctx) {
			if (changed.path) {
				attr(path_1, "d", ctx.path);
			}

			if (changed.classes) {
				attr(svg, "class", "" + null_to_empty(ctx.classes) + " svelte-p8vizn");
			}

			if (changed.viewBox) {
				attr(svg, "viewBox", ctx.viewBox);
			}
		},

		i: noop,
		o: noop,

		d(detaching) {
			if (detaching) {
				detach(svg);
			}
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { icon } = $$props;

  let path = [];
  let classes = "";
  let viewBox = "";

	$$self.$set = $$new_props => {
		$$invalidate('$$props', $$props = assign(assign({}, $$props), $$new_props));
		if ('icon' in $$new_props) $$invalidate('icon', icon = $$new_props.icon);
	};

	$$self.$$.update = ($$dirty = { icon: 1, $$props: 1 }) => {
		if ($$dirty.icon) { $$invalidate('viewBox', viewBox = "0 0 " + icon.icon[0] + " " + icon.icon[1]); }
		$$invalidate('classes', classes = "fa-svelte " + ($$props.class ? $$props.class : ""));
		if ($$dirty.icon) { $$invalidate('path', path = icon.icon[4]); }
	};

	return {
		icon,
		path,
		classes,
		viewBox,
		$$props: $$props = exclude_internal_props($$props)
	};
}

class Icon extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-p8vizn-style")) add_css();
		init(this, options, instance, create_fragment, safe_not_equal, ["icon"]);
	}
}

/**!
 * @fileOverview Kickass library to create and place poppers near their reference elements.
 * @version 1.15.0
 * @license
 * Copyright (c) 2016 Federico Zivolo and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
var isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

var longerTimeoutBrowsers = ['Edge', 'Trident', 'Firefox'];
var timeoutDuration = 0;
for (var i = 0; i < longerTimeoutBrowsers.length; i += 1) {
  if (isBrowser && navigator.userAgent.indexOf(longerTimeoutBrowsers[i]) >= 0) {
    timeoutDuration = 1;
    break;
  }
}

function microtaskDebounce(fn) {
  var called = false;
  return function () {
    if (called) {
      return;
    }
    called = true;
    window.Promise.resolve().then(function () {
      called = false;
      fn();
    });
  };
}

function taskDebounce(fn) {
  var scheduled = false;
  return function () {
    if (!scheduled) {
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        fn();
      }, timeoutDuration);
    }
  };
}

var supportsMicroTasks = isBrowser && window.Promise;

/**
* Create a debounced version of a method, that's asynchronously deferred
* but called in the minimum time possible.
*
* @method
* @memberof Popper.Utils
* @argument {Function} fn
* @returns {Function}
*/
var debounce = supportsMicroTasks ? microtaskDebounce : taskDebounce;

/**
 * Check if the given variable is a function
 * @method
 * @memberof Popper.Utils
 * @argument {Any} functionToCheck - variable to check
 * @returns {Boolean} answer to: is a function?
 */
function isFunction(functionToCheck) {
  var getType = {};
  return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

/**
 * Get CSS computed property of the given element
 * @method
 * @memberof Popper.Utils
 * @argument {Eement} element
 * @argument {String} property
 */
function getStyleComputedProperty(element, property) {
  if (element.nodeType !== 1) {
    return [];
  }
  // NOTE: 1 DOM access here
  var window = element.ownerDocument.defaultView;
  var css = window.getComputedStyle(element, null);
  return property ? css[property] : css;
}

/**
 * Returns the parentNode or the host of the element
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @returns {Element} parent
 */
function getParentNode(element) {
  if (element.nodeName === 'HTML') {
    return element;
  }
  return element.parentNode || element.host;
}

/**
 * Returns the scrolling parent of the given element
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @returns {Element} scroll parent
 */
function getScrollParent(element) {
  // Return body, `getScroll` will take care to get the correct `scrollTop` from it
  if (!element) {
    return document.body;
  }

  switch (element.nodeName) {
    case 'HTML':
    case 'BODY':
      return element.ownerDocument.body;
    case '#document':
      return element.body;
  }

  // Firefox want us to check `-x` and `-y` variations as well

  var _getStyleComputedProp = getStyleComputedProperty(element),
      overflow = _getStyleComputedProp.overflow,
      overflowX = _getStyleComputedProp.overflowX,
      overflowY = _getStyleComputedProp.overflowY;

  if (/(auto|scroll|overlay)/.test(overflow + overflowY + overflowX)) {
    return element;
  }

  return getScrollParent(getParentNode(element));
}

var isIE11 = isBrowser && !!(window.MSInputMethodContext && document.documentMode);
var isIE10 = isBrowser && /MSIE 10/.test(navigator.userAgent);

/**
 * Determines if the browser is Internet Explorer
 * @method
 * @memberof Popper.Utils
 * @param {Number} version to check
 * @returns {Boolean} isIE
 */
function isIE(version) {
  if (version === 11) {
    return isIE11;
  }
  if (version === 10) {
    return isIE10;
  }
  return isIE11 || isIE10;
}

/**
 * Returns the offset parent of the given element
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @returns {Element} offset parent
 */
function getOffsetParent(element) {
  if (!element) {
    return document.documentElement;
  }

  var noOffsetParent = isIE(10) ? document.body : null;

  // NOTE: 1 DOM access here
  var offsetParent = element.offsetParent || null;
  // Skip hidden elements which don't have an offsetParent
  while (offsetParent === noOffsetParent && element.nextElementSibling) {
    offsetParent = (element = element.nextElementSibling).offsetParent;
  }

  var nodeName = offsetParent && offsetParent.nodeName;

  if (!nodeName || nodeName === 'BODY' || nodeName === 'HTML') {
    return element ? element.ownerDocument.documentElement : document.documentElement;
  }

  // .offsetParent will return the closest TH, TD or TABLE in case
  // no offsetParent is present, I hate this job...
  if (['TH', 'TD', 'TABLE'].indexOf(offsetParent.nodeName) !== -1 && getStyleComputedProperty(offsetParent, 'position') === 'static') {
    return getOffsetParent(offsetParent);
  }

  return offsetParent;
}

function isOffsetContainer(element) {
  var nodeName = element.nodeName;

  if (nodeName === 'BODY') {
    return false;
  }
  return nodeName === 'HTML' || getOffsetParent(element.firstElementChild) === element;
}

/**
 * Finds the root node (document, shadowDOM root) of the given element
 * @method
 * @memberof Popper.Utils
 * @argument {Element} node
 * @returns {Element} root node
 */
function getRoot(node) {
  if (node.parentNode !== null) {
    return getRoot(node.parentNode);
  }

  return node;
}

/**
 * Finds the offset parent common to the two provided nodes
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element1
 * @argument {Element} element2
 * @returns {Element} common offset parent
 */
function findCommonOffsetParent(element1, element2) {
  // This check is needed to avoid errors in case one of the elements isn't defined for any reason
  if (!element1 || !element1.nodeType || !element2 || !element2.nodeType) {
    return document.documentElement;
  }

  // Here we make sure to give as "start" the element that comes first in the DOM
  var order = element1.compareDocumentPosition(element2) & Node.DOCUMENT_POSITION_FOLLOWING;
  var start = order ? element1 : element2;
  var end = order ? element2 : element1;

  // Get common ancestor container
  var range = document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, 0);
  var commonAncestorContainer = range.commonAncestorContainer;

  // Both nodes are inside #document

  if (element1 !== commonAncestorContainer && element2 !== commonAncestorContainer || start.contains(end)) {
    if (isOffsetContainer(commonAncestorContainer)) {
      return commonAncestorContainer;
    }

    return getOffsetParent(commonAncestorContainer);
  }

  // one of the nodes is inside shadowDOM, find which one
  var element1root = getRoot(element1);
  if (element1root.host) {
    return findCommonOffsetParent(element1root.host, element2);
  } else {
    return findCommonOffsetParent(element1, getRoot(element2).host);
  }
}

/**
 * Gets the scroll value of the given element in the given side (top and left)
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @argument {String} side `top` or `left`
 * @returns {number} amount of scrolled pixels
 */
function getScroll(element) {
  var side = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'top';

  var upperSide = side === 'top' ? 'scrollTop' : 'scrollLeft';
  var nodeName = element.nodeName;

  if (nodeName === 'BODY' || nodeName === 'HTML') {
    var html = element.ownerDocument.documentElement;
    var scrollingElement = element.ownerDocument.scrollingElement || html;
    return scrollingElement[upperSide];
  }

  return element[upperSide];
}

/*
 * Sum or subtract the element scroll values (left and top) from a given rect object
 * @method
 * @memberof Popper.Utils
 * @param {Object} rect - Rect object you want to change
 * @param {HTMLElement} element - The element from the function reads the scroll values
 * @param {Boolean} subtract - set to true if you want to subtract the scroll values
 * @return {Object} rect - The modifier rect object
 */
function includeScroll(rect, element) {
  var subtract = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  var scrollTop = getScroll(element, 'top');
  var scrollLeft = getScroll(element, 'left');
  var modifier = subtract ? -1 : 1;
  rect.top += scrollTop * modifier;
  rect.bottom += scrollTop * modifier;
  rect.left += scrollLeft * modifier;
  rect.right += scrollLeft * modifier;
  return rect;
}

/*
 * Helper to detect borders of a given element
 * @method
 * @memberof Popper.Utils
 * @param {CSSStyleDeclaration} styles
 * Result of `getStyleComputedProperty` on the given element
 * @param {String} axis - `x` or `y`
 * @return {number} borders - The borders size of the given axis
 */

function getBordersSize(styles, axis) {
  var sideA = axis === 'x' ? 'Left' : 'Top';
  var sideB = sideA === 'Left' ? 'Right' : 'Bottom';

  return parseFloat(styles['border' + sideA + 'Width'], 10) + parseFloat(styles['border' + sideB + 'Width'], 10);
}

function getSize(axis, body, html, computedStyle) {
  return Math.max(body['offset' + axis], body['scroll' + axis], html['client' + axis], html['offset' + axis], html['scroll' + axis], isIE(10) ? parseInt(html['offset' + axis]) + parseInt(computedStyle['margin' + (axis === 'Height' ? 'Top' : 'Left')]) + parseInt(computedStyle['margin' + (axis === 'Height' ? 'Bottom' : 'Right')]) : 0);
}

function getWindowSizes(document) {
  var body = document.body;
  var html = document.documentElement;
  var computedStyle = isIE(10) && getComputedStyle(html);

  return {
    height: getSize('Height', body, html, computedStyle),
    width: getSize('Width', body, html, computedStyle)
  };
}

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();





var defineProperty = function (obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
};

var _extends = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }

  return target;
};

/**
 * Given element offsets, generate an output similar to getBoundingClientRect
 * @method
 * @memberof Popper.Utils
 * @argument {Object} offsets
 * @returns {Object} ClientRect like output
 */
function getClientRect(offsets) {
  return _extends({}, offsets, {
    right: offsets.left + offsets.width,
    bottom: offsets.top + offsets.height
  });
}

/**
 * Get bounding client rect of given element
 * @method
 * @memberof Popper.Utils
 * @param {HTMLElement} element
 * @return {Object} client rect
 */
function getBoundingClientRect(element) {
  var rect = {};

  // IE10 10 FIX: Please, don't ask, the element isn't
  // considered in DOM in some circumstances...
  // This isn't reproducible in IE10 compatibility mode of IE11
  try {
    if (isIE(10)) {
      rect = element.getBoundingClientRect();
      var scrollTop = getScroll(element, 'top');
      var scrollLeft = getScroll(element, 'left');
      rect.top += scrollTop;
      rect.left += scrollLeft;
      rect.bottom += scrollTop;
      rect.right += scrollLeft;
    } else {
      rect = element.getBoundingClientRect();
    }
  } catch (e) {}

  var result = {
    left: rect.left,
    top: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top
  };

  // subtract scrollbar size from sizes
  var sizes = element.nodeName === 'HTML' ? getWindowSizes(element.ownerDocument) : {};
  var width = sizes.width || element.clientWidth || result.right - result.left;
  var height = sizes.height || element.clientHeight || result.bottom - result.top;

  var horizScrollbar = element.offsetWidth - width;
  var vertScrollbar = element.offsetHeight - height;

  // if an hypothetical scrollbar is detected, we must be sure it's not a `border`
  // we make this check conditional for performance reasons
  if (horizScrollbar || vertScrollbar) {
    var styles = getStyleComputedProperty(element);
    horizScrollbar -= getBordersSize(styles, 'x');
    vertScrollbar -= getBordersSize(styles, 'y');

    result.width -= horizScrollbar;
    result.height -= vertScrollbar;
  }

  return getClientRect(result);
}

function getOffsetRectRelativeToArbitraryNode(children, parent) {
  var fixedPosition = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  var isIE10 = isIE(10);
  var isHTML = parent.nodeName === 'HTML';
  var childrenRect = getBoundingClientRect(children);
  var parentRect = getBoundingClientRect(parent);
  var scrollParent = getScrollParent(children);

  var styles = getStyleComputedProperty(parent);
  var borderTopWidth = parseFloat(styles.borderTopWidth, 10);
  var borderLeftWidth = parseFloat(styles.borderLeftWidth, 10);

  // In cases where the parent is fixed, we must ignore negative scroll in offset calc
  if (fixedPosition && isHTML) {
    parentRect.top = Math.max(parentRect.top, 0);
    parentRect.left = Math.max(parentRect.left, 0);
  }
  var offsets = getClientRect({
    top: childrenRect.top - parentRect.top - borderTopWidth,
    left: childrenRect.left - parentRect.left - borderLeftWidth,
    width: childrenRect.width,
    height: childrenRect.height
  });
  offsets.marginTop = 0;
  offsets.marginLeft = 0;

  // Subtract margins of documentElement in case it's being used as parent
  // we do this only on HTML because it's the only element that behaves
  // differently when margins are applied to it. The margins are included in
  // the box of the documentElement, in the other cases not.
  if (!isIE10 && isHTML) {
    var marginTop = parseFloat(styles.marginTop, 10);
    var marginLeft = parseFloat(styles.marginLeft, 10);

    offsets.top -= borderTopWidth - marginTop;
    offsets.bottom -= borderTopWidth - marginTop;
    offsets.left -= borderLeftWidth - marginLeft;
    offsets.right -= borderLeftWidth - marginLeft;

    // Attach marginTop and marginLeft because in some circumstances we may need them
    offsets.marginTop = marginTop;
    offsets.marginLeft = marginLeft;
  }

  if (isIE10 && !fixedPosition ? parent.contains(scrollParent) : parent === scrollParent && scrollParent.nodeName !== 'BODY') {
    offsets = includeScroll(offsets, parent);
  }

  return offsets;
}

function getViewportOffsetRectRelativeToArtbitraryNode(element) {
  var excludeScroll = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

  var html = element.ownerDocument.documentElement;
  var relativeOffset = getOffsetRectRelativeToArbitraryNode(element, html);
  var width = Math.max(html.clientWidth, window.innerWidth || 0);
  var height = Math.max(html.clientHeight, window.innerHeight || 0);

  var scrollTop = !excludeScroll ? getScroll(html) : 0;
  var scrollLeft = !excludeScroll ? getScroll(html, 'left') : 0;

  var offset = {
    top: scrollTop - relativeOffset.top + relativeOffset.marginTop,
    left: scrollLeft - relativeOffset.left + relativeOffset.marginLeft,
    width: width,
    height: height
  };

  return getClientRect(offset);
}

/**
 * Check if the given element is fixed or is inside a fixed parent
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @argument {Element} customContainer
 * @returns {Boolean} answer to "isFixed?"
 */
function isFixed(element) {
  var nodeName = element.nodeName;
  if (nodeName === 'BODY' || nodeName === 'HTML') {
    return false;
  }
  if (getStyleComputedProperty(element, 'position') === 'fixed') {
    return true;
  }
  var parentNode = getParentNode(element);
  if (!parentNode) {
    return false;
  }
  return isFixed(parentNode);
}

/**
 * Finds the first parent of an element that has a transformed property defined
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @returns {Element} first transformed parent or documentElement
 */

function getFixedPositionOffsetParent(element) {
  // This check is needed to avoid errors in case one of the elements isn't defined for any reason
  if (!element || !element.parentElement || isIE()) {
    return document.documentElement;
  }
  var el = element.parentElement;
  while (el && getStyleComputedProperty(el, 'transform') === 'none') {
    el = el.parentElement;
  }
  return el || document.documentElement;
}

/**
 * Computed the boundaries limits and return them
 * @method
 * @memberof Popper.Utils
 * @param {HTMLElement} popper
 * @param {HTMLElement} reference
 * @param {number} padding
 * @param {HTMLElement} boundariesElement - Element used to define the boundaries
 * @param {Boolean} fixedPosition - Is in fixed position mode
 * @returns {Object} Coordinates of the boundaries
 */
function getBoundaries(popper, reference, padding, boundariesElement) {
  var fixedPosition = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

  // NOTE: 1 DOM access here

  var boundaries = { top: 0, left: 0 };
  var offsetParent = fixedPosition ? getFixedPositionOffsetParent(popper) : findCommonOffsetParent(popper, reference);

  // Handle viewport case
  if (boundariesElement === 'viewport') {
    boundaries = getViewportOffsetRectRelativeToArtbitraryNode(offsetParent, fixedPosition);
  } else {
    // Handle other cases based on DOM element used as boundaries
    var boundariesNode = void 0;
    if (boundariesElement === 'scrollParent') {
      boundariesNode = getScrollParent(getParentNode(reference));
      if (boundariesNode.nodeName === 'BODY') {
        boundariesNode = popper.ownerDocument.documentElement;
      }
    } else if (boundariesElement === 'window') {
      boundariesNode = popper.ownerDocument.documentElement;
    } else {
      boundariesNode = boundariesElement;
    }

    var offsets = getOffsetRectRelativeToArbitraryNode(boundariesNode, offsetParent, fixedPosition);

    // In case of HTML, we need a different computation
    if (boundariesNode.nodeName === 'HTML' && !isFixed(offsetParent)) {
      var _getWindowSizes = getWindowSizes(popper.ownerDocument),
          height = _getWindowSizes.height,
          width = _getWindowSizes.width;

      boundaries.top += offsets.top - offsets.marginTop;
      boundaries.bottom = height + offsets.top;
      boundaries.left += offsets.left - offsets.marginLeft;
      boundaries.right = width + offsets.left;
    } else {
      // for all the other DOM elements, this one is good
      boundaries = offsets;
    }
  }

  // Add paddings
  padding = padding || 0;
  var isPaddingNumber = typeof padding === 'number';
  boundaries.left += isPaddingNumber ? padding : padding.left || 0;
  boundaries.top += isPaddingNumber ? padding : padding.top || 0;
  boundaries.right -= isPaddingNumber ? padding : padding.right || 0;
  boundaries.bottom -= isPaddingNumber ? padding : padding.bottom || 0;

  return boundaries;
}

function getArea(_ref) {
  var width = _ref.width,
      height = _ref.height;

  return width * height;
}

/**
 * Utility used to transform the `auto` placement to the placement with more
 * available space.
 * @method
 * @memberof Popper.Utils
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function computeAutoPlacement(placement, refRect, popper, reference, boundariesElement) {
  var padding = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 0;

  if (placement.indexOf('auto') === -1) {
    return placement;
  }

  var boundaries = getBoundaries(popper, reference, padding, boundariesElement);

  var rects = {
    top: {
      width: boundaries.width,
      height: refRect.top - boundaries.top
    },
    right: {
      width: boundaries.right - refRect.right,
      height: boundaries.height
    },
    bottom: {
      width: boundaries.width,
      height: boundaries.bottom - refRect.bottom
    },
    left: {
      width: refRect.left - boundaries.left,
      height: boundaries.height
    }
  };

  var sortedAreas = Object.keys(rects).map(function (key) {
    return _extends({
      key: key
    }, rects[key], {
      area: getArea(rects[key])
    });
  }).sort(function (a, b) {
    return b.area - a.area;
  });

  var filteredAreas = sortedAreas.filter(function (_ref2) {
    var width = _ref2.width,
        height = _ref2.height;
    return width >= popper.clientWidth && height >= popper.clientHeight;
  });

  var computedPlacement = filteredAreas.length > 0 ? filteredAreas[0].key : sortedAreas[0].key;

  var variation = placement.split('-')[1];

  return computedPlacement + (variation ? '-' + variation : '');
}

/**
 * Get offsets to the reference element
 * @method
 * @memberof Popper.Utils
 * @param {Object} state
 * @param {Element} popper - the popper element
 * @param {Element} reference - the reference element (the popper will be relative to this)
 * @param {Element} fixedPosition - is in fixed position mode
 * @returns {Object} An object containing the offsets which will be applied to the popper
 */
function getReferenceOffsets(state, popper, reference) {
  var fixedPosition = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

  var commonOffsetParent = fixedPosition ? getFixedPositionOffsetParent(popper) : findCommonOffsetParent(popper, reference);
  return getOffsetRectRelativeToArbitraryNode(reference, commonOffsetParent, fixedPosition);
}

/**
 * Get the outer sizes of the given element (offset size + margins)
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element
 * @returns {Object} object containing width and height properties
 */
function getOuterSizes(element) {
  var window = element.ownerDocument.defaultView;
  var styles = window.getComputedStyle(element);
  var x = parseFloat(styles.marginTop || 0) + parseFloat(styles.marginBottom || 0);
  var y = parseFloat(styles.marginLeft || 0) + parseFloat(styles.marginRight || 0);
  var result = {
    width: element.offsetWidth + y,
    height: element.offsetHeight + x
  };
  return result;
}

/**
 * Get the opposite placement of the given one
 * @method
 * @memberof Popper.Utils
 * @argument {String} placement
 * @returns {String} flipped placement
 */
function getOppositePlacement(placement) {
  var hash = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' };
  return placement.replace(/left|right|bottom|top/g, function (matched) {
    return hash[matched];
  });
}

/**
 * Get offsets to the popper
 * @method
 * @memberof Popper.Utils
 * @param {Object} position - CSS position the Popper will get applied
 * @param {HTMLElement} popper - the popper element
 * @param {Object} referenceOffsets - the reference offsets (the popper will be relative to this)
 * @param {String} placement - one of the valid placement options
 * @returns {Object} popperOffsets - An object containing the offsets which will be applied to the popper
 */
function getPopperOffsets(popper, referenceOffsets, placement) {
  placement = placement.split('-')[0];

  // Get popper node sizes
  var popperRect = getOuterSizes(popper);

  // Add position, width and height to our offsets object
  var popperOffsets = {
    width: popperRect.width,
    height: popperRect.height
  };

  // depending by the popper placement we have to compute its offsets slightly differently
  var isHoriz = ['right', 'left'].indexOf(placement) !== -1;
  var mainSide = isHoriz ? 'top' : 'left';
  var secondarySide = isHoriz ? 'left' : 'top';
  var measurement = isHoriz ? 'height' : 'width';
  var secondaryMeasurement = !isHoriz ? 'height' : 'width';

  popperOffsets[mainSide] = referenceOffsets[mainSide] + referenceOffsets[measurement] / 2 - popperRect[measurement] / 2;
  if (placement === secondarySide) {
    popperOffsets[secondarySide] = referenceOffsets[secondarySide] - popperRect[secondaryMeasurement];
  } else {
    popperOffsets[secondarySide] = referenceOffsets[getOppositePlacement(secondarySide)];
  }

  return popperOffsets;
}

/**
 * Mimics the `find` method of Array
 * @method
 * @memberof Popper.Utils
 * @argument {Array} arr
 * @argument prop
 * @argument value
 * @returns index or -1
 */
function find(arr, check) {
  // use native find if supported
  if (Array.prototype.find) {
    return arr.find(check);
  }

  // use `filter` to obtain the same behavior of `find`
  return arr.filter(check)[0];
}

/**
 * Return the index of the matching object
 * @method
 * @memberof Popper.Utils
 * @argument {Array} arr
 * @argument prop
 * @argument value
 * @returns index or -1
 */
function findIndex(arr, prop, value) {
  // use native findIndex if supported
  if (Array.prototype.findIndex) {
    return arr.findIndex(function (cur) {
      return cur[prop] === value;
    });
  }

  // use `find` + `indexOf` if `findIndex` isn't supported
  var match = find(arr, function (obj) {
    return obj[prop] === value;
  });
  return arr.indexOf(match);
}

/**
 * Loop trough the list of modifiers and run them in order,
 * each of them will then edit the data object.
 * @method
 * @memberof Popper.Utils
 * @param {dataObject} data
 * @param {Array} modifiers
 * @param {String} ends - Optional modifier name used as stopper
 * @returns {dataObject}
 */
function runModifiers(modifiers, data, ends) {
  var modifiersToRun = ends === undefined ? modifiers : modifiers.slice(0, findIndex(modifiers, 'name', ends));

  modifiersToRun.forEach(function (modifier) {
    if (modifier['function']) {
      // eslint-disable-line dot-notation
      console.warn('`modifier.function` is deprecated, use `modifier.fn`!');
    }
    var fn = modifier['function'] || modifier.fn; // eslint-disable-line dot-notation
    if (modifier.enabled && isFunction(fn)) {
      // Add properties to offsets to make them a complete clientRect object
      // we do this before each modifier to make sure the previous one doesn't
      // mess with these values
      data.offsets.popper = getClientRect(data.offsets.popper);
      data.offsets.reference = getClientRect(data.offsets.reference);

      data = fn(data, modifier);
    }
  });

  return data;
}

/**
 * Updates the position of the popper, computing the new offsets and applying
 * the new style.<br />
 * Prefer `scheduleUpdate` over `update` because of performance reasons.
 * @method
 * @memberof Popper
 */
function update$1() {
  // if popper is destroyed, don't perform any further update
  if (this.state.isDestroyed) {
    return;
  }

  var data = {
    instance: this,
    styles: {},
    arrowStyles: {},
    attributes: {},
    flipped: false,
    offsets: {}
  };

  // compute reference element offsets
  data.offsets.reference = getReferenceOffsets(this.state, this.popper, this.reference, this.options.positionFixed);

  // compute auto placement, store placement inside the data object,
  // modifiers will be able to edit `placement` if needed
  // and refer to originalPlacement to know the original value
  data.placement = computeAutoPlacement(this.options.placement, data.offsets.reference, this.popper, this.reference, this.options.modifiers.flip.boundariesElement, this.options.modifiers.flip.padding);

  // store the computed placement inside `originalPlacement`
  data.originalPlacement = data.placement;

  data.positionFixed = this.options.positionFixed;

  // compute the popper offsets
  data.offsets.popper = getPopperOffsets(this.popper, data.offsets.reference, data.placement);

  data.offsets.popper.position = this.options.positionFixed ? 'fixed' : 'absolute';

  // run the modifiers
  data = runModifiers(this.modifiers, data);

  // the first `update` will call `onCreate` callback
  // the other ones will call `onUpdate` callback
  if (!this.state.isCreated) {
    this.state.isCreated = true;
    this.options.onCreate(data);
  } else {
    this.options.onUpdate(data);
  }
}

/**
 * Helper used to know if the given modifier is enabled.
 * @method
 * @memberof Popper.Utils
 * @returns {Boolean}
 */
function isModifierEnabled(modifiers, modifierName) {
  return modifiers.some(function (_ref) {
    var name = _ref.name,
        enabled = _ref.enabled;
    return enabled && name === modifierName;
  });
}

/**
 * Get the prefixed supported property name
 * @method
 * @memberof Popper.Utils
 * @argument {String} property (camelCase)
 * @returns {String} prefixed property (camelCase or PascalCase, depending on the vendor prefix)
 */
function getSupportedPropertyName(property) {
  var prefixes = [false, 'ms', 'Webkit', 'Moz', 'O'];
  var upperProp = property.charAt(0).toUpperCase() + property.slice(1);

  for (var i = 0; i < prefixes.length; i++) {
    var prefix = prefixes[i];
    var toCheck = prefix ? '' + prefix + upperProp : property;
    if (typeof document.body.style[toCheck] !== 'undefined') {
      return toCheck;
    }
  }
  return null;
}

/**
 * Destroys the popper.
 * @method
 * @memberof Popper
 */
function destroy() {
  this.state.isDestroyed = true;

  // touch DOM only if `applyStyle` modifier is enabled
  if (isModifierEnabled(this.modifiers, 'applyStyle')) {
    this.popper.removeAttribute('x-placement');
    this.popper.style.position = '';
    this.popper.style.top = '';
    this.popper.style.left = '';
    this.popper.style.right = '';
    this.popper.style.bottom = '';
    this.popper.style.willChange = '';
    this.popper.style[getSupportedPropertyName('transform')] = '';
  }

  this.disableEventListeners();

  // remove the popper if user explicity asked for the deletion on destroy
  // do not use `remove` because IE11 doesn't support it
  if (this.options.removeOnDestroy) {
    this.popper.parentNode.removeChild(this.popper);
  }
  return this;
}

/**
 * Get the window associated with the element
 * @argument {Element} element
 * @returns {Window}
 */
function getWindow(element) {
  var ownerDocument = element.ownerDocument;
  return ownerDocument ? ownerDocument.defaultView : window;
}

function attachToScrollParents(scrollParent, event, callback, scrollParents) {
  var isBody = scrollParent.nodeName === 'BODY';
  var target = isBody ? scrollParent.ownerDocument.defaultView : scrollParent;
  target.addEventListener(event, callback, { passive: true });

  if (!isBody) {
    attachToScrollParents(getScrollParent(target.parentNode), event, callback, scrollParents);
  }
  scrollParents.push(target);
}

/**
 * Setup needed event listeners used to update the popper position
 * @method
 * @memberof Popper.Utils
 * @private
 */
function setupEventListeners(reference, options, state, updateBound) {
  // Resize event listener on window
  state.updateBound = updateBound;
  getWindow(reference).addEventListener('resize', state.updateBound, { passive: true });

  // Scroll event listener on scroll parents
  var scrollElement = getScrollParent(reference);
  attachToScrollParents(scrollElement, 'scroll', state.updateBound, state.scrollParents);
  state.scrollElement = scrollElement;
  state.eventsEnabled = true;

  return state;
}

/**
 * It will add resize/scroll events and start recalculating
 * position of the popper element when they are triggered.
 * @method
 * @memberof Popper
 */
function enableEventListeners() {
  if (!this.state.eventsEnabled) {
    this.state = setupEventListeners(this.reference, this.options, this.state, this.scheduleUpdate);
  }
}

/**
 * Remove event listeners used to update the popper position
 * @method
 * @memberof Popper.Utils
 * @private
 */
function removeEventListeners(reference, state) {
  // Remove resize event listener on window
  getWindow(reference).removeEventListener('resize', state.updateBound);

  // Remove scroll event listener on scroll parents
  state.scrollParents.forEach(function (target) {
    target.removeEventListener('scroll', state.updateBound);
  });

  // Reset state
  state.updateBound = null;
  state.scrollParents = [];
  state.scrollElement = null;
  state.eventsEnabled = false;
  return state;
}

/**
 * It will remove resize/scroll events and won't recalculate popper position
 * when they are triggered. It also won't trigger `onUpdate` callback anymore,
 * unless you call `update` method manually.
 * @method
 * @memberof Popper
 */
function disableEventListeners() {
  if (this.state.eventsEnabled) {
    cancelAnimationFrame(this.scheduleUpdate);
    this.state = removeEventListeners(this.reference, this.state);
  }
}

/**
 * Tells if a given input is a number
 * @method
 * @memberof Popper.Utils
 * @param {*} input to check
 * @return {Boolean}
 */
function isNumeric(n) {
  return n !== '' && !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * Set the style to the given popper
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element - Element to apply the style to
 * @argument {Object} styles
 * Object with a list of properties and values which will be applied to the element
 */
function setStyles(element, styles) {
  Object.keys(styles).forEach(function (prop) {
    var unit = '';
    // add unit if the value is numeric and is one of the following
    if (['width', 'height', 'top', 'right', 'bottom', 'left'].indexOf(prop) !== -1 && isNumeric(styles[prop])) {
      unit = 'px';
    }
    element.style[prop] = styles[prop] + unit;
  });
}

/**
 * Set the attributes to the given popper
 * @method
 * @memberof Popper.Utils
 * @argument {Element} element - Element to apply the attributes to
 * @argument {Object} styles
 * Object with a list of properties and values which will be applied to the element
 */
function setAttributes(element, attributes) {
  Object.keys(attributes).forEach(function (prop) {
    var value = attributes[prop];
    if (value !== false) {
      element.setAttribute(prop, attributes[prop]);
    } else {
      element.removeAttribute(prop);
    }
  });
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Object} data.styles - List of style properties - values to apply to popper element
 * @argument {Object} data.attributes - List of attribute properties - values to apply to popper element
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The same data object
 */
function applyStyle(data) {
  // any property present in `data.styles` will be applied to the popper,
  // in this way we can make the 3rd party modifiers add custom styles to it
  // Be aware, modifiers could override the properties defined in the previous
  // lines of this modifier!
  setStyles(data.instance.popper, data.styles);

  // any property present in `data.attributes` will be applied to the popper,
  // they will be set as HTML attributes of the element
  setAttributes(data.instance.popper, data.attributes);

  // if arrowElement is defined and arrowStyles has some properties
  if (data.arrowElement && Object.keys(data.arrowStyles).length) {
    setStyles(data.arrowElement, data.arrowStyles);
  }

  return data;
}

/**
 * Set the x-placement attribute before everything else because it could be used
 * to add margins to the popper margins needs to be calculated to get the
 * correct popper offsets.
 * @method
 * @memberof Popper.modifiers
 * @param {HTMLElement} reference - The reference element used to position the popper
 * @param {HTMLElement} popper - The HTML element used as popper
 * @param {Object} options - Popper.js options
 */
function applyStyleOnLoad(reference, popper, options, modifierOptions, state) {
  // compute reference element offsets
  var referenceOffsets = getReferenceOffsets(state, popper, reference, options.positionFixed);

  // compute auto placement, store placement inside the data object,
  // modifiers will be able to edit `placement` if needed
  // and refer to originalPlacement to know the original value
  var placement = computeAutoPlacement(options.placement, referenceOffsets, popper, reference, options.modifiers.flip.boundariesElement, options.modifiers.flip.padding);

  popper.setAttribute('x-placement', placement);

  // Apply `position` to popper before anything else because
  // without the position applied we can't guarantee correct computations
  setStyles(popper, { position: options.positionFixed ? 'fixed' : 'absolute' });

  return options;
}

/**
 * @function
 * @memberof Popper.Utils
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Boolean} shouldRound - If the offsets should be rounded at all
 * @returns {Object} The popper's position offsets rounded
 *
 * The tale of pixel-perfect positioning. It's still not 100% perfect, but as
 * good as it can be within reason.
 * Discussion here: https://github.com/FezVrasta/popper.js/pull/715
 *
 * Low DPI screens cause a popper to be blurry if not using full pixels (Safari
 * as well on High DPI screens).
 *
 * Firefox prefers no rounding for positioning and does not have blurriness on
 * high DPI screens.
 *
 * Only horizontal placement and left/right values need to be considered.
 */
function getRoundedOffsets(data, shouldRound) {
  var _data$offsets = data.offsets,
      popper = _data$offsets.popper,
      reference = _data$offsets.reference;
  var round = Math.round,
      floor = Math.floor;

  var noRound = function noRound(v) {
    return v;
  };

  var referenceWidth = round(reference.width);
  var popperWidth = round(popper.width);

  var isVertical = ['left', 'right'].indexOf(data.placement) !== -1;
  var isVariation = data.placement.indexOf('-') !== -1;
  var sameWidthParity = referenceWidth % 2 === popperWidth % 2;
  var bothOddWidth = referenceWidth % 2 === 1 && popperWidth % 2 === 1;

  var horizontalToInteger = !shouldRound ? noRound : isVertical || isVariation || sameWidthParity ? round : floor;
  var verticalToInteger = !shouldRound ? noRound : round;

  return {
    left: horizontalToInteger(bothOddWidth && !isVariation && shouldRound ? popper.left - 1 : popper.left),
    top: verticalToInteger(popper.top),
    bottom: verticalToInteger(popper.bottom),
    right: horizontalToInteger(popper.right)
  };
}

var isFirefox = isBrowser && /Firefox/i.test(navigator.userAgent);

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function computeStyle(data, options) {
  var x = options.x,
      y = options.y;
  var popper = data.offsets.popper;

  // Remove this legacy support in Popper.js v2

  var legacyGpuAccelerationOption = find(data.instance.modifiers, function (modifier) {
    return modifier.name === 'applyStyle';
  }).gpuAcceleration;
  if (legacyGpuAccelerationOption !== undefined) {
    console.warn('WARNING: `gpuAcceleration` option moved to `computeStyle` modifier and will not be supported in future versions of Popper.js!');
  }
  var gpuAcceleration = legacyGpuAccelerationOption !== undefined ? legacyGpuAccelerationOption : options.gpuAcceleration;

  var offsetParent = getOffsetParent(data.instance.popper);
  var offsetParentRect = getBoundingClientRect(offsetParent);

  // Styles
  var styles = {
    position: popper.position
  };

  var offsets = getRoundedOffsets(data, window.devicePixelRatio < 2 || !isFirefox);

  var sideA = x === 'bottom' ? 'top' : 'bottom';
  var sideB = y === 'right' ? 'left' : 'right';

  // if gpuAcceleration is set to `true` and transform is supported,
  //  we use `translate3d` to apply the position to the popper we
  // automatically use the supported prefixed version if needed
  var prefixedProperty = getSupportedPropertyName('transform');

  // now, let's make a step back and look at this code closely (wtf?)
  // If the content of the popper grows once it's been positioned, it
  // may happen that the popper gets misplaced because of the new content
  // overflowing its reference element
  // To avoid this problem, we provide two options (x and y), which allow
  // the consumer to define the offset origin.
  // If we position a popper on top of a reference element, we can set
  // `x` to `top` to make the popper grow towards its top instead of
  // its bottom.
  var left = void 0,
      top = void 0;
  if (sideA === 'bottom') {
    // when offsetParent is <html> the positioning is relative to the bottom of the screen (excluding the scrollbar)
    // and not the bottom of the html element
    if (offsetParent.nodeName === 'HTML') {
      top = -offsetParent.clientHeight + offsets.bottom;
    } else {
      top = -offsetParentRect.height + offsets.bottom;
    }
  } else {
    top = offsets.top;
  }
  if (sideB === 'right') {
    if (offsetParent.nodeName === 'HTML') {
      left = -offsetParent.clientWidth + offsets.right;
    } else {
      left = -offsetParentRect.width + offsets.right;
    }
  } else {
    left = offsets.left;
  }
  if (gpuAcceleration && prefixedProperty) {
    styles[prefixedProperty] = 'translate3d(' + left + 'px, ' + top + 'px, 0)';
    styles[sideA] = 0;
    styles[sideB] = 0;
    styles.willChange = 'transform';
  } else {
    // othwerise, we use the standard `top`, `left`, `bottom` and `right` properties
    var invertTop = sideA === 'bottom' ? -1 : 1;
    var invertLeft = sideB === 'right' ? -1 : 1;
    styles[sideA] = top * invertTop;
    styles[sideB] = left * invertLeft;
    styles.willChange = sideA + ', ' + sideB;
  }

  // Attributes
  var attributes = {
    'x-placement': data.placement
  };

  // Update `data` attributes, styles and arrowStyles
  data.attributes = _extends({}, attributes, data.attributes);
  data.styles = _extends({}, styles, data.styles);
  data.arrowStyles = _extends({}, data.offsets.arrow, data.arrowStyles);

  return data;
}

/**
 * Helper used to know if the given modifier depends from another one.<br />
 * It checks if the needed modifier is listed and enabled.
 * @method
 * @memberof Popper.Utils
 * @param {Array} modifiers - list of modifiers
 * @param {String} requestingName - name of requesting modifier
 * @param {String} requestedName - name of requested modifier
 * @returns {Boolean}
 */
function isModifierRequired(modifiers, requestingName, requestedName) {
  var requesting = find(modifiers, function (_ref) {
    var name = _ref.name;
    return name === requestingName;
  });

  var isRequired = !!requesting && modifiers.some(function (modifier) {
    return modifier.name === requestedName && modifier.enabled && modifier.order < requesting.order;
  });

  if (!isRequired) {
    var _requesting = '`' + requestingName + '`';
    var requested = '`' + requestedName + '`';
    console.warn(requested + ' modifier is required by ' + _requesting + ' modifier in order to work, be sure to include it before ' + _requesting + '!');
  }
  return isRequired;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function arrow(data, options) {
  var _data$offsets$arrow;

  // arrow depends on keepTogether in order to work
  if (!isModifierRequired(data.instance.modifiers, 'arrow', 'keepTogether')) {
    return data;
  }

  var arrowElement = options.element;

  // if arrowElement is a string, suppose it's a CSS selector
  if (typeof arrowElement === 'string') {
    arrowElement = data.instance.popper.querySelector(arrowElement);

    // if arrowElement is not found, don't run the modifier
    if (!arrowElement) {
      return data;
    }
  } else {
    // if the arrowElement isn't a query selector we must check that the
    // provided DOM node is child of its popper node
    if (!data.instance.popper.contains(arrowElement)) {
      console.warn('WARNING: `arrow.element` must be child of its popper element!');
      return data;
    }
  }

  var placement = data.placement.split('-')[0];
  var _data$offsets = data.offsets,
      popper = _data$offsets.popper,
      reference = _data$offsets.reference;

  var isVertical = ['left', 'right'].indexOf(placement) !== -1;

  var len = isVertical ? 'height' : 'width';
  var sideCapitalized = isVertical ? 'Top' : 'Left';
  var side = sideCapitalized.toLowerCase();
  var altSide = isVertical ? 'left' : 'top';
  var opSide = isVertical ? 'bottom' : 'right';
  var arrowElementSize = getOuterSizes(arrowElement)[len];

  //
  // extends keepTogether behavior making sure the popper and its
  // reference have enough pixels in conjunction
  //

  // top/left side
  if (reference[opSide] - arrowElementSize < popper[side]) {
    data.offsets.popper[side] -= popper[side] - (reference[opSide] - arrowElementSize);
  }
  // bottom/right side
  if (reference[side] + arrowElementSize > popper[opSide]) {
    data.offsets.popper[side] += reference[side] + arrowElementSize - popper[opSide];
  }
  data.offsets.popper = getClientRect(data.offsets.popper);

  // compute center of the popper
  var center = reference[side] + reference[len] / 2 - arrowElementSize / 2;

  // Compute the sideValue using the updated popper offsets
  // take popper margin in account because we don't have this info available
  var css = getStyleComputedProperty(data.instance.popper);
  var popperMarginSide = parseFloat(css['margin' + sideCapitalized], 10);
  var popperBorderSide = parseFloat(css['border' + sideCapitalized + 'Width'], 10);
  var sideValue = center - data.offsets.popper[side] - popperMarginSide - popperBorderSide;

  // prevent arrowElement from being placed not contiguously to its popper
  sideValue = Math.max(Math.min(popper[len] - arrowElementSize, sideValue), 0);

  data.arrowElement = arrowElement;
  data.offsets.arrow = (_data$offsets$arrow = {}, defineProperty(_data$offsets$arrow, side, Math.round(sideValue)), defineProperty(_data$offsets$arrow, altSide, ''), _data$offsets$arrow);

  return data;
}

/**
 * Get the opposite placement variation of the given one
 * @method
 * @memberof Popper.Utils
 * @argument {String} placement variation
 * @returns {String} flipped placement variation
 */
function getOppositeVariation(variation) {
  if (variation === 'end') {
    return 'start';
  } else if (variation === 'start') {
    return 'end';
  }
  return variation;
}

/**
 * List of accepted placements to use as values of the `placement` option.<br />
 * Valid placements are:
 * - `auto`
 * - `top`
 * - `right`
 * - `bottom`
 * - `left`
 *
 * Each placement can have a variation from this list:
 * - `-start`
 * - `-end`
 *
 * Variations are interpreted easily if you think of them as the left to right
 * written languages. Horizontally (`top` and `bottom`), `start` is left and `end`
 * is right.<br />
 * Vertically (`left` and `right`), `start` is top and `end` is bottom.
 *
 * Some valid examples are:
 * - `top-end` (on top of reference, right aligned)
 * - `right-start` (on right of reference, top aligned)
 * - `bottom` (on bottom, centered)
 * - `auto-end` (on the side with more space available, alignment depends by placement)
 *
 * @static
 * @type {Array}
 * @enum {String}
 * @readonly
 * @method placements
 * @memberof Popper
 */
var placements = ['auto-start', 'auto', 'auto-end', 'top-start', 'top', 'top-end', 'right-start', 'right', 'right-end', 'bottom-end', 'bottom', 'bottom-start', 'left-end', 'left', 'left-start'];

// Get rid of `auto` `auto-start` and `auto-end`
var validPlacements = placements.slice(3);

/**
 * Given an initial placement, returns all the subsequent placements
 * clockwise (or counter-clockwise).
 *
 * @method
 * @memberof Popper.Utils
 * @argument {String} placement - A valid placement (it accepts variations)
 * @argument {Boolean} counter - Set to true to walk the placements counterclockwise
 * @returns {Array} placements including their variations
 */
function clockwise(placement) {
  var counter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

  var index = validPlacements.indexOf(placement);
  var arr = validPlacements.slice(index + 1).concat(validPlacements.slice(0, index));
  return counter ? arr.reverse() : arr;
}

var BEHAVIORS = {
  FLIP: 'flip',
  CLOCKWISE: 'clockwise',
  COUNTERCLOCKWISE: 'counterclockwise'
};

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function flip(data, options) {
  // if `inner` modifier is enabled, we can't use the `flip` modifier
  if (isModifierEnabled(data.instance.modifiers, 'inner')) {
    return data;
  }

  if (data.flipped && data.placement === data.originalPlacement) {
    // seems like flip is trying to loop, probably there's not enough space on any of the flippable sides
    return data;
  }

  var boundaries = getBoundaries(data.instance.popper, data.instance.reference, options.padding, options.boundariesElement, data.positionFixed);

  var placement = data.placement.split('-')[0];
  var placementOpposite = getOppositePlacement(placement);
  var variation = data.placement.split('-')[1] || '';

  var flipOrder = [];

  switch (options.behavior) {
    case BEHAVIORS.FLIP:
      flipOrder = [placement, placementOpposite];
      break;
    case BEHAVIORS.CLOCKWISE:
      flipOrder = clockwise(placement);
      break;
    case BEHAVIORS.COUNTERCLOCKWISE:
      flipOrder = clockwise(placement, true);
      break;
    default:
      flipOrder = options.behavior;
  }

  flipOrder.forEach(function (step, index) {
    if (placement !== step || flipOrder.length === index + 1) {
      return data;
    }

    placement = data.placement.split('-')[0];
    placementOpposite = getOppositePlacement(placement);

    var popperOffsets = data.offsets.popper;
    var refOffsets = data.offsets.reference;

    // using floor because the reference offsets may contain decimals we are not going to consider here
    var floor = Math.floor;
    var overlapsRef = placement === 'left' && floor(popperOffsets.right) > floor(refOffsets.left) || placement === 'right' && floor(popperOffsets.left) < floor(refOffsets.right) || placement === 'top' && floor(popperOffsets.bottom) > floor(refOffsets.top) || placement === 'bottom' && floor(popperOffsets.top) < floor(refOffsets.bottom);

    var overflowsLeft = floor(popperOffsets.left) < floor(boundaries.left);
    var overflowsRight = floor(popperOffsets.right) > floor(boundaries.right);
    var overflowsTop = floor(popperOffsets.top) < floor(boundaries.top);
    var overflowsBottom = floor(popperOffsets.bottom) > floor(boundaries.bottom);

    var overflowsBoundaries = placement === 'left' && overflowsLeft || placement === 'right' && overflowsRight || placement === 'top' && overflowsTop || placement === 'bottom' && overflowsBottom;

    // flip the variation if required
    var isVertical = ['top', 'bottom'].indexOf(placement) !== -1;

    // flips variation if reference element overflows boundaries
    var flippedVariationByRef = !!options.flipVariations && (isVertical && variation === 'start' && overflowsLeft || isVertical && variation === 'end' && overflowsRight || !isVertical && variation === 'start' && overflowsTop || !isVertical && variation === 'end' && overflowsBottom);

    // flips variation if popper content overflows boundaries
    var flippedVariationByContent = !!options.flipVariationsByContent && (isVertical && variation === 'start' && overflowsRight || isVertical && variation === 'end' && overflowsLeft || !isVertical && variation === 'start' && overflowsBottom || !isVertical && variation === 'end' && overflowsTop);

    var flippedVariation = flippedVariationByRef || flippedVariationByContent;

    if (overlapsRef || overflowsBoundaries || flippedVariation) {
      // this boolean to detect any flip loop
      data.flipped = true;

      if (overlapsRef || overflowsBoundaries) {
        placement = flipOrder[index + 1];
      }

      if (flippedVariation) {
        variation = getOppositeVariation(variation);
      }

      data.placement = placement + (variation ? '-' + variation : '');

      // this object contains `position`, we want to preserve it along with
      // any additional property we may add in the future
      data.offsets.popper = _extends({}, data.offsets.popper, getPopperOffsets(data.instance.popper, data.offsets.reference, data.placement));

      data = runModifiers(data.instance.modifiers, data, 'flip');
    }
  });
  return data;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function keepTogether(data) {
  var _data$offsets = data.offsets,
      popper = _data$offsets.popper,
      reference = _data$offsets.reference;

  var placement = data.placement.split('-')[0];
  var floor = Math.floor;
  var isVertical = ['top', 'bottom'].indexOf(placement) !== -1;
  var side = isVertical ? 'right' : 'bottom';
  var opSide = isVertical ? 'left' : 'top';
  var measurement = isVertical ? 'width' : 'height';

  if (popper[side] < floor(reference[opSide])) {
    data.offsets.popper[opSide] = floor(reference[opSide]) - popper[measurement];
  }
  if (popper[opSide] > floor(reference[side])) {
    data.offsets.popper[opSide] = floor(reference[side]);
  }

  return data;
}

/**
 * Converts a string containing value + unit into a px value number
 * @function
 * @memberof {modifiers~offset}
 * @private
 * @argument {String} str - Value + unit string
 * @argument {String} measurement - `height` or `width`
 * @argument {Object} popperOffsets
 * @argument {Object} referenceOffsets
 * @returns {Number|String}
 * Value in pixels, or original string if no values were extracted
 */
function toValue(str, measurement, popperOffsets, referenceOffsets) {
  // separate value from unit
  var split = str.match(/((?:\-|\+)?\d*\.?\d*)(.*)/);
  var value = +split[1];
  var unit = split[2];

  // If it's not a number it's an operator, I guess
  if (!value) {
    return str;
  }

  if (unit.indexOf('%') === 0) {
    var element = void 0;
    switch (unit) {
      case '%p':
        element = popperOffsets;
        break;
      case '%':
      case '%r':
      default:
        element = referenceOffsets;
    }

    var rect = getClientRect(element);
    return rect[measurement] / 100 * value;
  } else if (unit === 'vh' || unit === 'vw') {
    // if is a vh or vw, we calculate the size based on the viewport
    var size = void 0;
    if (unit === 'vh') {
      size = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    } else {
      size = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    }
    return size / 100 * value;
  } else {
    // if is an explicit pixel unit, we get rid of the unit and keep the value
    // if is an implicit unit, it's px, and we return just the value
    return value;
  }
}

/**
 * Parse an `offset` string to extrapolate `x` and `y` numeric offsets.
 * @function
 * @memberof {modifiers~offset}
 * @private
 * @argument {String} offset
 * @argument {Object} popperOffsets
 * @argument {Object} referenceOffsets
 * @argument {String} basePlacement
 * @returns {Array} a two cells array with x and y offsets in numbers
 */
function parseOffset(offset, popperOffsets, referenceOffsets, basePlacement) {
  var offsets = [0, 0];

  // Use height if placement is left or right and index is 0 otherwise use width
  // in this way the first offset will use an axis and the second one
  // will use the other one
  var useHeight = ['right', 'left'].indexOf(basePlacement) !== -1;

  // Split the offset string to obtain a list of values and operands
  // The regex addresses values with the plus or minus sign in front (+10, -20, etc)
  var fragments = offset.split(/(\+|\-)/).map(function (frag) {
    return frag.trim();
  });

  // Detect if the offset string contains a pair of values or a single one
  // they could be separated by comma or space
  var divider = fragments.indexOf(find(fragments, function (frag) {
    return frag.search(/,|\s/) !== -1;
  }));

  if (fragments[divider] && fragments[divider].indexOf(',') === -1) {
    console.warn('Offsets separated by white space(s) are deprecated, use a comma (,) instead.');
  }

  // If divider is found, we divide the list of values and operands to divide
  // them by ofset X and Y.
  var splitRegex = /\s*,\s*|\s+/;
  var ops = divider !== -1 ? [fragments.slice(0, divider).concat([fragments[divider].split(splitRegex)[0]]), [fragments[divider].split(splitRegex)[1]].concat(fragments.slice(divider + 1))] : [fragments];

  // Convert the values with units to absolute pixels to allow our computations
  ops = ops.map(function (op, index) {
    // Most of the units rely on the orientation of the popper
    var measurement = (index === 1 ? !useHeight : useHeight) ? 'height' : 'width';
    var mergeWithPrevious = false;
    return op
    // This aggregates any `+` or `-` sign that aren't considered operators
    // e.g.: 10 + +5 => [10, +, +5]
    .reduce(function (a, b) {
      if (a[a.length - 1] === '' && ['+', '-'].indexOf(b) !== -1) {
        a[a.length - 1] = b;
        mergeWithPrevious = true;
        return a;
      } else if (mergeWithPrevious) {
        a[a.length - 1] += b;
        mergeWithPrevious = false;
        return a;
      } else {
        return a.concat(b);
      }
    }, [])
    // Here we convert the string values into number values (in px)
    .map(function (str) {
      return toValue(str, measurement, popperOffsets, referenceOffsets);
    });
  });

  // Loop trough the offsets arrays and execute the operations
  ops.forEach(function (op, index) {
    op.forEach(function (frag, index2) {
      if (isNumeric(frag)) {
        offsets[index] += frag * (op[index2 - 1] === '-' ? -1 : 1);
      }
    });
  });
  return offsets;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @argument {Number|String} options.offset=0
 * The offset value as described in the modifier description
 * @returns {Object} The data object, properly modified
 */
function offset(data, _ref) {
  var offset = _ref.offset;
  var placement = data.placement,
      _data$offsets = data.offsets,
      popper = _data$offsets.popper,
      reference = _data$offsets.reference;

  var basePlacement = placement.split('-')[0];

  var offsets = void 0;
  if (isNumeric(+offset)) {
    offsets = [+offset, 0];
  } else {
    offsets = parseOffset(offset, popper, reference, basePlacement);
  }

  if (basePlacement === 'left') {
    popper.top += offsets[0];
    popper.left -= offsets[1];
  } else if (basePlacement === 'right') {
    popper.top += offsets[0];
    popper.left += offsets[1];
  } else if (basePlacement === 'top') {
    popper.left += offsets[0];
    popper.top -= offsets[1];
  } else if (basePlacement === 'bottom') {
    popper.left += offsets[0];
    popper.top += offsets[1];
  }

  data.popper = popper;
  return data;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function preventOverflow(data, options) {
  var boundariesElement = options.boundariesElement || getOffsetParent(data.instance.popper);

  // If offsetParent is the reference element, we really want to
  // go one step up and use the next offsetParent as reference to
  // avoid to make this modifier completely useless and look like broken
  if (data.instance.reference === boundariesElement) {
    boundariesElement = getOffsetParent(boundariesElement);
  }

  // NOTE: DOM access here
  // resets the popper's position so that the document size can be calculated excluding
  // the size of the popper element itself
  var transformProp = getSupportedPropertyName('transform');
  var popperStyles = data.instance.popper.style; // assignment to help minification
  var top = popperStyles.top,
      left = popperStyles.left,
      transform = popperStyles[transformProp];

  popperStyles.top = '';
  popperStyles.left = '';
  popperStyles[transformProp] = '';

  var boundaries = getBoundaries(data.instance.popper, data.instance.reference, options.padding, boundariesElement, data.positionFixed);

  // NOTE: DOM access here
  // restores the original style properties after the offsets have been computed
  popperStyles.top = top;
  popperStyles.left = left;
  popperStyles[transformProp] = transform;

  options.boundaries = boundaries;

  var order = options.priority;
  var popper = data.offsets.popper;

  var check = {
    primary: function primary(placement) {
      var value = popper[placement];
      if (popper[placement] < boundaries[placement] && !options.escapeWithReference) {
        value = Math.max(popper[placement], boundaries[placement]);
      }
      return defineProperty({}, placement, value);
    },
    secondary: function secondary(placement) {
      var mainSide = placement === 'right' ? 'left' : 'top';
      var value = popper[mainSide];
      if (popper[placement] > boundaries[placement] && !options.escapeWithReference) {
        value = Math.min(popper[mainSide], boundaries[placement] - (placement === 'right' ? popper.width : popper.height));
      }
      return defineProperty({}, mainSide, value);
    }
  };

  order.forEach(function (placement) {
    var side = ['left', 'top'].indexOf(placement) !== -1 ? 'primary' : 'secondary';
    popper = _extends({}, popper, check[side](placement));
  });

  data.offsets.popper = popper;

  return data;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function shift(data) {
  var placement = data.placement;
  var basePlacement = placement.split('-')[0];
  var shiftvariation = placement.split('-')[1];

  // if shift shiftvariation is specified, run the modifier
  if (shiftvariation) {
    var _data$offsets = data.offsets,
        reference = _data$offsets.reference,
        popper = _data$offsets.popper;

    var isVertical = ['bottom', 'top'].indexOf(basePlacement) !== -1;
    var side = isVertical ? 'left' : 'top';
    var measurement = isVertical ? 'width' : 'height';

    var shiftOffsets = {
      start: defineProperty({}, side, reference[side]),
      end: defineProperty({}, side, reference[side] + reference[measurement] - popper[measurement])
    };

    data.offsets.popper = _extends({}, popper, shiftOffsets[shiftvariation]);
  }

  return data;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by update method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function hide(data) {
  if (!isModifierRequired(data.instance.modifiers, 'hide', 'preventOverflow')) {
    return data;
  }

  var refRect = data.offsets.reference;
  var bound = find(data.instance.modifiers, function (modifier) {
    return modifier.name === 'preventOverflow';
  }).boundaries;

  if (refRect.bottom < bound.top || refRect.left > bound.right || refRect.top > bound.bottom || refRect.right < bound.left) {
    // Avoid unnecessary DOM access if visibility hasn't changed
    if (data.hide === true) {
      return data;
    }

    data.hide = true;
    data.attributes['x-out-of-boundaries'] = '';
  } else {
    // Avoid unnecessary DOM access if visibility hasn't changed
    if (data.hide === false) {
      return data;
    }

    data.hide = false;
    data.attributes['x-out-of-boundaries'] = false;
  }

  return data;
}

/**
 * @function
 * @memberof Modifiers
 * @argument {Object} data - The data object generated by `update` method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {Object} The data object, properly modified
 */
function inner(data) {
  var placement = data.placement;
  var basePlacement = placement.split('-')[0];
  var _data$offsets = data.offsets,
      popper = _data$offsets.popper,
      reference = _data$offsets.reference;

  var isHoriz = ['left', 'right'].indexOf(basePlacement) !== -1;

  var subtractLength = ['top', 'left'].indexOf(basePlacement) === -1;

  popper[isHoriz ? 'left' : 'top'] = reference[basePlacement] - (subtractLength ? popper[isHoriz ? 'width' : 'height'] : 0);

  data.placement = getOppositePlacement(placement);
  data.offsets.popper = getClientRect(popper);

  return data;
}

/**
 * Modifier function, each modifier can have a function of this type assigned
 * to its `fn` property.<br />
 * These functions will be called on each update, this means that you must
 * make sure they are performant enough to avoid performance bottlenecks.
 *
 * @function ModifierFn
 * @argument {dataObject} data - The data object generated by `update` method
 * @argument {Object} options - Modifiers configuration and options
 * @returns {dataObject} The data object, properly modified
 */

/**
 * Modifiers are plugins used to alter the behavior of your poppers.<br />
 * Popper.js uses a set of 9 modifiers to provide all the basic functionalities
 * needed by the library.
 *
 * Usually you don't want to override the `order`, `fn` and `onLoad` props.
 * All the other properties are configurations that could be tweaked.
 * @namespace modifiers
 */
var modifiers = {
  /**
   * Modifier used to shift the popper on the start or end of its reference
   * element.<br />
   * It will read the variation of the `placement` property.<br />
   * It can be one either `-end` or `-start`.
   * @memberof modifiers
   * @inner
   */
  shift: {
    /** @prop {number} order=100 - Index used to define the order of execution */
    order: 100,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: shift
  },

  /**
   * The `offset` modifier can shift your popper on both its axis.
   *
   * It accepts the following units:
   * - `px` or unit-less, interpreted as pixels
   * - `%` or `%r`, percentage relative to the length of the reference element
   * - `%p`, percentage relative to the length of the popper element
   * - `vw`, CSS viewport width unit
   * - `vh`, CSS viewport height unit
   *
   * For length is intended the main axis relative to the placement of the popper.<br />
   * This means that if the placement is `top` or `bottom`, the length will be the
   * `width`. In case of `left` or `right`, it will be the `height`.
   *
   * You can provide a single value (as `Number` or `String`), or a pair of values
   * as `String` divided by a comma or one (or more) white spaces.<br />
   * The latter is a deprecated method because it leads to confusion and will be
   * removed in v2.<br />
   * Additionally, it accepts additions and subtractions between different units.
   * Note that multiplications and divisions aren't supported.
   *
   * Valid examples are:
   * ```
   * 10
   * '10%'
   * '10, 10'
   * '10%, 10'
   * '10 + 10%'
   * '10 - 5vh + 3%'
   * '-10px + 5vh, 5px - 6%'
   * ```
   * > **NB**: If you desire to apply offsets to your poppers in a way that may make them overlap
   * > with their reference element, unfortunately, you will have to disable the `flip` modifier.
   * > You can read more on this at this [issue](https://github.com/FezVrasta/popper.js/issues/373).
   *
   * @memberof modifiers
   * @inner
   */
  offset: {
    /** @prop {number} order=200 - Index used to define the order of execution */
    order: 200,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: offset,
    /** @prop {Number|String} offset=0
     * The offset value as described in the modifier description
     */
    offset: 0
  },

  /**
   * Modifier used to prevent the popper from being positioned outside the boundary.
   *
   * A scenario exists where the reference itself is not within the boundaries.<br />
   * We can say it has "escaped the boundaries" — or just "escaped".<br />
   * In this case we need to decide whether the popper should either:
   *
   * - detach from the reference and remain "trapped" in the boundaries, or
   * - if it should ignore the boundary and "escape with its reference"
   *
   * When `escapeWithReference` is set to`true` and reference is completely
   * outside its boundaries, the popper will overflow (or completely leave)
   * the boundaries in order to remain attached to the edge of the reference.
   *
   * @memberof modifiers
   * @inner
   */
  preventOverflow: {
    /** @prop {number} order=300 - Index used to define the order of execution */
    order: 300,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: preventOverflow,
    /**
     * @prop {Array} [priority=['left','right','top','bottom']]
     * Popper will try to prevent overflow following these priorities by default,
     * then, it could overflow on the left and on top of the `boundariesElement`
     */
    priority: ['left', 'right', 'top', 'bottom'],
    /**
     * @prop {number} padding=5
     * Amount of pixel used to define a minimum distance between the boundaries
     * and the popper. This makes sure the popper always has a little padding
     * between the edges of its container
     */
    padding: 5,
    /**
     * @prop {String|HTMLElement} boundariesElement='scrollParent'
     * Boundaries used by the modifier. Can be `scrollParent`, `window`,
     * `viewport` or any DOM element.
     */
    boundariesElement: 'scrollParent'
  },

  /**
   * Modifier used to make sure the reference and its popper stay near each other
   * without leaving any gap between the two. Especially useful when the arrow is
   * enabled and you want to ensure that it points to its reference element.
   * It cares only about the first axis. You can still have poppers with margin
   * between the popper and its reference element.
   * @memberof modifiers
   * @inner
   */
  keepTogether: {
    /** @prop {number} order=400 - Index used to define the order of execution */
    order: 400,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: keepTogether
  },

  /**
   * This modifier is used to move the `arrowElement` of the popper to make
   * sure it is positioned between the reference element and its popper element.
   * It will read the outer size of the `arrowElement` node to detect how many
   * pixels of conjunction are needed.
   *
   * It has no effect if no `arrowElement` is provided.
   * @memberof modifiers
   * @inner
   */
  arrow: {
    /** @prop {number} order=500 - Index used to define the order of execution */
    order: 500,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: arrow,
    /** @prop {String|HTMLElement} element='[x-arrow]' - Selector or node used as arrow */
    element: '[x-arrow]'
  },

  /**
   * Modifier used to flip the popper's placement when it starts to overlap its
   * reference element.
   *
   * Requires the `preventOverflow` modifier before it in order to work.
   *
   * **NOTE:** this modifier will interrupt the current update cycle and will
   * restart it if it detects the need to flip the placement.
   * @memberof modifiers
   * @inner
   */
  flip: {
    /** @prop {number} order=600 - Index used to define the order of execution */
    order: 600,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: flip,
    /**
     * @prop {String|Array} behavior='flip'
     * The behavior used to change the popper's placement. It can be one of
     * `flip`, `clockwise`, `counterclockwise` or an array with a list of valid
     * placements (with optional variations)
     */
    behavior: 'flip',
    /**
     * @prop {number} padding=5
     * The popper will flip if it hits the edges of the `boundariesElement`
     */
    padding: 5,
    /**
     * @prop {String|HTMLElement} boundariesElement='viewport'
     * The element which will define the boundaries of the popper position.
     * The popper will never be placed outside of the defined boundaries
     * (except if `keepTogether` is enabled)
     */
    boundariesElement: 'viewport',
    /**
     * @prop {Boolean} flipVariations=false
     * The popper will switch placement variation between `-start` and `-end` when
     * the reference element overlaps its boundaries.
     *
     * The original placement should have a set variation.
     */
    flipVariations: false,
    /**
     * @prop {Boolean} flipVariationsByContent=false
     * The popper will switch placement variation between `-start` and `-end` when
     * the popper element overlaps its reference boundaries.
     *
     * The original placement should have a set variation.
     */
    flipVariationsByContent: false
  },

  /**
   * Modifier used to make the popper flow toward the inner of the reference element.
   * By default, when this modifier is disabled, the popper will be placed outside
   * the reference element.
   * @memberof modifiers
   * @inner
   */
  inner: {
    /** @prop {number} order=700 - Index used to define the order of execution */
    order: 700,
    /** @prop {Boolean} enabled=false - Whether the modifier is enabled or not */
    enabled: false,
    /** @prop {ModifierFn} */
    fn: inner
  },

  /**
   * Modifier used to hide the popper when its reference element is outside of the
   * popper boundaries. It will set a `x-out-of-boundaries` attribute which can
   * be used to hide with a CSS selector the popper when its reference is
   * out of boundaries.
   *
   * Requires the `preventOverflow` modifier before it in order to work.
   * @memberof modifiers
   * @inner
   */
  hide: {
    /** @prop {number} order=800 - Index used to define the order of execution */
    order: 800,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: hide
  },

  /**
   * Computes the style that will be applied to the popper element to gets
   * properly positioned.
   *
   * Note that this modifier will not touch the DOM, it just prepares the styles
   * so that `applyStyle` modifier can apply it. This separation is useful
   * in case you need to replace `applyStyle` with a custom implementation.
   *
   * This modifier has `850` as `order` value to maintain backward compatibility
   * with previous versions of Popper.js. Expect the modifiers ordering method
   * to change in future major versions of the library.
   *
   * @memberof modifiers
   * @inner
   */
  computeStyle: {
    /** @prop {number} order=850 - Index used to define the order of execution */
    order: 850,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: computeStyle,
    /**
     * @prop {Boolean} gpuAcceleration=true
     * If true, it uses the CSS 3D transformation to position the popper.
     * Otherwise, it will use the `top` and `left` properties
     */
    gpuAcceleration: true,
    /**
     * @prop {string} [x='bottom']
     * Where to anchor the X axis (`bottom` or `top`). AKA X offset origin.
     * Change this if your popper should grow in a direction different from `bottom`
     */
    x: 'bottom',
    /**
     * @prop {string} [x='left']
     * Where to anchor the Y axis (`left` or `right`). AKA Y offset origin.
     * Change this if your popper should grow in a direction different from `right`
     */
    y: 'right'
  },

  /**
   * Applies the computed styles to the popper element.
   *
   * All the DOM manipulations are limited to this modifier. This is useful in case
   * you want to integrate Popper.js inside a framework or view library and you
   * want to delegate all the DOM manipulations to it.
   *
   * Note that if you disable this modifier, you must make sure the popper element
   * has its position set to `absolute` before Popper.js can do its work!
   *
   * Just disable this modifier and define your own to achieve the desired effect.
   *
   * @memberof modifiers
   * @inner
   */
  applyStyle: {
    /** @prop {number} order=900 - Index used to define the order of execution */
    order: 900,
    /** @prop {Boolean} enabled=true - Whether the modifier is enabled or not */
    enabled: true,
    /** @prop {ModifierFn} */
    fn: applyStyle,
    /** @prop {Function} */
    onLoad: applyStyleOnLoad,
    /**
     * @deprecated since version 1.10.0, the property moved to `computeStyle` modifier
     * @prop {Boolean} gpuAcceleration=true
     * If true, it uses the CSS 3D transformation to position the popper.
     * Otherwise, it will use the `top` and `left` properties
     */
    gpuAcceleration: undefined
  }
};

/**
 * The `dataObject` is an object containing all the information used by Popper.js.
 * This object is passed to modifiers and to the `onCreate` and `onUpdate` callbacks.
 * @name dataObject
 * @property {Object} data.instance The Popper.js instance
 * @property {String} data.placement Placement applied to popper
 * @property {String} data.originalPlacement Placement originally defined on init
 * @property {Boolean} data.flipped True if popper has been flipped by flip modifier
 * @property {Boolean} data.hide True if the reference element is out of boundaries, useful to know when to hide the popper
 * @property {HTMLElement} data.arrowElement Node used as arrow by arrow modifier
 * @property {Object} data.styles Any CSS property defined here will be applied to the popper. It expects the JavaScript nomenclature (eg. `marginBottom`)
 * @property {Object} data.arrowStyles Any CSS property defined here will be applied to the popper arrow. It expects the JavaScript nomenclature (eg. `marginBottom`)
 * @property {Object} data.boundaries Offsets of the popper boundaries
 * @property {Object} data.offsets The measurements of popper, reference and arrow elements
 * @property {Object} data.offsets.popper `top`, `left`, `width`, `height` values
 * @property {Object} data.offsets.reference `top`, `left`, `width`, `height` values
 * @property {Object} data.offsets.arrow] `top` and `left` offsets, only one of them will be different from 0
 */

/**
 * Default options provided to Popper.js constructor.<br />
 * These can be overridden using the `options` argument of Popper.js.<br />
 * To override an option, simply pass an object with the same
 * structure of the `options` object, as the 3rd argument. For example:
 * ```
 * new Popper(ref, pop, {
 *   modifiers: {
 *     preventOverflow: { enabled: false }
 *   }
 * })
 * ```
 * @type {Object}
 * @static
 * @memberof Popper
 */
var Defaults = {
  /**
   * Popper's placement.
   * @prop {Popper.placements} placement='bottom'
   */
  placement: 'bottom',

  /**
   * Set this to true if you want popper to position it self in 'fixed' mode
   * @prop {Boolean} positionFixed=false
   */
  positionFixed: false,

  /**
   * Whether events (resize, scroll) are initially enabled.
   * @prop {Boolean} eventsEnabled=true
   */
  eventsEnabled: true,

  /**
   * Set to true if you want to automatically remove the popper when
   * you call the `destroy` method.
   * @prop {Boolean} removeOnDestroy=false
   */
  removeOnDestroy: false,

  /**
   * Callback called when the popper is created.<br />
   * By default, it is set to no-op.<br />
   * Access Popper.js instance with `data.instance`.
   * @prop {onCreate}
   */
  onCreate: function onCreate() {},

  /**
   * Callback called when the popper is updated. This callback is not called
   * on the initialization/creation of the popper, but only on subsequent
   * updates.<br />
   * By default, it is set to no-op.<br />
   * Access Popper.js instance with `data.instance`.
   * @prop {onUpdate}
   */
  onUpdate: function onUpdate() {},

  /**
   * List of modifiers used to modify the offsets before they are applied to the popper.
   * They provide most of the functionalities of Popper.js.
   * @prop {modifiers}
   */
  modifiers: modifiers
};

/**
 * @callback onCreate
 * @param {dataObject} data
 */

/**
 * @callback onUpdate
 * @param {dataObject} data
 */

// Utils
// Methods
var Popper = function () {
  /**
   * Creates a new Popper.js instance.
   * @class Popper
   * @param {Element|referenceObject} reference - The reference element used to position the popper
   * @param {Element} popper - The HTML / XML element used as the popper
   * @param {Object} options - Your custom options to override the ones defined in [Defaults](#defaults)
   * @return {Object} instance - The generated Popper.js instance
   */
  function Popper(reference, popper) {
    var _this = this;

    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
    classCallCheck(this, Popper);

    this.scheduleUpdate = function () {
      return requestAnimationFrame(_this.update);
    };

    // make update() debounced, so that it only runs at most once-per-tick
    this.update = debounce(this.update.bind(this));

    // with {} we create a new object with the options inside it
    this.options = _extends({}, Popper.Defaults, options);

    // init state
    this.state = {
      isDestroyed: false,
      isCreated: false,
      scrollParents: []
    };

    // get reference and popper elements (allow jQuery wrappers)
    this.reference = reference && reference.jquery ? reference[0] : reference;
    this.popper = popper && popper.jquery ? popper[0] : popper;

    // Deep merge modifiers options
    this.options.modifiers = {};
    Object.keys(_extends({}, Popper.Defaults.modifiers, options.modifiers)).forEach(function (name) {
      _this.options.modifiers[name] = _extends({}, Popper.Defaults.modifiers[name] || {}, options.modifiers ? options.modifiers[name] : {});
    });

    // Refactoring modifiers' list (Object => Array)
    this.modifiers = Object.keys(this.options.modifiers).map(function (name) {
      return _extends({
        name: name
      }, _this.options.modifiers[name]);
    })
    // sort the modifiers by order
    .sort(function (a, b) {
      return a.order - b.order;
    });

    // modifiers have the ability to execute arbitrary code when Popper.js get inited
    // such code is executed in the same order of its modifier
    // they could add new properties to their options configuration
    // BE AWARE: don't add options to `options.modifiers.name` but to `modifierOptions`!
    this.modifiers.forEach(function (modifierOptions) {
      if (modifierOptions.enabled && isFunction(modifierOptions.onLoad)) {
        modifierOptions.onLoad(_this.reference, _this.popper, _this.options, modifierOptions, _this.state);
      }
    });

    // fire the first update to position the popper in the right place
    this.update();

    var eventsEnabled = this.options.eventsEnabled;
    if (eventsEnabled) {
      // setup event listeners, they will take care of update the position in specific situations
      this.enableEventListeners();
    }

    this.state.eventsEnabled = eventsEnabled;
  }

  // We can't use class properties because they don't get listed in the
  // class prototype and break stuff like Sinon stubs


  createClass(Popper, [{
    key: 'update',
    value: function update$$1() {
      return update$1.call(this);
    }
  }, {
    key: 'destroy',
    value: function destroy$$1() {
      return destroy.call(this);
    }
  }, {
    key: 'enableEventListeners',
    value: function enableEventListeners$$1() {
      return enableEventListeners.call(this);
    }
  }, {
    key: 'disableEventListeners',
    value: function disableEventListeners$$1() {
      return disableEventListeners.call(this);
    }

    /**
     * Schedules an update. It will run on the next UI update available.
     * @method scheduleUpdate
     * @memberof Popper
     */


    /**
     * Collection of utilities useful when writing custom modifiers.
     * Starting from version 1.7, this method is available only if you
     * include `popper-utils.js` before `popper.js`.
     *
     * **DEPRECATION**: This way to access PopperUtils is deprecated
     * and will be removed in v2! Use the PopperUtils module directly instead.
     * Due to the high instability of the methods contained in Utils, we can't
     * guarantee them to follow semver. Use them at your own risk!
     * @static
     * @private
     * @type {Object}
     * @deprecated since version 1.8
     * @member Utils
     * @memberof Popper
     */

  }]);
  return Popper;
}();

/**
 * The `referenceObject` is an object that provides an interface compatible with Popper.js
 * and lets you use it as replacement of a real DOM node.<br />
 * You can use this method to position a popper relatively to a set of coordinates
 * in case you don't have a DOM node to use as reference.
 *
 * ```
 * new Popper(referenceObject, popperNode);
 * ```
 *
 * NB: This feature isn't supported in Internet Explorer 10.
 * @name referenceObject
 * @property {Function} data.getBoundingClientRect
 * A function that returns a set of coordinates compatible with the native `getBoundingClientRect` method.
 * @property {number} data.clientWidth
 * An ES6 getter that will return the width of the virtual reference element.
 * @property {number} data.clientHeight
 * An ES6 getter that will return the height of the virtual reference element.
 */


Popper.Utils = (typeof window !== 'undefined' ? window : global).PopperUtils;
Popper.placements = placements;
Popper.Defaults = Defaults;

/* node_modules/svelte-click-outside/src/index.svelte generated by Svelte v3.8.1 */

function create_fragment$1(ctx) {
	var t, div, current;

	document.body.addEventListener("click", ctx.onClickOutside);

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			t = space();
			div = element("div");

			if (default_slot) default_slot.c();
		},

		l(nodes) {
			if (default_slot) default_slot.l(div_nodes);
		},

		m(target, anchor) {
			insert(target, t, anchor);
			insert(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			ctx.div_binding(div);
			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
			document.body.removeEventListener("click", ctx.onClickOutside);

			if (detaching) {
				detach(t);
				detach(div);
			}

			if (default_slot) default_slot.d(detaching);
			ctx.div_binding(null);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { exclude = [] } = $$props;

  let child;

  const dispatch = createEventDispatcher();

  function isExcluded(target) {
    var parent = target;

    while (parent) {
      if (exclude.indexOf(parent) >= 0 || parent === child) {
        return true;
      }

      parent = parent.parentNode;
    }

    return false;
  }

  function onClickOutside(event) {
    if (!isExcluded(event.target)) {
      dispatch('clickoutside');
    }
  }

	let { $$slots = {}, $$scope } = $$props;

	function div_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('child', child = $$value);
		});
	}

	$$self.$set = $$props => {
		if ('exclude' in $$props) $$invalidate('exclude', exclude = $$props.exclude);
		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
	};

	return {
		exclude,
		child,
		onClickOutside,
		div_binding,
		$$slots,
		$$scope
	};
}

class Index extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["exclude"]);
	}
}

let id = 1;

function getId() {
  return `svelte-tabs-${id++}`;
}

const subscriber_queue = [];
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}

/* node_modules/svelte-tabs/src/Tabs.svelte generated by Svelte v3.8.1 */

function create_fragment$2(ctx) {
	var div, current, dispose;

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			div = element("div");

			if (default_slot) default_slot.c();

			attr(div, "class", "svelte-tabs");
			dispose = listen(div, "keydown", ctx.handleKeyDown);
		},

		l(nodes) {
			if (default_slot) default_slot.l(div_nodes);
		},

		m(target, anchor) {
			insert(target, div, anchor);

			if (default_slot) {
				default_slot.m(div, null);
			}

			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			if (default_slot) default_slot.d(detaching);
			dispose();
		}
	};
}

const TABS = {};

function removeAndUpdateSelected(arr, item, selectedStore) {
  const index = arr.indexOf(item);
  arr.splice(index, 1);
  selectedStore.update(selected => selected === item ? (arr[index] || arr[arr.length - 1]) : selected);
}

function registerItem(arr, item, selectedStore) {
  arr.push(item);
  selectedStore.update(selected => selected || item);
  onDestroy(() => removeAndUpdateSelected(arr, item, selectedStore));
}

function instance$2($$self, $$props, $$invalidate) {
	let $selectedTab;

	

  let { initialSelectedIndex = 0 } = $$props;

  const tabElements = [];
  const tabs = [];
  const panels = [];

  const controls = writable({});
  const labeledBy = writable({});

  const selectedTab = writable(null); component_subscribe($$self, selectedTab, $$value => { $selectedTab = $$value; $$invalidate('$selectedTab', $selectedTab); });
  const selectedPanel = writable(null);

  function selectTab(tab) {
    const index = tabs.indexOf(tab);
    selectedTab.set(tab);
    selectedPanel.set(panels[index]);
  }

  setContext(TABS, {
    registerTab(tab) {
      registerItem(tabs, tab, selectedTab);
    },

    registerTabElement(tabElement) {
      tabElements.push(tabElement);
    },

    registerPanel(panel) {
      registerItem(panels, panel, selectedPanel);
    },

    selectTab,

    selectedTab,
    selectedPanel,

    controls,
    labeledBy
  });

  onMount(() => {
    selectTab(tabs[initialSelectedIndex]);
  });

  afterUpdate(() => {
    for (let i = 0; i < tabs.length; i++) {
      controls.update(controlsData => ({...controlsData, [tabs[i].id]: panels[i].id}));
      labeledBy.update(labeledByData => ({...labeledByData, [panels[i].id]: tabs[i].id}));
    }
  });

  async function handleKeyDown(event) {
    if (event.target.classList.contains('svelte-tabs__tab')) {
      let selectedIndex = tabs.indexOf($selectedTab);

      switch (event.key) {
        case 'ArrowRight':
          selectedIndex += 1;
          if (selectedIndex > tabs.length - 1) {
            selectedIndex = 0;
          }
          selectTab(tabs[selectedIndex]);
          tabElements[selectedIndex].focus();
          break;

        case 'ArrowLeft':
          selectedIndex -= 1;
          if (selectedIndex < 0) {
            selectedIndex = tabs.length - 1;
          }
          selectTab(tabs[selectedIndex]);
          tabElements[selectedIndex].focus();
      }
    }
  }

	let { $$slots = {}, $$scope } = $$props;

	$$self.$set = $$props => {
		if ('initialSelectedIndex' in $$props) $$invalidate('initialSelectedIndex', initialSelectedIndex = $$props.initialSelectedIndex);
		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
	};

	return {
		initialSelectedIndex,
		selectedTab,
		handleKeyDown,
		$$slots,
		$$scope
	};
}

class Tabs extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["initialSelectedIndex"]);
	}
}

/* node_modules/svelte-tabs/src/Tab.svelte generated by Svelte v3.8.1 */

function add_css$1() {
	var style = element("style");
	style.id = 'svelte-1fbofsd-style';
	style.textContent = ".svelte-tabs__tab.svelte-1fbofsd{border:none;border-bottom:2px solid transparent;color:#000000;cursor:pointer;list-style:none;display:inline-block;padding:0.5em 0.75em}.svelte-tabs__tab.svelte-1fbofsd:focus{outline:thin dotted}.svelte-tabs__selected.svelte-1fbofsd{border-bottom:2px solid #4F81E5;color:#4F81E5}";
	append(document.head, style);
}

function create_fragment$3(ctx) {
	var li, li_id_value, li_aria_controls_value, li_tabindex_value, current, dispose;

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			li = element("li");

			if (default_slot) default_slot.c();

			attr(li, "role", "tab");
			attr(li, "id", li_id_value = ctx.tab.id);
			attr(li, "aria-controls", li_aria_controls_value = ctx.$controls[ctx.tab.id]);
			attr(li, "aria-selected", ctx.isSelected);
			attr(li, "tabindex", li_tabindex_value = ctx.isSelected ? 0 : -1);
			attr(li, "class", "svelte-tabs__tab svelte-1fbofsd");
			toggle_class(li, "svelte-tabs__selected", ctx.isSelected);
			dispose = listen(li, "click", ctx.click_handler);
		},

		l(nodes) {
			if (default_slot) default_slot.l(li_nodes);
		},

		m(target, anchor) {
			insert(target, li, anchor);

			if (default_slot) {
				default_slot.m(li, null);
			}

			ctx.li_binding(li);
			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}

			if ((!current || changed.$controls) && li_aria_controls_value !== (li_aria_controls_value = ctx.$controls[ctx.tab.id])) {
				attr(li, "aria-controls", li_aria_controls_value);
			}

			if (!current || changed.isSelected) {
				attr(li, "aria-selected", ctx.isSelected);
			}

			if ((!current || changed.isSelected) && li_tabindex_value !== (li_tabindex_value = ctx.isSelected ? 0 : -1)) {
				attr(li, "tabindex", li_tabindex_value);
			}

			if (changed.isSelected) {
				toggle_class(li, "svelte-tabs__selected", ctx.isSelected);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(li);
			}

			if (default_slot) default_slot.d(detaching);
			ctx.li_binding(null);
			dispose();
		}
	};
}

function instance$3($$self, $$props, $$invalidate) {
	let $selectedTab, $controls;

	

  let tabEl;

  const tab = {
    id: getId()
  };
  const { registerTab, registerTabElement, selectTab, selectedTab, controls } = getContext(TABS); component_subscribe($$self, selectedTab, $$value => { $selectedTab = $$value; $$invalidate('$selectedTab', $selectedTab); }); component_subscribe($$self, controls, $$value => { $controls = $$value; $$invalidate('$controls', $controls); });

  let isSelected;

  registerTab(tab);

  onMount(async () => {
    await tick();
    registerTabElement(tabEl);
  });

	let { $$slots = {}, $$scope } = $$props;

	function li_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('tabEl', tabEl = $$value);
		});
	}

	function click_handler() {
		return selectTab(tab);
	}

	$$self.$set = $$props => {
		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
	};

	$$self.$$.update = ($$dirty = { $selectedTab: 1 }) => {
		if ($$dirty.$selectedTab) { $$invalidate('isSelected', isSelected = $selectedTab === tab); }
	};

	return {
		tabEl,
		tab,
		selectTab,
		selectedTab,
		controls,
		isSelected,
		$controls,
		li_binding,
		click_handler,
		$$slots,
		$$scope
	};
}

class Tab extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-1fbofsd-style")) add_css$1();
		init(this, options, instance$3, create_fragment$3, safe_not_equal, []);
	}
}

/* node_modules/svelte-tabs/src/TabList.svelte generated by Svelte v3.8.1 */

function add_css$2() {
	var style = element("style");
	style.id = 'svelte-12yby2a-style';
	style.textContent = ".svelte-tabs__tab-list.svelte-12yby2a{border-bottom:1px solid #CCCCCC;margin:0;padding:0}";
	append(document.head, style);
}

function create_fragment$4(ctx) {
	var ul, current;

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			ul = element("ul");

			if (default_slot) default_slot.c();

			attr(ul, "role", "tablist");
			attr(ul, "class", "svelte-tabs__tab-list svelte-12yby2a");
		},

		l(nodes) {
			if (default_slot) default_slot.l(ul_nodes);
		},

		m(target, anchor) {
			insert(target, ul, anchor);

			if (default_slot) {
				default_slot.m(ul, null);
			}

			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(ul);
			}

			if (default_slot) default_slot.d(detaching);
		}
	};
}

function instance$4($$self, $$props, $$invalidate) {
	let { $$slots = {}, $$scope } = $$props;

	$$self.$set = $$props => {
		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
	};

	return { $$slots, $$scope };
}

class TabList extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-12yby2a-style")) add_css$2();
		init(this, options, instance$4, create_fragment$4, safe_not_equal, []);
	}
}

/* node_modules/svelte-tabs/src/TabPanel.svelte generated by Svelte v3.8.1 */

function add_css$3() {
	var style = element("style");
	style.id = 'svelte-epfyet-style';
	style.textContent = ".svelte-tabs__tab-panel.svelte-epfyet{margin-top:0.5em}";
	append(document.head, style);
}

// (26:2) {#if $selectedPanel === panel}
function create_if_block(ctx) {
	var current;

	const default_slot_template = ctx.$$slots.default;
	const default_slot = create_slot(default_slot_template, ctx, null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},

		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},

		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},

		p(changed, ctx) {
			if (default_slot && default_slot.p && changed.$$scope) {
				default_slot.p(
					get_slot_changes(default_slot_template, ctx, changed, null),
					get_slot_context(default_slot_template, ctx, null)
				);
			}
		},

		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},

		o(local) {
			transition_out(default_slot, local);
			current = false;
		},

		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$5(ctx) {
	var div, div_id_value, div_aria_labelledby_value, current;

	var if_block = (ctx.$selectedPanel === ctx.panel) && create_if_block(ctx);

	return {
		c() {
			div = element("div");
			if (if_block) if_block.c();
			attr(div, "id", div_id_value = ctx.panel.id);
			attr(div, "aria-labelledby", div_aria_labelledby_value = ctx.$labeledBy[ctx.panel.id]);
			attr(div, "class", "svelte-tabs__tab-panel svelte-epfyet");
			attr(div, "role", "tabpanel");
		},

		m(target, anchor) {
			insert(target, div, anchor);
			if (if_block) if_block.m(div, null);
			current = true;
		},

		p(changed, ctx) {
			if (ctx.$selectedPanel === ctx.panel) {
				if (if_block) {
					if_block.p(changed, ctx);
					transition_in(if_block, 1);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div, null);
				}
			} else if (if_block) {
				group_outros();
				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});
				check_outros();
			}

			if ((!current || changed.$labeledBy) && div_aria_labelledby_value !== (div_aria_labelledby_value = ctx.$labeledBy[ctx.panel.id])) {
				attr(div, "aria-labelledby", div_aria_labelledby_value);
			}
		},

		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},

		o(local) {
			transition_out(if_block);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			if (if_block) if_block.d();
		}
	};
}

function instance$5($$self, $$props, $$invalidate) {
	let $labeledBy, $selectedPanel;

	

  const panel = {
    id: getId()
  };
  const { registerPanel, selectedPanel, labeledBy } = getContext(TABS); component_subscribe($$self, selectedPanel, $$value => { $selectedPanel = $$value; $$invalidate('$selectedPanel', $selectedPanel); }); component_subscribe($$self, labeledBy, $$value => { $labeledBy = $$value; $$invalidate('$labeledBy', $labeledBy); });

  registerPanel(panel);

	let { $$slots = {}, $$scope } = $$props;

	$$self.$set = $$props => {
		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
	};

	return {
		panel,
		selectedPanel,
		labeledBy,
		$labeledBy,
		$selectedPanel,
		$$slots,
		$$scope
	};
}

class TabPanel extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-epfyet-style")) add_css$3();
		init(this, options, instance$5, create_fragment$5, safe_not_equal, []);
	}
}

/* src/EmojiDetail.svelte generated by Svelte v3.8.1 */

function add_css$4() {
	var style = element("style");
	style.id = 'svelte-1yzufhj-style';
	style.textContent = ".svelte-emoji-picker__emoji-detail.svelte-1yzufhj{border-top:1px solid #CCCCCC;padding:0.25em;font-size:0.8em;font-weight:bold;height:3em;line-height:3em;text-align:center}";
	append(document.head, style);
}

// (20:2) {:else}
function create_else_block(ctx) {
	var t;

	return {
		c() {
			t = text(" ");
		},

		m(target, anchor) {
			insert(target, t, anchor);
		},

		p: noop,

		d(detaching) {
			if (detaching) {
				detach(t);
			}
		}
	};
}

// (18:2) {#if emoji}
function create_if_block$1(ctx) {
	var t_value = ctx.emoji.name + "", t;

	return {
		c() {
			t = text(t_value);
		},

		m(target, anchor) {
			insert(target, t, anchor);
		},

		p(changed, ctx) {
			if ((changed.emoji) && t_value !== (t_value = ctx.emoji.name + "")) {
				set_data(t, t_value);
			}
		},

		d(detaching) {
			if (detaching) {
				detach(t);
			}
		}
	};
}

function create_fragment$6(ctx) {
	var div;

	function select_block_type(ctx) {
		if (ctx.emoji) return create_if_block$1;
		return create_else_block;
	}

	var current_block_type = select_block_type(ctx);
	var if_block = current_block_type(ctx);

	return {
		c() {
			div = element("div");
			if_block.c();
			attr(div, "class", "svelte-emoji-picker__emoji-detail svelte-1yzufhj");
		},

		m(target, anchor) {
			insert(target, div, anchor);
			if_block.m(div, null);
		},

		p(changed, ctx) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(changed, ctx);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);
				if (if_block) {
					if_block.c();
					if_block.m(div, null);
				}
			}
		},

		i: noop,
		o: noop,

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			if_block.d();
		}
	};
}

function instance$6($$self, $$props, $$invalidate) {
	let { emoji } = $$props;

	$$self.$set = $$props => {
		if ('emoji' in $$props) $$invalidate('emoji', emoji = $$props.emoji);
	};

	return { emoji };
}

class EmojiDetail extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-1yzufhj-style")) add_css$4();
		init(this, options, instance$6, create_fragment$6, safe_not_equal, ["emoji"]);
	}
}

/* src/Emoji.svelte generated by Svelte v3.8.1 */

function add_css$5() {
	var style = element("style");
	style.id = 'svelte-122falo-style';
	style.textContent = "button.svelte-122falo{border:none;background:transparent;cursor:pointer;font-size:1.3em;width:1.5em;height:1.5em;padding:0;margin:0}button.svelte-122falo:hover{background:#E8F4F9;border-radius:5px}";
	append(document.head, style);
}

function create_fragment$7(ctx) {
	var button, t_value = ctx.emoji.emoji + "", t, dispose;

	return {
		c() {
			button = element("button");
			t = text(t_value);
			attr(button, "class", "svelte-122falo");

			dispose = [
				listen(button, "mouseover", ctx.onMouseOver),
				listen(button, "mouseout", ctx.onMouseOut),
				listen(button, "click", ctx.onClick)
			];
		},

		m(target, anchor) {
			insert(target, button, anchor);
			append(button, t);
		},

		p(changed, ctx) {
			if ((changed.emoji) && t_value !== (t_value = ctx.emoji.emoji + "")) {
				set_data(t, t_value);
			}
		},

		i: noop,
		o: noop,

		d(detaching) {
			if (detaching) {
				detach(button);
			}

			run_all(dispose);
		}
	};
}

function instance$7($$self, $$props, $$invalidate) {
	let { emoji } = $$props;
  
  const dispatch = createEventDispatcher();

  function onClick() {
    dispatch('emojiclick', emoji);
  }

  function onMouseOver() {
    dispatch('emojihover', emoji);
  }

  function onMouseOut() {
    dispatch('emojihover', null);
  }

	$$self.$set = $$props => {
		if ('emoji' in $$props) $$invalidate('emoji', emoji = $$props.emoji);
	};

	return { emoji, onClick, onMouseOver, onMouseOut };
}

class Emoji extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-122falo-style")) add_css$5();
		init(this, options, instance$7, create_fragment$7, safe_not_equal, ["emoji"]);
	}
}

/* src/EmojiList.svelte generated by Svelte v3.8.1 */

function add_css$6() {
	var style = element("style");
	style.id = 'svelte-mqwk8b-style';
	style.textContent = "h3.svelte-mqwk8b{margin:0.25em;font-size:0.9em;color:#333333}.svelte-emoji-picker__emoji-list.svelte-mqwk8b{height:11rem;overflow:scroll}.svelte-emoji-picker__emoji-list.tall.svelte-mqwk8b{height:14.9rem}";
	append(document.head, style);
}

function get_each_context(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.emoji = list[i];
	return child_ctx;
}

// (29:2) {#each emojis as emoji}
function create_each_block(ctx) {
	var current;

	var emoji = new Emoji({ props: { emoji: ctx.emoji } });
	emoji.$on("emojihover", ctx.emojihover_handler);
	emoji.$on("emojiclick", ctx.emojiclick_handler);

	return {
		c() {
			emoji.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(emoji, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emoji_changes = {};
			if (changed.emojis) emoji_changes.emoji = ctx.emoji;
			emoji.$set(emoji_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emoji.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emoji.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emoji, detaching);
		}
	};
}

function create_fragment$8(ctx) {
	var h3, t0, t1, div, current;

	var each_value = ctx.emojis;

	var each_blocks = [];

	for (var i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	return {
		c() {
			h3 = element("h3");
			t0 = text(ctx.name);
			t1 = space();
			div = element("div");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}
			attr(h3, "class", "svelte-mqwk8b");
			attr(div, "class", "svelte-emoji-picker__emoji-list svelte-mqwk8b");
			toggle_class(div, "tall", !ctx.withTabs);
		},

		m(target, anchor) {
			insert(target, h3, anchor);
			append(h3, t0);
			insert(target, t1, anchor);
			insert(target, div, anchor);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div, null);
			}

			current = true;
		},

		p(changed, ctx) {
			if (!current || changed.name) {
				set_data(t0, ctx.name);
			}

			if (changed.emojis) {
				each_value = ctx.emojis;

				for (var i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div, null);
					}
				}

				group_outros();
				for (i = each_value.length; i < each_blocks.length; i += 1) out(i);
				check_outros();
			}

			if (changed.withTabs) {
				toggle_class(div, "tall", !ctx.withTabs);
			}
		},

		i(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o(local) {
			each_blocks = each_blocks.filter(Boolean);
			for (let i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(h3);
				detach(t1);
				detach(div);
			}

			destroy_each(each_blocks, detaching);
		}
	};
}

function instance$8($$self, $$props, $$invalidate) {
	let { name = '', withTabs = true, emojis } = $$props;

	function emojihover_handler(event) {
		bubble($$self, event);
	}

	function emojiclick_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ('name' in $$props) $$invalidate('name', name = $$props.name);
		if ('withTabs' in $$props) $$invalidate('withTabs', withTabs = $$props.withTabs);
		if ('emojis' in $$props) $$invalidate('emojis', emojis = $$props.emojis);
	};

	return {
		name,
		withTabs,
		emojis,
		emojihover_handler,
		emojiclick_handler
	};
}

class EmojiList extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-mqwk8b-style")) add_css$6();
		init(this, options, instance$8, create_fragment$8, safe_not_equal, ["name", "withTabs", "emojis"]);
	}
}

/* src/EmojiSearch.svelte generated by Svelte v3.8.1 */

function add_css$7() {
	var style = element("style");
	style.id = 'svelte-4jqs7j-style';
	style.textContent = ".svelte-emoji-picker__search.svelte-4jqs7j{padding:0.25em;position:relative}.svelte-emoji-picker__search.svelte-4jqs7j input.svelte-4jqs7j{width:100%;border-radius:5px}.svelte-emoji-picker__search.svelte-4jqs7j input.svelte-4jqs7j:focus{outline:none;border-color:#4F81E5}.icon.svelte-4jqs7j{color:#AAAAAA;position:absolute;font-size:1em;top:calc(50% - 0.5em);right:0.75em}.icon.clear-button.svelte-4jqs7j{cursor:pointer}";
	append(document.head, style);
}

// (62:2) {:else}
function create_else_block$1(ctx) {
	var span, current;

	var icon = new Icon({ props: { icon: faSearch } });

	return {
		c() {
			span = element("span");
			icon.$$.fragment.c();
			attr(span, "class", "icon svelte-4jqs7j");
		},

		m(target, anchor) {
			insert(target, span, anchor);
			mount_component(icon, span, null);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.faSearch) icon_changes.icon = faSearch;
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(span);
			}

			destroy_component(icon);
		}
	};
}

// (60:2) {#if searchText}
function create_if_block$2(ctx) {
	var span, current, dispose;

	var icon = new Icon({ props: { icon: faTimes } });

	return {
		c() {
			span = element("span");
			icon.$$.fragment.c();
			attr(span, "class", "icon clear-button svelte-4jqs7j");
			attr(span, "role", "button");
			dispose = listen(span, "click", stop_propagation(ctx.clearSearchText));
		},

		m(target, anchor) {
			insert(target, span, anchor);
			mount_component(icon, span, null);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.faTimes) icon_changes.icon = faTimes;
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(span);
			}

			destroy_component(icon);

			dispose();
		}
	};
}

function create_fragment$9(ctx) {
	var div, input, t, current_block_type_index, if_block, current, dispose;

	var if_block_creators = [
		create_if_block$2,
		create_else_block$1
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (ctx.searchText) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			div = element("div");
			input = element("input");
			t = space();
			if_block.c();
			attr(input, "type", "text");
			attr(input, "placeholder", "Search emojis...");
			attr(input, "class", "svelte-4jqs7j");
			attr(div, "class", "svelte-emoji-picker__search svelte-4jqs7j");

			dispose = [
				listen(input, "input", ctx.input_input_handler),
				listen(input, "keydown", ctx.handleKeyDown)
			];
		},

		m(target, anchor) {
			insert(target, div, anchor);
			append(div, input);

			input.value = ctx.searchText;

			ctx.input_binding(input);
			append(div, t);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},

		p(changed, ctx) {
			if (changed.searchText && (input.value !== ctx.searchText)) input.value = ctx.searchText;

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block = if_blocks[current_block_type_index];
				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				}
				transition_in(if_block, 1);
				if_block.m(div, null);
			}
		},

		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},

		o(local) {
			transition_out(if_block);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			ctx.input_binding(null);
			if_blocks[current_block_type_index].d();
			run_all(dispose);
		}
	};
}

function instance$9($$self, $$props, $$invalidate) {
	

  let { searchText = '' } = $$props;

  let searchField;

  onMount(() => {
    searchField.focus();
  });

  function clearSearchText() {
    $$invalidate('searchText', searchText = '');
    searchField.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && searchText) {
      clearSearchText();
      event.stopPropagation();
    }
  }

	function input_input_handler() {
		searchText = this.value;
		$$invalidate('searchText', searchText);
	}

	function input_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('searchField', searchField = $$value);
		});
	}

	$$self.$set = $$props => {
		if ('searchText' in $$props) $$invalidate('searchText', searchText = $$props.searchText);
	};

	return {
		searchText,
		searchField,
		clearSearchText,
		handleKeyDown,
		input_input_handler,
		input_binding
	};
}

class EmojiSearch extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-4jqs7j-style")) add_css$7();
		init(this, options, instance$9, create_fragment$9, safe_not_equal, ["searchText"]);
	}
}

var emojiData = [{"name":"monkey_face","key":"monkey_face","names":["monkey_face"],"emoji":"🐵","category":"Animals & Nature"},{"name":"grinning","key":"grinning","names":["grinning"],"emoji":"😀","category":"Smileys & People"},{"name":"skin-tone-2","key":"skin-tone-2","names":["skin-tone-2"],"emoji":"🏻","category":"Skin Tones"},{"name":"earth_africa","key":"earth_africa","names":["earth_africa"],"emoji":"🌍","category":"Travel & Places"},{"name":"checkered_flag","key":"checkered_flag","names":["checkered_flag"],"emoji":"🏁","category":"Flags"},{"name":"mute","key":"mute","names":["mute"],"emoji":"🔇","category":"Objects"},{"name":"jack_o_lantern","key":"jack_o_lantern","names":["jack_o_lantern"],"emoji":"🎃","category":"Activities"},{"name":"atm","key":"atm","names":["atm"],"emoji":"🏧","category":"Symbols"},{"name":"grapes","key":"grapes","names":["grapes"],"emoji":"🍇","category":"Food & Drink"},{"name":"earth_americas","key":"earth_americas","names":["earth_americas"],"emoji":"🌎","category":"Travel & Places"},{"name":"grin","key":"grin","names":["grin"],"emoji":"😁","category":"Smileys & People"},{"name":"melon","key":"melon","names":["melon"],"emoji":"🍈","category":"Food & Drink"},{"name":"triangular_flag_on_post","key":"triangular_flag_on_post","names":["triangular_flag_on_post"],"emoji":"🚩","category":"Flags"},{"name":"monkey","key":"monkey","names":["monkey"],"emoji":"🐒","category":"Animals & Nature"},{"name":"christmas_tree","key":"christmas_tree","names":["christmas_tree"],"emoji":"🎄","category":"Activities"},{"name":"skin-tone-3","key":"skin-tone-3","names":["skin-tone-3"],"emoji":"🏼","category":"Skin Tones"},{"name":"put_litter_in_its_place","key":"put_litter_in_its_place","names":["put_litter_in_its_place"],"emoji":"🚮","category":"Symbols"},{"name":"speaker","key":"speaker","names":["speaker"],"emoji":"🔈","category":"Objects"},{"name":"earth_asia","key":"earth_asia","names":["earth_asia"],"emoji":"🌏","category":"Travel & Places"},{"name":"crossed_flags","key":"crossed_flags","names":["crossed_flags"],"emoji":"🎌","category":"Flags"},{"name":"joy","key":"joy","names":["joy"],"emoji":"😂","category":"Smileys & People"},{"name":"sound","key":"sound","names":["sound"],"emoji":"🔉","category":"Objects"},{"name":"watermelon","key":"watermelon","names":["watermelon"],"emoji":"🍉","category":"Food & Drink"},{"name":"gorilla","key":"gorilla","names":["gorilla"],"emoji":"🦍","category":"Animals & Nature"},{"name":"fireworks","key":"fireworks","names":["fireworks"],"emoji":"🎆","category":"Activities"},{"name":"potable_water","key":"potable_water","names":["potable_water"],"emoji":"🚰","category":"Symbols"},{"name":"skin-tone-4","key":"skin-tone-4","names":["skin-tone-4"],"emoji":"🏽","category":"Skin Tones"},{"name":"wheelchair","key":"wheelchair","names":["wheelchair"],"emoji":"♿","category":"Symbols"},{"name":"rolling_on_the_floor_laughing","key":"rolling_on_the_floor_laughing","names":["rolling_on_the_floor_laughing"],"emoji":"🤣","category":"Smileys & People"},{"name":"loud_sound","key":"loud_sound","names":["loud_sound"],"emoji":"🔊","category":"Objects"},{"name":"waving_black_flag","key":"waving_black_flag","names":["waving_black_flag"],"emoji":"🏴","category":"Flags"},{"name":"tangerine","key":"tangerine","names":["tangerine"],"emoji":"🍊","category":"Food & Drink"},{"name":"dog","key":"dog","names":["dog"],"emoji":"🐶","category":"Animals & Nature"},{"name":"sparkler","key":"sparkler","names":["sparkler"],"emoji":"🎇","category":"Activities"},{"name":"skin-tone-5","key":"skin-tone-5","names":["skin-tone-5"],"emoji":"🏾","category":"Skin Tones"},{"name":"globe_with_meridians","key":"globe_with_meridians","names":["globe_with_meridians"],"emoji":"🌐","category":"Travel & Places"},{"name":"skin-tone-6","key":"skin-tone-6","names":["skin-tone-6"],"emoji":"🏿","category":"Skin Tones"},{"name":"smiley","key":"smiley","names":["smiley"],"emoji":"😃","category":"Smileys & People"},{"name":"loudspeaker","key":"loudspeaker","names":["loudspeaker"],"emoji":"📢","category":"Objects"},{"name":"sparkles","key":"sparkles","names":["sparkles"],"emoji":"✨","category":"Activities"},{"name":"dog2","key":"dog2","names":["dog2"],"emoji":"🐕","category":"Animals & Nature"},{"name":"waving_white_flag","key":"waving_white_flag","names":["waving_white_flag"],"emoji":"🏳️","category":"Flags"},{"name":"world_map","key":"world_map","names":["world_map"],"emoji":"🗺️","category":"Travel & Places"},{"name":"lemon","key":"lemon","names":["lemon"],"emoji":"🍋","category":"Food & Drink"},{"name":"mens","key":"mens","names":["mens"],"emoji":"🚹","category":"Symbols"},{"name":"womens","key":"womens","names":["womens"],"emoji":"🚺","category":"Symbols"},{"name":"rainbow-flag","key":"rainbow-flag","names":["rainbow-flag"],"emoji":"🏳️‍🌈","category":"Flags"},{"name":"smile","key":"smile","names":["smile"],"emoji":"😄","category":"Smileys & People"},{"name":"banana","key":"banana","names":["banana"],"emoji":"🍌","category":"Food & Drink"},{"name":"mega","key":"mega","names":["mega"],"emoji":"📣","category":"Objects"},{"name":"japan","key":"japan","names":["japan"],"emoji":"🗾","category":"Travel & Places"},{"name":"poodle","key":"poodle","names":["poodle"],"emoji":"🐩","category":"Animals & Nature"},{"name":"balloon","key":"balloon","names":["balloon"],"emoji":"🎈","category":"Activities"},{"name":"flag-ac","key":"flag-ac","names":["flag-ac"],"emoji":"🇦🇨","category":"Flags"},{"name":"sweat_smile","key":"sweat_smile","names":["sweat_smile"],"emoji":"😅","category":"Smileys & People"},{"name":"pineapple","key":"pineapple","names":["pineapple"],"emoji":"🍍","category":"Food & Drink"},{"name":"restroom","key":"restroom","names":["restroom"],"emoji":"🚻","category":"Symbols"},{"name":"postal_horn","key":"postal_horn","names":["postal_horn"],"emoji":"📯","category":"Objects"},{"name":"wolf","key":"wolf","names":["wolf"],"emoji":"🐺","category":"Animals & Nature"},{"name":"tada","key":"tada","names":["tada"],"emoji":"🎉","category":"Activities"},{"name":"snow_capped_mountain","key":"snow_capped_mountain","names":["snow_capped_mountain"],"emoji":"🏔️","category":"Travel & Places"},{"name":"laughing","key":"laughing","names":["laughing","satisfied"],"emoji":"😆","category":"Smileys & People"},{"name":"apple","key":"apple","names":["apple"],"emoji":"🍎","category":"Food & Drink"},{"name":"flag-ad","key":"flag-ad","names":["flag-ad"],"emoji":"🇦🇩","category":"Flags"},{"name":"fox_face","key":"fox_face","names":["fox_face"],"emoji":"🦊","category":"Animals & Nature"},{"name":"confetti_ball","key":"confetti_ball","names":["confetti_ball"],"emoji":"🎊","category":"Activities"},{"name":"bell","key":"bell","names":["bell"],"emoji":"🔔","category":"Objects"},{"name":"mountain","key":"mountain","names":["mountain"],"emoji":"⛰️","category":"Travel & Places"},{"name":"baby_symbol","key":"baby_symbol","names":["baby_symbol"],"emoji":"🚼","category":"Symbols"},{"name":"wc","key":"wc","names":["wc"],"emoji":"🚾","category":"Symbols"},{"name":"wink","key":"wink","names":["wink"],"emoji":"😉","category":"Smileys & People"},{"name":"no_bell","key":"no_bell","names":["no_bell"],"emoji":"🔕","category":"Objects"},{"name":"green_apple","key":"green_apple","names":["green_apple"],"emoji":"🍏","category":"Food & Drink"},{"name":"tanabata_tree","key":"tanabata_tree","names":["tanabata_tree"],"emoji":"🎋","category":"Activities"},{"name":"flag-ae","key":"flag-ae","names":["flag-ae"],"emoji":"🇦🇪","category":"Flags"},{"name":"volcano","key":"volcano","names":["volcano"],"emoji":"🌋","category":"Travel & Places"},{"name":"cat","key":"cat","names":["cat"],"emoji":"🐱","category":"Animals & Nature"},{"name":"flag-af","key":"flag-af","names":["flag-af"],"emoji":"🇦🇫","category":"Flags"},{"name":"musical_score","key":"musical_score","names":["musical_score"],"emoji":"🎼","category":"Objects"},{"name":"blush","key":"blush","names":["blush"],"emoji":"😊","category":"Smileys & People"},{"name":"pear","key":"pear","names":["pear"],"emoji":"🍐","category":"Food & Drink"},{"name":"bamboo","key":"bamboo","names":["bamboo"],"emoji":"🎍","category":"Activities"},{"name":"passport_control","key":"passport_control","names":["passport_control"],"emoji":"🛂","category":"Symbols"},{"name":"mount_fuji","key":"mount_fuji","names":["mount_fuji"],"emoji":"🗻","category":"Travel & Places"},{"name":"cat2","key":"cat2","names":["cat2"],"emoji":"🐈","category":"Animals & Nature"},{"name":"musical_note","key":"musical_note","names":["musical_note"],"emoji":"🎵","category":"Objects"},{"name":"dolls","key":"dolls","names":["dolls"],"emoji":"🎎","category":"Activities"},{"name":"lion_face","key":"lion_face","names":["lion_face"],"emoji":"🦁","category":"Animals & Nature"},{"name":"camping","key":"camping","names":["camping"],"emoji":"🏕️","category":"Travel & Places"},{"name":"flag-ag","key":"flag-ag","names":["flag-ag"],"emoji":"🇦🇬","category":"Flags"},{"name":"customs","key":"customs","names":["customs"],"emoji":"🛃","category":"Symbols"},{"name":"yum","key":"yum","names":["yum"],"emoji":"😋","category":"Smileys & People"},{"name":"peach","key":"peach","names":["peach"],"emoji":"🍑","category":"Food & Drink"},{"name":"tiger","key":"tiger","names":["tiger"],"emoji":"🐯","category":"Animals & Nature"},{"name":"notes","key":"notes","names":["notes"],"emoji":"🎶","category":"Objects"},{"name":"flags","key":"flags","names":["flags"],"emoji":"🎏","category":"Activities"},{"name":"beach_with_umbrella","key":"beach_with_umbrella","names":["beach_with_umbrella"],"emoji":"🏖️","category":"Travel & Places"},{"name":"cherries","key":"cherries","names":["cherries"],"emoji":"🍒","category":"Food & Drink"},{"name":"flag-ai","key":"flag-ai","names":["flag-ai"],"emoji":"🇦🇮","category":"Flags"},{"name":"baggage_claim","key":"baggage_claim","names":["baggage_claim"],"emoji":"🛄","category":"Symbols"},{"name":"sunglasses","key":"sunglasses","names":["sunglasses"],"emoji":"😎","category":"Smileys & People"},{"name":"left_luggage","key":"left_luggage","names":["left_luggage"],"emoji":"🛅","category":"Symbols"},{"name":"wind_chime","key":"wind_chime","names":["wind_chime"],"emoji":"🎐","category":"Activities"},{"name":"strawberry","key":"strawberry","names":["strawberry"],"emoji":"🍓","category":"Food & Drink"},{"name":"desert","key":"desert","names":["desert"],"emoji":"🏜️","category":"Travel & Places"},{"name":"studio_microphone","key":"studio_microphone","names":["studio_microphone"],"emoji":"🎙️","category":"Objects"},{"name":"flag-al","key":"flag-al","names":["flag-al"],"emoji":"🇦🇱","category":"Flags"},{"name":"tiger2","key":"tiger2","names":["tiger2"],"emoji":"🐅","category":"Animals & Nature"},{"name":"heart_eyes","key":"heart_eyes","names":["heart_eyes"],"emoji":"😍","category":"Smileys & People"},{"name":"desert_island","key":"desert_island","names":["desert_island"],"emoji":"🏝️","category":"Travel & Places"},{"name":"kiwifruit","key":"kiwifruit","names":["kiwifruit"],"emoji":"🥝","category":"Food & Drink"},{"name":"rice_scene","key":"rice_scene","names":["rice_scene"],"emoji":"🎑","category":"Activities"},{"name":"kissing_heart","key":"kissing_heart","names":["kissing_heart"],"emoji":"😘","category":"Smileys & People"},{"name":"warning","key":"warning","names":["warning"],"emoji":"⚠️","category":"Symbols"},{"name":"flag-am","key":"flag-am","names":["flag-am"],"emoji":"🇦🇲","category":"Flags"},{"name":"leopard","key":"leopard","names":["leopard"],"emoji":"🐆","category":"Animals & Nature"},{"name":"level_slider","key":"level_slider","names":["level_slider"],"emoji":"🎚️","category":"Objects"},{"name":"horse","key":"horse","names":["horse"],"emoji":"🐴","category":"Animals & Nature"},{"name":"children_crossing","key":"children_crossing","names":["children_crossing"],"emoji":"🚸","category":"Symbols"},{"name":"ribbon","key":"ribbon","names":["ribbon"],"emoji":"🎀","category":"Activities"},{"name":"national_park","key":"national_park","names":["national_park"],"emoji":"🏞️","category":"Travel & Places"},{"name":"control_knobs","key":"control_knobs","names":["control_knobs"],"emoji":"🎛️","category":"Objects"},{"name":"kissing","key":"kissing","names":["kissing"],"emoji":"😗","category":"Smileys & People"},{"name":"tomato","key":"tomato","names":["tomato"],"emoji":"🍅","category":"Food & Drink"},{"name":"flag-ao","key":"flag-ao","names":["flag-ao"],"emoji":"🇦🇴","category":"Flags"},{"name":"stadium","key":"stadium","names":["stadium"],"emoji":"🏟️","category":"Travel & Places"},{"name":"flag-aq","key":"flag-aq","names":["flag-aq"],"emoji":"🇦🇶","category":"Flags"},{"name":"gift","key":"gift","names":["gift"],"emoji":"🎁","category":"Activities"},{"name":"no_entry","key":"no_entry","names":["no_entry"],"emoji":"⛔","category":"Symbols"},{"name":"kissing_smiling_eyes","key":"kissing_smiling_eyes","names":["kissing_smiling_eyes"],"emoji":"😙","category":"Smileys & People"},{"name":"coconut","key":"coconut","names":["coconut"],"emoji":"🥥","category":"Food & Drink"},{"name":"racehorse","key":"racehorse","names":["racehorse"],"emoji":"🐎","category":"Animals & Nature"},{"name":"microphone","key":"microphone","names":["microphone"],"emoji":"🎤","category":"Objects"},{"name":"classical_building","key":"classical_building","names":["classical_building"],"emoji":"🏛️","category":"Travel & Places"},{"name":"no_entry_sign","key":"no_entry_sign","names":["no_entry_sign"],"emoji":"🚫","category":"Symbols"},{"name":"reminder_ribbon","key":"reminder_ribbon","names":["reminder_ribbon"],"emoji":"🎗️","category":"Activities"},{"name":"kissing_closed_eyes","key":"kissing_closed_eyes","names":["kissing_closed_eyes"],"emoji":"😚","category":"Smileys & People"},{"name":"unicorn_face","key":"unicorn_face","names":["unicorn_face"],"emoji":"🦄","category":"Animals & Nature"},{"name":"flag-ar","key":"flag-ar","names":["flag-ar"],"emoji":"🇦🇷","category":"Flags"},{"name":"headphones","key":"headphones","names":["headphones"],"emoji":"🎧","category":"Objects"},{"name":"avocado","key":"avocado","names":["avocado"],"emoji":"🥑","category":"Food & Drink"},{"name":"relaxed","key":"relaxed","names":["relaxed"],"emoji":"☺️","category":"Smileys & People"},{"name":"zebra_face","key":"zebra_face","names":["zebra_face"],"emoji":"🦓","category":"Animals & Nature"},{"name":"eggplant","key":"eggplant","names":["eggplant"],"emoji":"🍆","category":"Food & Drink"},{"name":"radio","key":"radio","names":["radio"],"emoji":"📻","category":"Objects"},{"name":"building_construction","key":"building_construction","names":["building_construction"],"emoji":"🏗️","category":"Travel & Places"},{"name":"flag-as","key":"flag-as","names":["flag-as"],"emoji":"🇦🇸","category":"Flags"},{"name":"admission_tickets","key":"admission_tickets","names":["admission_tickets"],"emoji":"🎟️","category":"Activities"},{"name":"no_bicycles","key":"no_bicycles","names":["no_bicycles"],"emoji":"🚳","category":"Symbols"},{"name":"no_smoking","key":"no_smoking","names":["no_smoking"],"emoji":"🚭","category":"Symbols"},{"name":"slightly_smiling_face","key":"slightly_smiling_face","names":["slightly_smiling_face"],"emoji":"🙂","category":"Smileys & People"},{"name":"flag-at","key":"flag-at","names":["flag-at"],"emoji":"🇦🇹","category":"Flags"},{"name":"ticket","key":"ticket","names":["ticket"],"emoji":"🎫","category":"Activities"},{"name":"saxophone","key":"saxophone","names":["saxophone"],"emoji":"🎷","category":"Objects"},{"name":"deer","key":"deer","names":["deer"],"emoji":"🦌","category":"Animals & Nature"},{"name":"house_buildings","key":"house_buildings","names":["house_buildings"],"emoji":"🏘️","category":"Travel & Places"},{"name":"potato","key":"potato","names":["potato"],"emoji":"🥔","category":"Food & Drink"},{"name":"guitar","key":"guitar","names":["guitar"],"emoji":"🎸","category":"Objects"},{"name":"carrot","key":"carrot","names":["carrot"],"emoji":"🥕","category":"Food & Drink"},{"name":"cityscape","key":"cityscape","names":["cityscape"],"emoji":"🏙️","category":"Travel & Places"},{"name":"flag-au","key":"flag-au","names":["flag-au"],"emoji":"🇦🇺","category":"Flags"},{"name":"do_not_litter","key":"do_not_litter","names":["do_not_litter"],"emoji":"🚯","category":"Symbols"},{"name":"hugging_face","key":"hugging_face","names":["hugging_face"],"emoji":"🤗","category":"Smileys & People"},{"name":"cow","key":"cow","names":["cow"],"emoji":"🐮","category":"Animals & Nature"},{"name":"medal","key":"medal","names":["medal"],"emoji":"🎖️","category":"Activities"},{"name":"musical_keyboard","key":"musical_keyboard","names":["musical_keyboard"],"emoji":"🎹","category":"Objects"},{"name":"corn","key":"corn","names":["corn"],"emoji":"🌽","category":"Food & Drink"},{"name":"derelict_house_building","key":"derelict_house_building","names":["derelict_house_building"],"emoji":"🏚️","category":"Travel & Places"},{"name":"non-potable_water","key":"non-potable_water","names":["non-potable_water"],"emoji":"🚱","category":"Symbols"},{"name":"trophy","key":"trophy","names":["trophy"],"emoji":"🏆","category":"Activities"},{"name":"flag-aw","key":"flag-aw","names":["flag-aw"],"emoji":"🇦🇼","category":"Flags"},{"name":"star-struck","key":"star-struck","names":["star-struck","grinning_face_with_star_eyes"],"emoji":"🤩","category":"Smileys & People"},{"name":"ox","key":"ox","names":["ox"],"emoji":"🐂","category":"Animals & Nature"},{"name":"trumpet","key":"trumpet","names":["trumpet"],"emoji":"🎺","category":"Objects"},{"name":"hot_pepper","key":"hot_pepper","names":["hot_pepper"],"emoji":"🌶️","category":"Food & Drink"},{"name":"sports_medal","key":"sports_medal","names":["sports_medal"],"emoji":"🏅","category":"Activities"},{"name":"flag-ax","key":"flag-ax","names":["flag-ax"],"emoji":"🇦🇽","category":"Flags"},{"name":"water_buffalo","key":"water_buffalo","names":["water_buffalo"],"emoji":"🐃","category":"Animals & Nature"},{"name":"no_pedestrians","key":"no_pedestrians","names":["no_pedestrians"],"emoji":"🚷","category":"Symbols"},{"name":"thinking_face","key":"thinking_face","names":["thinking_face"],"emoji":"🤔","category":"Smileys & People"},{"name":"house","key":"house","names":["house"],"emoji":"🏠","category":"Travel & Places"},{"name":"no_mobile_phones","key":"no_mobile_phones","names":["no_mobile_phones"],"emoji":"📵","category":"Symbols"},{"name":"flag-az","key":"flag-az","names":["flag-az"],"emoji":"🇦🇿","category":"Flags"},{"name":"first_place_medal","key":"first_place_medal","names":["first_place_medal"],"emoji":"🥇","category":"Activities"},{"name":"house_with_garden","key":"house_with_garden","names":["house_with_garden"],"emoji":"🏡","category":"Travel & Places"},{"name":"violin","key":"violin","names":["violin"],"emoji":"🎻","category":"Objects"},{"name":"face_with_raised_eyebrow","key":"face_with_raised_eyebrow","names":["face_with_raised_eyebrow","face_with_one_eyebrow_raised"],"emoji":"🤨","category":"Smileys & People"},{"name":"cucumber","key":"cucumber","names":["cucumber"],"emoji":"🥒","category":"Food & Drink"},{"name":"cow2","key":"cow2","names":["cow2"],"emoji":"🐄","category":"Animals & Nature"},{"name":"flag-ba","key":"flag-ba","names":["flag-ba"],"emoji":"🇧🇦","category":"Flags"},{"name":"pig","key":"pig","names":["pig"],"emoji":"🐷","category":"Animals & Nature"},{"name":"drum_with_drumsticks","key":"drum_with_drumsticks","names":["drum_with_drumsticks"],"emoji":"🥁","category":"Objects"},{"name":"underage","key":"underage","names":["underage"],"emoji":"🔞","category":"Symbols"},{"name":"broccoli","key":"broccoli","names":["broccoli"],"emoji":"🥦","category":"Food & Drink"},{"name":"office","key":"office","names":["office"],"emoji":"🏢","category":"Travel & Places"},{"name":"second_place_medal","key":"second_place_medal","names":["second_place_medal"],"emoji":"🥈","category":"Activities"},{"name":"neutral_face","key":"neutral_face","names":["neutral_face"],"emoji":"😐","category":"Smileys & People"},{"name":"third_place_medal","key":"third_place_medal","names":["third_place_medal"],"emoji":"🥉","category":"Activities"},{"name":"mushroom","key":"mushroom","names":["mushroom"],"emoji":"🍄","category":"Food & Drink"},{"name":"flag-bb","key":"flag-bb","names":["flag-bb"],"emoji":"🇧🇧","category":"Flags"},{"name":"radioactive_sign","key":"radioactive_sign","names":["radioactive_sign"],"emoji":"☢️","category":"Symbols"},{"name":"pig2","key":"pig2","names":["pig2"],"emoji":"🐖","category":"Animals & Nature"},{"name":"expressionless","key":"expressionless","names":["expressionless"],"emoji":"😑","category":"Smileys & People"},{"name":"iphone","key":"iphone","names":["iphone"],"emoji":"📱","category":"Objects"},{"name":"post_office","key":"post_office","names":["post_office"],"emoji":"🏣","category":"Travel & Places"},{"name":"european_post_office","key":"european_post_office","names":["european_post_office"],"emoji":"🏤","category":"Travel & Places"},{"name":"soccer","key":"soccer","names":["soccer"],"emoji":"⚽","category":"Activities"},{"name":"boar","key":"boar","names":["boar"],"emoji":"🐗","category":"Animals & Nature"},{"name":"peanuts","key":"peanuts","names":["peanuts"],"emoji":"🥜","category":"Food & Drink"},{"name":"calling","key":"calling","names":["calling"],"emoji":"📲","category":"Objects"},{"name":"biohazard_sign","key":"biohazard_sign","names":["biohazard_sign"],"emoji":"☣️","category":"Symbols"},{"name":"flag-bd","key":"flag-bd","names":["flag-bd"],"emoji":"🇧🇩","category":"Flags"},{"name":"no_mouth","key":"no_mouth","names":["no_mouth"],"emoji":"😶","category":"Smileys & People"},{"name":"face_with_rolling_eyes","key":"face_with_rolling_eyes","names":["face_with_rolling_eyes"],"emoji":"🙄","category":"Smileys & People"},{"name":"phone","key":"phone","names":["phone","telephone"],"emoji":"☎️","category":"Objects"},{"name":"pig_nose","key":"pig_nose","names":["pig_nose"],"emoji":"🐽","category":"Animals & Nature"},{"name":"chestnut","key":"chestnut","names":["chestnut"],"emoji":"🌰","category":"Food & Drink"},{"name":"arrow_up","key":"arrow_up","names":["arrow_up"],"emoji":"⬆️","category":"Symbols"},{"name":"hospital","key":"hospital","names":["hospital"],"emoji":"🏥","category":"Travel & Places"},{"name":"flag-be","key":"flag-be","names":["flag-be"],"emoji":"🇧🇪","category":"Flags"},{"name":"baseball","key":"baseball","names":["baseball"],"emoji":"⚾","category":"Activities"},{"name":"smirk","key":"smirk","names":["smirk"],"emoji":"😏","category":"Smileys & People"},{"name":"arrow_upper_right","key":"arrow_upper_right","names":["arrow_upper_right"],"emoji":"↗️","category":"Symbols"},{"name":"flag-bf","key":"flag-bf","names":["flag-bf"],"emoji":"🇧🇫","category":"Flags"},{"name":"basketball","key":"basketball","names":["basketball"],"emoji":"🏀","category":"Activities"},{"name":"ram","key":"ram","names":["ram"],"emoji":"🐏","category":"Animals & Nature"},{"name":"bank","key":"bank","names":["bank"],"emoji":"🏦","category":"Travel & Places"},{"name":"bread","key":"bread","names":["bread"],"emoji":"🍞","category":"Food & Drink"},{"name":"telephone_receiver","key":"telephone_receiver","names":["telephone_receiver"],"emoji":"📞","category":"Objects"},{"name":"croissant","key":"croissant","names":["croissant"],"emoji":"🥐","category":"Food & Drink"},{"name":"pager","key":"pager","names":["pager"],"emoji":"📟","category":"Objects"},{"name":"sheep","key":"sheep","names":["sheep"],"emoji":"🐑","category":"Animals & Nature"},{"name":"arrow_right","key":"arrow_right","names":["arrow_right"],"emoji":"➡️","category":"Symbols"},{"name":"persevere","key":"persevere","names":["persevere"],"emoji":"😣","category":"Smileys & People"},{"name":"flag-bg","key":"flag-bg","names":["flag-bg"],"emoji":"🇧🇬","category":"Flags"},{"name":"volleyball","key":"volleyball","names":["volleyball"],"emoji":"🏐","category":"Activities"},{"name":"hotel","key":"hotel","names":["hotel"],"emoji":"🏨","category":"Travel & Places"},{"name":"arrow_lower_right","key":"arrow_lower_right","names":["arrow_lower_right"],"emoji":"↘️","category":"Symbols"},{"name":"goat","key":"goat","names":["goat"],"emoji":"🐐","category":"Animals & Nature"},{"name":"flag-bh","key":"flag-bh","names":["flag-bh"],"emoji":"🇧🇭","category":"Flags"},{"name":"love_hotel","key":"love_hotel","names":["love_hotel"],"emoji":"🏩","category":"Travel & Places"},{"name":"disappointed_relieved","key":"disappointed_relieved","names":["disappointed_relieved"],"emoji":"😥","category":"Smileys & People"},{"name":"baguette_bread","key":"baguette_bread","names":["baguette_bread"],"emoji":"🥖","category":"Food & Drink"},{"name":"football","key":"football","names":["football"],"emoji":"🏈","category":"Activities"},{"name":"fax","key":"fax","names":["fax"],"emoji":"📠","category":"Objects"},{"name":"convenience_store","key":"convenience_store","names":["convenience_store"],"emoji":"🏪","category":"Travel & Places"},{"name":"dromedary_camel","key":"dromedary_camel","names":["dromedary_camel"],"emoji":"🐪","category":"Animals & Nature"},{"name":"arrow_down","key":"arrow_down","names":["arrow_down"],"emoji":"⬇️","category":"Symbols"},{"name":"battery","key":"battery","names":["battery"],"emoji":"🔋","category":"Objects"},{"name":"rugby_football","key":"rugby_football","names":["rugby_football"],"emoji":"🏉","category":"Activities"},{"name":"pretzel","key":"pretzel","names":["pretzel"],"emoji":"🥨","category":"Food & Drink"},{"name":"open_mouth","key":"open_mouth","names":["open_mouth"],"emoji":"😮","category":"Smileys & People"},{"name":"flag-bi","key":"flag-bi","names":["flag-bi"],"emoji":"🇧🇮","category":"Flags"},{"name":"flag-bj","key":"flag-bj","names":["flag-bj"],"emoji":"🇧🇯","category":"Flags"},{"name":"pancakes","key":"pancakes","names":["pancakes"],"emoji":"🥞","category":"Food & Drink"},{"name":"school","key":"school","names":["school"],"emoji":"🏫","category":"Travel & Places"},{"name":"tennis","key":"tennis","names":["tennis"],"emoji":"🎾","category":"Activities"},{"name":"zipper_mouth_face","key":"zipper_mouth_face","names":["zipper_mouth_face"],"emoji":"🤐","category":"Smileys & People"},{"name":"camel","key":"camel","names":["camel"],"emoji":"🐫","category":"Animals & Nature"},{"name":"arrow_lower_left","key":"arrow_lower_left","names":["arrow_lower_left"],"emoji":"↙️","category":"Symbols"},{"name":"electric_plug","key":"electric_plug","names":["electric_plug"],"emoji":"🔌","category":"Objects"},{"name":"cheese_wedge","key":"cheese_wedge","names":["cheese_wedge"],"emoji":"🧀","category":"Food & Drink"},{"name":"hushed","key":"hushed","names":["hushed"],"emoji":"😯","category":"Smileys & People"},{"name":"computer","key":"computer","names":["computer"],"emoji":"💻","category":"Objects"},{"name":"giraffe_face","key":"giraffe_face","names":["giraffe_face"],"emoji":"🦒","category":"Animals & Nature"},{"name":"8ball","key":"8ball","names":["8ball"],"emoji":"🎱","category":"Activities"},{"name":"flag-bl","key":"flag-bl","names":["flag-bl"],"emoji":"🇧🇱","category":"Flags"},{"name":"arrow_left","key":"arrow_left","names":["arrow_left"],"emoji":"⬅️","category":"Symbols"},{"name":"department_store","key":"department_store","names":["department_store"],"emoji":"🏬","category":"Travel & Places"},{"name":"meat_on_bone","key":"meat_on_bone","names":["meat_on_bone"],"emoji":"🍖","category":"Food & Drink"},{"name":"arrow_upper_left","key":"arrow_upper_left","names":["arrow_upper_left"],"emoji":"↖️","category":"Symbols"},{"name":"flag-bm","key":"flag-bm","names":["flag-bm"],"emoji":"🇧🇲","category":"Flags"},{"name":"sleepy","key":"sleepy","names":["sleepy"],"emoji":"😪","category":"Smileys & People"},{"name":"bowling","key":"bowling","names":["bowling"],"emoji":"🎳","category":"Activities"},{"name":"factory","key":"factory","names":["factory"],"emoji":"🏭","category":"Travel & Places"},{"name":"desktop_computer","key":"desktop_computer","names":["desktop_computer"],"emoji":"🖥️","category":"Objects"},{"name":"elephant","key":"elephant","names":["elephant"],"emoji":"🐘","category":"Animals & Nature"},{"name":"rhinoceros","key":"rhinoceros","names":["rhinoceros"],"emoji":"🦏","category":"Animals & Nature"},{"name":"arrow_up_down","key":"arrow_up_down","names":["arrow_up_down"],"emoji":"↕️","category":"Symbols"},{"name":"cricket_bat_and_ball","key":"cricket_bat_and_ball","names":["cricket_bat_and_ball"],"emoji":"🏏","category":"Activities"},{"name":"printer","key":"printer","names":["printer"],"emoji":"🖨️","category":"Objects"},{"name":"poultry_leg","key":"poultry_leg","names":["poultry_leg"],"emoji":"🍗","category":"Food & Drink"},{"name":"tired_face","key":"tired_face","names":["tired_face"],"emoji":"😫","category":"Smileys & People"},{"name":"japanese_castle","key":"japanese_castle","names":["japanese_castle"],"emoji":"🏯","category":"Travel & Places"},{"name":"flag-bn","key":"flag-bn","names":["flag-bn"],"emoji":"🇧🇳","category":"Flags"},{"name":"field_hockey_stick_and_ball","key":"field_hockey_stick_and_ball","names":["field_hockey_stick_and_ball"],"emoji":"🏑","category":"Activities"},{"name":"sleeping","key":"sleeping","names":["sleeping"],"emoji":"😴","category":"Smileys & People"},{"name":"left_right_arrow","key":"left_right_arrow","names":["left_right_arrow"],"emoji":"↔️","category":"Symbols"},{"name":"keyboard","key":"keyboard","names":["keyboard"],"emoji":"⌨️","category":"Objects"},{"name":"european_castle","key":"european_castle","names":["european_castle"],"emoji":"🏰","category":"Travel & Places"},{"name":"mouse","key":"mouse","names":["mouse"],"emoji":"🐭","category":"Animals & Nature"},{"name":"flag-bo","key":"flag-bo","names":["flag-bo"],"emoji":"🇧🇴","category":"Flags"},{"name":"cut_of_meat","key":"cut_of_meat","names":["cut_of_meat"],"emoji":"🥩","category":"Food & Drink"},{"name":"ice_hockey_stick_and_puck","key":"ice_hockey_stick_and_puck","names":["ice_hockey_stick_and_puck"],"emoji":"🏒","category":"Activities"},{"name":"mouse2","key":"mouse2","names":["mouse2"],"emoji":"🐁","category":"Animals & Nature"},{"name":"three_button_mouse","key":"three_button_mouse","names":["three_button_mouse"],"emoji":"🖱️","category":"Objects"},{"name":"leftwards_arrow_with_hook","key":"leftwards_arrow_with_hook","names":["leftwards_arrow_with_hook"],"emoji":"↩️","category":"Symbols"},{"name":"bacon","key":"bacon","names":["bacon"],"emoji":"🥓","category":"Food & Drink"},{"name":"relieved","key":"relieved","names":["relieved"],"emoji":"😌","category":"Smileys & People"},{"name":"flag-bq","key":"flag-bq","names":["flag-bq"],"emoji":"🇧🇶","category":"Flags"},{"name":"wedding","key":"wedding","names":["wedding"],"emoji":"💒","category":"Travel & Places"},{"name":"tokyo_tower","key":"tokyo_tower","names":["tokyo_tower"],"emoji":"🗼","category":"Travel & Places"},{"name":"arrow_right_hook","key":"arrow_right_hook","names":["arrow_right_hook"],"emoji":"↪️","category":"Symbols"},{"name":"hamburger","key":"hamburger","names":["hamburger"],"emoji":"🍔","category":"Food & Drink"},{"name":"stuck_out_tongue","key":"stuck_out_tongue","names":["stuck_out_tongue"],"emoji":"😛","category":"Smileys & People"},{"name":"trackball","key":"trackball","names":["trackball"],"emoji":"🖲️","category":"Objects"},{"name":"flag-br","key":"flag-br","names":["flag-br"],"emoji":"🇧🇷","category":"Flags"},{"name":"rat","key":"rat","names":["rat"],"emoji":"🐀","category":"Animals & Nature"},{"name":"table_tennis_paddle_and_ball","key":"table_tennis_paddle_and_ball","names":["table_tennis_paddle_and_ball"],"emoji":"🏓","category":"Activities"},{"name":"minidisc","key":"minidisc","names":["minidisc"],"emoji":"💽","category":"Objects"},{"name":"stuck_out_tongue_winking_eye","key":"stuck_out_tongue_winking_eye","names":["stuck_out_tongue_winking_eye"],"emoji":"😜","category":"Smileys & People"},{"name":"fries","key":"fries","names":["fries"],"emoji":"🍟","category":"Food & Drink"},{"name":"badminton_racquet_and_shuttlecock","key":"badminton_racquet_and_shuttlecock","names":["badminton_racquet_and_shuttlecock"],"emoji":"🏸","category":"Activities"},{"name":"statue_of_liberty","key":"statue_of_liberty","names":["statue_of_liberty"],"emoji":"🗽","category":"Travel & Places"},{"name":"flag-bs","key":"flag-bs","names":["flag-bs"],"emoji":"🇧🇸","category":"Flags"},{"name":"arrow_heading_up","key":"arrow_heading_up","names":["arrow_heading_up"],"emoji":"⤴️","category":"Symbols"},{"name":"hamster","key":"hamster","names":["hamster"],"emoji":"🐹","category":"Animals & Nature"},{"name":"stuck_out_tongue_closed_eyes","key":"stuck_out_tongue_closed_eyes","names":["stuck_out_tongue_closed_eyes"],"emoji":"😝","category":"Smileys & People"},{"name":"pizza","key":"pizza","names":["pizza"],"emoji":"🍕","category":"Food & Drink"},{"name":"boxing_glove","key":"boxing_glove","names":["boxing_glove"],"emoji":"🥊","category":"Activities"},{"name":"floppy_disk","key":"floppy_disk","names":["floppy_disk"],"emoji":"💾","category":"Objects"},{"name":"arrow_heading_down","key":"arrow_heading_down","names":["arrow_heading_down"],"emoji":"⤵️","category":"Symbols"},{"name":"flag-bt","key":"flag-bt","names":["flag-bt"],"emoji":"🇧🇹","category":"Flags"},{"name":"rabbit","key":"rabbit","names":["rabbit"],"emoji":"🐰","category":"Animals & Nature"},{"name":"church","key":"church","names":["church"],"emoji":"⛪","category":"Travel & Places"},{"name":"drooling_face","key":"drooling_face","names":["drooling_face"],"emoji":"🤤","category":"Smileys & People"},{"name":"flag-bv","key":"flag-bv","names":["flag-bv"],"emoji":"🇧🇻","category":"Flags"},{"name":"mosque","key":"mosque","names":["mosque"],"emoji":"🕌","category":"Travel & Places"},{"name":"rabbit2","key":"rabbit2","names":["rabbit2"],"emoji":"🐇","category":"Animals & Nature"},{"name":"hotdog","key":"hotdog","names":["hotdog"],"emoji":"🌭","category":"Food & Drink"},{"name":"martial_arts_uniform","key":"martial_arts_uniform","names":["martial_arts_uniform"],"emoji":"🥋","category":"Activities"},{"name":"arrows_clockwise","key":"arrows_clockwise","names":["arrows_clockwise"],"emoji":"🔃","category":"Symbols"},{"name":"cd","key":"cd","names":["cd"],"emoji":"💿","category":"Objects"},{"name":"arrows_counterclockwise","key":"arrows_counterclockwise","names":["arrows_counterclockwise"],"emoji":"🔄","category":"Symbols"},{"name":"sandwich","key":"sandwich","names":["sandwich"],"emoji":"🥪","category":"Food & Drink"},{"name":"chipmunk","key":"chipmunk","names":["chipmunk"],"emoji":"🐿️","category":"Animals & Nature"},{"name":"synagogue","key":"synagogue","names":["synagogue"],"emoji":"🕍","category":"Travel & Places"},{"name":"unamused","key":"unamused","names":["unamused"],"emoji":"😒","category":"Smileys & People"},{"name":"goal_net","key":"goal_net","names":["goal_net"],"emoji":"🥅","category":"Activities"},{"name":"flag-bw","key":"flag-bw","names":["flag-bw"],"emoji":"🇧🇼","category":"Flags"},{"name":"dvd","key":"dvd","names":["dvd"],"emoji":"📀","category":"Objects"},{"name":"hedgehog","key":"hedgehog","names":["hedgehog"],"emoji":"🦔","category":"Animals & Nature"},{"name":"dart","key":"dart","names":["dart"],"emoji":"🎯","category":"Activities"},{"name":"taco","key":"taco","names":["taco"],"emoji":"🌮","category":"Food & Drink"},{"name":"back","key":"back","names":["back"],"emoji":"🔙","category":"Symbols"},{"name":"flag-by","key":"flag-by","names":["flag-by"],"emoji":"🇧🇾","category":"Flags"},{"name":"shinto_shrine","key":"shinto_shrine","names":["shinto_shrine"],"emoji":"⛩️","category":"Travel & Places"},{"name":"movie_camera","key":"movie_camera","names":["movie_camera"],"emoji":"🎥","category":"Objects"},{"name":"sweat","key":"sweat","names":["sweat"],"emoji":"😓","category":"Smileys & People"},{"name":"burrito","key":"burrito","names":["burrito"],"emoji":"🌯","category":"Food & Drink"},{"name":"flag-bz","key":"flag-bz","names":["flag-bz"],"emoji":"🇧🇿","category":"Flags"},{"name":"pensive","key":"pensive","names":["pensive"],"emoji":"😔","category":"Smileys & People"},{"name":"kaaba","key":"kaaba","names":["kaaba"],"emoji":"🕋","category":"Travel & Places"},{"name":"film_frames","key":"film_frames","names":["film_frames"],"emoji":"🎞️","category":"Objects"},{"name":"bat","key":"bat","names":["bat"],"emoji":"🦇","category":"Animals & Nature"},{"name":"golf","key":"golf","names":["golf"],"emoji":"⛳","category":"Activities"},{"name":"end","key":"end","names":["end"],"emoji":"🔚","category":"Symbols"},{"name":"film_projector","key":"film_projector","names":["film_projector"],"emoji":"📽️","category":"Objects"},{"name":"bear","key":"bear","names":["bear"],"emoji":"🐻","category":"Animals & Nature"},{"name":"ice_skate","key":"ice_skate","names":["ice_skate"],"emoji":"⛸️","category":"Activities"},{"name":"fountain","key":"fountain","names":["fountain"],"emoji":"⛲","category":"Travel & Places"},{"name":"confused","key":"confused","names":["confused"],"emoji":"😕","category":"Smileys & People"},{"name":"flag-ca","key":"flag-ca","names":["flag-ca"],"emoji":"🇨🇦","category":"Flags"},{"name":"on","key":"on","names":["on"],"emoji":"🔛","category":"Symbols"},{"name":"stuffed_flatbread","key":"stuffed_flatbread","names":["stuffed_flatbread"],"emoji":"🥙","category":"Food & Drink"},{"name":"soon","key":"soon","names":["soon"],"emoji":"🔜","category":"Symbols"},{"name":"upside_down_face","key":"upside_down_face","names":["upside_down_face"],"emoji":"🙃","category":"Smileys & People"},{"name":"fishing_pole_and_fish","key":"fishing_pole_and_fish","names":["fishing_pole_and_fish"],"emoji":"🎣","category":"Activities"},{"name":"tent","key":"tent","names":["tent"],"emoji":"⛺","category":"Travel & Places"},{"name":"clapper","key":"clapper","names":["clapper"],"emoji":"🎬","category":"Objects"},{"name":"egg","key":"egg","names":["egg"],"emoji":"🥚","category":"Food & Drink"},{"name":"flag-cc","key":"flag-cc","names":["flag-cc"],"emoji":"🇨🇨","category":"Flags"},{"name":"koala","key":"koala","names":["koala"],"emoji":"🐨","category":"Animals & Nature"},{"name":"foggy","key":"foggy","names":["foggy"],"emoji":"🌁","category":"Travel & Places"},{"name":"tv","key":"tv","names":["tv"],"emoji":"📺","category":"Objects"},{"name":"panda_face","key":"panda_face","names":["panda_face"],"emoji":"🐼","category":"Animals & Nature"},{"name":"fried_egg","key":"fried_egg","names":["fried_egg","cooking"],"emoji":"🍳","category":"Food & Drink"},{"name":"top","key":"top","names":["top"],"emoji":"🔝","category":"Symbols"},{"name":"flag-cd","key":"flag-cd","names":["flag-cd"],"emoji":"🇨🇩","category":"Flags"},{"name":"money_mouth_face","key":"money_mouth_face","names":["money_mouth_face"],"emoji":"🤑","category":"Smileys & People"},{"name":"running_shirt_with_sash","key":"running_shirt_with_sash","names":["running_shirt_with_sash"],"emoji":"🎽","category":"Activities"},{"name":"astonished","key":"astonished","names":["astonished"],"emoji":"😲","category":"Smileys & People"},{"name":"feet","key":"feet","names":["feet","paw_prints"],"emoji":"🐾","category":"Animals & Nature"},{"name":"camera","key":"camera","names":["camera"],"emoji":"📷","category":"Objects"},{"name":"flag-cf","key":"flag-cf","names":["flag-cf"],"emoji":"🇨🇫","category":"Flags"},{"name":"place_of_worship","key":"place_of_worship","names":["place_of_worship"],"emoji":"🛐","category":"Symbols"},{"name":"night_with_stars","key":"night_with_stars","names":["night_with_stars"],"emoji":"🌃","category":"Travel & Places"},{"name":"ski","key":"ski","names":["ski"],"emoji":"🎿","category":"Activities"},{"name":"shallow_pan_of_food","key":"shallow_pan_of_food","names":["shallow_pan_of_food"],"emoji":"🥘","category":"Food & Drink"},{"name":"camera_with_flash","key":"camera_with_flash","names":["camera_with_flash"],"emoji":"📸","category":"Objects"},{"name":"sunrise_over_mountains","key":"sunrise_over_mountains","names":["sunrise_over_mountains"],"emoji":"🌄","category":"Travel & Places"},{"name":"turkey","key":"turkey","names":["turkey"],"emoji":"🦃","category":"Animals & Nature"},{"name":"white_frowning_face","key":"white_frowning_face","names":["white_frowning_face"],"emoji":"☹️","category":"Smileys & People"},{"name":"flag-cg","key":"flag-cg","names":["flag-cg"],"emoji":"🇨🇬","category":"Flags"},{"name":"stew","key":"stew","names":["stew"],"emoji":"🍲","category":"Food & Drink"},{"name":"sled","key":"sled","names":["sled"],"emoji":"🛷","category":"Activities"},{"name":"atom_symbol","key":"atom_symbol","names":["atom_symbol"],"emoji":"⚛️","category":"Symbols"},{"name":"curling_stone","key":"curling_stone","names":["curling_stone"],"emoji":"🥌","category":"Activities"},{"name":"slightly_frowning_face","key":"slightly_frowning_face","names":["slightly_frowning_face"],"emoji":"🙁","category":"Smileys & People"},{"name":"sunrise","key":"sunrise","names":["sunrise"],"emoji":"🌅","category":"Travel & Places"},{"name":"om_symbol","key":"om_symbol","names":["om_symbol"],"emoji":"🕉️","category":"Symbols"},{"name":"chicken","key":"chicken","names":["chicken"],"emoji":"🐔","category":"Animals & Nature"},{"name":"bowl_with_spoon","key":"bowl_with_spoon","names":["bowl_with_spoon"],"emoji":"🥣","category":"Food & Drink"},{"name":"flag-ch","key":"flag-ch","names":["flag-ch"],"emoji":"🇨🇭","category":"Flags"},{"name":"video_camera","key":"video_camera","names":["video_camera"],"emoji":"📹","category":"Objects"},{"name":"video_game","key":"video_game","names":["video_game"],"emoji":"🎮","category":"Activities"},{"name":"rooster","key":"rooster","names":["rooster"],"emoji":"🐓","category":"Animals & Nature"},{"name":"vhs","key":"vhs","names":["vhs"],"emoji":"📼","category":"Objects"},{"name":"city_sunset","key":"city_sunset","names":["city_sunset"],"emoji":"🌆","category":"Travel & Places"},{"name":"confounded","key":"confounded","names":["confounded"],"emoji":"😖","category":"Smileys & People"},{"name":"green_salad","key":"green_salad","names":["green_salad"],"emoji":"🥗","category":"Food & Drink"},{"name":"star_of_david","key":"star_of_david","names":["star_of_david"],"emoji":"✡️","category":"Symbols"},{"name":"flag-ci","key":"flag-ci","names":["flag-ci"],"emoji":"🇨🇮","category":"Flags"},{"name":"popcorn","key":"popcorn","names":["popcorn"],"emoji":"🍿","category":"Food & Drink"},{"name":"city_sunrise","key":"city_sunrise","names":["city_sunrise"],"emoji":"🌇","category":"Travel & Places"},{"name":"disappointed","key":"disappointed","names":["disappointed"],"emoji":"😞","category":"Smileys & People"},{"name":"mag","key":"mag","names":["mag"],"emoji":"🔍","category":"Objects"},{"name":"hatching_chick","key":"hatching_chick","names":["hatching_chick"],"emoji":"🐣","category":"Animals & Nature"},{"name":"joystick","key":"joystick","names":["joystick"],"emoji":"🕹️","category":"Activities"},{"name":"wheel_of_dharma","key":"wheel_of_dharma","names":["wheel_of_dharma"],"emoji":"☸️","category":"Symbols"},{"name":"flag-ck","key":"flag-ck","names":["flag-ck"],"emoji":"🇨🇰","category":"Flags"},{"name":"canned_food","key":"canned_food","names":["canned_food"],"emoji":"🥫","category":"Food & Drink"},{"name":"worried","key":"worried","names":["worried"],"emoji":"😟","category":"Smileys & People"},{"name":"baby_chick","key":"baby_chick","names":["baby_chick"],"emoji":"🐤","category":"Animals & Nature"},{"name":"flag-cl","key":"flag-cl","names":["flag-cl"],"emoji":"🇨🇱","category":"Flags"},{"name":"game_die","key":"game_die","names":["game_die"],"emoji":"🎲","category":"Activities"},{"name":"mag_right","key":"mag_right","names":["mag_right"],"emoji":"🔎","category":"Objects"},{"name":"yin_yang","key":"yin_yang","names":["yin_yang"],"emoji":"☯️","category":"Symbols"},{"name":"bridge_at_night","key":"bridge_at_night","names":["bridge_at_night"],"emoji":"🌉","category":"Travel & Places"},{"name":"spades","key":"spades","names":["spades"],"emoji":"♠️","category":"Activities"},{"name":"hatched_chick","key":"hatched_chick","names":["hatched_chick"],"emoji":"🐥","category":"Animals & Nature"},{"name":"flag-cm","key":"flag-cm","names":["flag-cm"],"emoji":"🇨🇲","category":"Flags"},{"name":"latin_cross","key":"latin_cross","names":["latin_cross"],"emoji":"✝️","category":"Symbols"},{"name":"triumph","key":"triumph","names":["triumph"],"emoji":"😤","category":"Smileys & People"},{"name":"hotsprings","key":"hotsprings","names":["hotsprings"],"emoji":"♨️","category":"Travel & Places"},{"name":"bento","key":"bento","names":["bento"],"emoji":"🍱","category":"Food & Drink"},{"name":"microscope","key":"microscope","names":["microscope"],"emoji":"🔬","category":"Objects"},{"name":"cry","key":"cry","names":["cry"],"emoji":"😢","category":"Smileys & People"},{"name":"bird","key":"bird","names":["bird"],"emoji":"🐦","category":"Animals & Nature"},{"name":"cn","key":"cn","names":["cn","flag-cn"],"emoji":"🇨🇳","category":"Flags"},{"name":"telescope","key":"telescope","names":["telescope"],"emoji":"🔭","category":"Objects"},{"name":"rice_cracker","key":"rice_cracker","names":["rice_cracker"],"emoji":"🍘","category":"Food & Drink"},{"name":"hearts","key":"hearts","names":["hearts"],"emoji":"♥️","category":"Activities"},{"name":"orthodox_cross","key":"orthodox_cross","names":["orthodox_cross"],"emoji":"☦️","category":"Symbols"},{"name":"milky_way","key":"milky_way","names":["milky_way"],"emoji":"🌌","category":"Travel & Places"},{"name":"rice_ball","key":"rice_ball","names":["rice_ball"],"emoji":"🍙","category":"Food & Drink"},{"name":"satellite_antenna","key":"satellite_antenna","names":["satellite_antenna"],"emoji":"📡","category":"Objects"},{"name":"flag-co","key":"flag-co","names":["flag-co"],"emoji":"🇨🇴","category":"Flags"},{"name":"carousel_horse","key":"carousel_horse","names":["carousel_horse"],"emoji":"🎠","category":"Travel & Places"},{"name":"sob","key":"sob","names":["sob"],"emoji":"😭","category":"Smileys & People"},{"name":"diamonds","key":"diamonds","names":["diamonds"],"emoji":"♦️","category":"Activities"},{"name":"star_and_crescent","key":"star_and_crescent","names":["star_and_crescent"],"emoji":"☪️","category":"Symbols"},{"name":"penguin","key":"penguin","names":["penguin"],"emoji":"🐧","category":"Animals & Nature"},{"name":"dove_of_peace","key":"dove_of_peace","names":["dove_of_peace"],"emoji":"🕊️","category":"Animals & Nature"},{"name":"flag-cp","key":"flag-cp","names":["flag-cp"],"emoji":"🇨🇵","category":"Flags"},{"name":"ferris_wheel","key":"ferris_wheel","names":["ferris_wheel"],"emoji":"🎡","category":"Travel & Places"},{"name":"clubs","key":"clubs","names":["clubs"],"emoji":"♣️","category":"Activities"},{"name":"peace_symbol","key":"peace_symbol","names":["peace_symbol"],"emoji":"☮️","category":"Symbols"},{"name":"candle","key":"candle","names":["candle"],"emoji":"🕯️","category":"Objects"},{"name":"frowning","key":"frowning","names":["frowning"],"emoji":"😦","category":"Smileys & People"},{"name":"rice","key":"rice","names":["rice"],"emoji":"🍚","category":"Food & Drink"},{"name":"flag-cr","key":"flag-cr","names":["flag-cr"],"emoji":"🇨🇷","category":"Flags"},{"name":"roller_coaster","key":"roller_coaster","names":["roller_coaster"],"emoji":"🎢","category":"Travel & Places"},{"name":"menorah_with_nine_branches","key":"menorah_with_nine_branches","names":["menorah_with_nine_branches"],"emoji":"🕎","category":"Symbols"},{"name":"black_joker","key":"black_joker","names":["black_joker"],"emoji":"🃏","category":"Activities"},{"name":"eagle","key":"eagle","names":["eagle"],"emoji":"🦅","category":"Animals & Nature"},{"name":"curry","key":"curry","names":["curry"],"emoji":"🍛","category":"Food & Drink"},{"name":"bulb","key":"bulb","names":["bulb"],"emoji":"💡","category":"Objects"},{"name":"anguished","key":"anguished","names":["anguished"],"emoji":"😧","category":"Smileys & People"},{"name":"flag-cu","key":"flag-cu","names":["flag-cu"],"emoji":"🇨🇺","category":"Flags"},{"name":"barber","key":"barber","names":["barber"],"emoji":"💈","category":"Travel & Places"},{"name":"duck","key":"duck","names":["duck"],"emoji":"🦆","category":"Animals & Nature"},{"name":"six_pointed_star","key":"six_pointed_star","names":["six_pointed_star"],"emoji":"🔯","category":"Symbols"},{"name":"ramen","key":"ramen","names":["ramen"],"emoji":"🍜","category":"Food & Drink"},{"name":"flashlight","key":"flashlight","names":["flashlight"],"emoji":"🔦","category":"Objects"},{"name":"mahjong","key":"mahjong","names":["mahjong"],"emoji":"🀄","category":"Activities"},{"name":"fearful","key":"fearful","names":["fearful"],"emoji":"😨","category":"Smileys & People"},{"name":"aries","key":"aries","names":["aries"],"emoji":"♈","category":"Symbols"},{"name":"spaghetti","key":"spaghetti","names":["spaghetti"],"emoji":"🍝","category":"Food & Drink"},{"name":"circus_tent","key":"circus_tent","names":["circus_tent"],"emoji":"🎪","category":"Travel & Places"},{"name":"izakaya_lantern","key":"izakaya_lantern","names":["izakaya_lantern","lantern"],"emoji":"🏮","category":"Objects"},{"name":"flag-cv","key":"flag-cv","names":["flag-cv"],"emoji":"🇨🇻","category":"Flags"},{"name":"weary","key":"weary","names":["weary"],"emoji":"😩","category":"Smileys & People"},{"name":"flower_playing_cards","key":"flower_playing_cards","names":["flower_playing_cards"],"emoji":"🎴","category":"Activities"},{"name":"owl","key":"owl","names":["owl"],"emoji":"🦉","category":"Animals & Nature"},{"name":"performing_arts","key":"performing_arts","names":["performing_arts"],"emoji":"🎭","category":"Travel & Places"},{"name":"frog","key":"frog","names":["frog"],"emoji":"🐸","category":"Animals & Nature"},{"name":"flag-cw","key":"flag-cw","names":["flag-cw"],"emoji":"🇨🇼","category":"Flags"},{"name":"notebook_with_decorative_cover","key":"notebook_with_decorative_cover","names":["notebook_with_decorative_cover"],"emoji":"📔","category":"Objects"},{"name":"exploding_head","key":"exploding_head","names":["exploding_head","shocked_face_with_exploding_head"],"emoji":"🤯","category":"Smileys & People"},{"name":"taurus","key":"taurus","names":["taurus"],"emoji":"♉","category":"Symbols"},{"name":"sweet_potato","key":"sweet_potato","names":["sweet_potato"],"emoji":"🍠","category":"Food & Drink"},{"name":"closed_book","key":"closed_book","names":["closed_book"],"emoji":"📕","category":"Objects"},{"name":"gemini","key":"gemini","names":["gemini"],"emoji":"♊","category":"Symbols"},{"name":"frame_with_picture","key":"frame_with_picture","names":["frame_with_picture"],"emoji":"🖼️","category":"Travel & Places"},{"name":"flag-cx","key":"flag-cx","names":["flag-cx"],"emoji":"🇨🇽","category":"Flags"},{"name":"grimacing","key":"grimacing","names":["grimacing"],"emoji":"😬","category":"Smileys & People"},{"name":"crocodile","key":"crocodile","names":["crocodile"],"emoji":"🐊","category":"Animals & Nature"},{"name":"oden","key":"oden","names":["oden"],"emoji":"🍢","category":"Food & Drink"},{"name":"flag-cy","key":"flag-cy","names":["flag-cy"],"emoji":"🇨🇾","category":"Flags"},{"name":"book","key":"book","names":["book","open_book"],"emoji":"📖","category":"Objects"},{"name":"turtle","key":"turtle","names":["turtle"],"emoji":"🐢","category":"Animals & Nature"},{"name":"art","key":"art","names":["art"],"emoji":"🎨","category":"Travel & Places"},{"name":"sushi","key":"sushi","names":["sushi"],"emoji":"🍣","category":"Food & Drink"},{"name":"cold_sweat","key":"cold_sweat","names":["cold_sweat"],"emoji":"😰","category":"Smileys & People"},{"name":"cancer","key":"cancer","names":["cancer"],"emoji":"♋","category":"Symbols"},{"name":"fried_shrimp","key":"fried_shrimp","names":["fried_shrimp"],"emoji":"🍤","category":"Food & Drink"},{"name":"slot_machine","key":"slot_machine","names":["slot_machine"],"emoji":"🎰","category":"Travel & Places"},{"name":"scream","key":"scream","names":["scream"],"emoji":"😱","category":"Smileys & People"},{"name":"green_book","key":"green_book","names":["green_book"],"emoji":"📗","category":"Objects"},{"name":"leo","key":"leo","names":["leo"],"emoji":"♌","category":"Symbols"},{"name":"flag-cz","key":"flag-cz","names":["flag-cz"],"emoji":"🇨🇿","category":"Flags"},{"name":"lizard","key":"lizard","names":["lizard"],"emoji":"🦎","category":"Animals & Nature"},{"name":"virgo","key":"virgo","names":["virgo"],"emoji":"♍","category":"Symbols"},{"name":"steam_locomotive","key":"steam_locomotive","names":["steam_locomotive"],"emoji":"🚂","category":"Travel & Places"},{"name":"de","key":"de","names":["de","flag-de"],"emoji":"🇩🇪","category":"Flags"},{"name":"flushed","key":"flushed","names":["flushed"],"emoji":"😳","category":"Smileys & People"},{"name":"blue_book","key":"blue_book","names":["blue_book"],"emoji":"📘","category":"Objects"},{"name":"snake","key":"snake","names":["snake"],"emoji":"🐍","category":"Animals & Nature"},{"name":"fish_cake","key":"fish_cake","names":["fish_cake"],"emoji":"🍥","category":"Food & Drink"},{"name":"railway_car","key":"railway_car","names":["railway_car"],"emoji":"🚃","category":"Travel & Places"},{"name":"dango","key":"dango","names":["dango"],"emoji":"🍡","category":"Food & Drink"},{"name":"orange_book","key":"orange_book","names":["orange_book"],"emoji":"📙","category":"Objects"},{"name":"libra","key":"libra","names":["libra"],"emoji":"♎","category":"Symbols"},{"name":"dragon_face","key":"dragon_face","names":["dragon_face"],"emoji":"🐲","category":"Animals & Nature"},{"name":"flag-dg","key":"flag-dg","names":["flag-dg"],"emoji":"🇩🇬","category":"Flags"},{"name":"zany_face","key":"zany_face","names":["zany_face","grinning_face_with_one_large_and_one_small_eye"],"emoji":"🤪","category":"Smileys & People"},{"name":"books","key":"books","names":["books"],"emoji":"📚","category":"Objects"},{"name":"dragon","key":"dragon","names":["dragon"],"emoji":"🐉","category":"Animals & Nature"},{"name":"flag-dj","key":"flag-dj","names":["flag-dj"],"emoji":"🇩🇯","category":"Flags"},{"name":"dumpling","key":"dumpling","names":["dumpling"],"emoji":"🥟","category":"Food & Drink"},{"name":"dizzy_face","key":"dizzy_face","names":["dizzy_face"],"emoji":"😵","category":"Smileys & People"},{"name":"scorpius","key":"scorpius","names":["scorpius"],"emoji":"♏","category":"Symbols"},{"name":"bullettrain_side","key":"bullettrain_side","names":["bullettrain_side"],"emoji":"🚄","category":"Travel & Places"},{"name":"bullettrain_front","key":"bullettrain_front","names":["bullettrain_front"],"emoji":"🚅","category":"Travel & Places"},{"name":"notebook","key":"notebook","names":["notebook"],"emoji":"📓","category":"Objects"},{"name":"fortune_cookie","key":"fortune_cookie","names":["fortune_cookie"],"emoji":"🥠","category":"Food & Drink"},{"name":"sagittarius","key":"sagittarius","names":["sagittarius"],"emoji":"♐","category":"Symbols"},{"name":"sauropod","key":"sauropod","names":["sauropod"],"emoji":"🦕","category":"Animals & Nature"},{"name":"flag-dk","key":"flag-dk","names":["flag-dk"],"emoji":"🇩🇰","category":"Flags"},{"name":"rage","key":"rage","names":["rage"],"emoji":"😡","category":"Smileys & People"},{"name":"ledger","key":"ledger","names":["ledger"],"emoji":"📒","category":"Objects"},{"name":"angry","key":"angry","names":["angry"],"emoji":"😠","category":"Smileys & People"},{"name":"t-rex","key":"t-rex","names":["t-rex"],"emoji":"🦖","category":"Animals & Nature"},{"name":"capricorn","key":"capricorn","names":["capricorn"],"emoji":"♑","category":"Symbols"},{"name":"takeout_box","key":"takeout_box","names":["takeout_box"],"emoji":"🥡","category":"Food & Drink"},{"name":"flag-dm","key":"flag-dm","names":["flag-dm"],"emoji":"🇩🇲","category":"Flags"},{"name":"train2","key":"train2","names":["train2"],"emoji":"🚆","category":"Travel & Places"},{"name":"page_with_curl","key":"page_with_curl","names":["page_with_curl"],"emoji":"📃","category":"Objects"},{"name":"whale","key":"whale","names":["whale"],"emoji":"🐳","category":"Animals & Nature"},{"name":"face_with_symbols_on_mouth","key":"face_with_symbols_on_mouth","names":["face_with_symbols_on_mouth","serious_face_with_symbols_covering_mouth"],"emoji":"🤬","category":"Smileys & People"},{"name":"flag-do","key":"flag-do","names":["flag-do"],"emoji":"🇩🇴","category":"Flags"},{"name":"metro","key":"metro","names":["metro"],"emoji":"🚇","category":"Travel & Places"},{"name":"icecream","key":"icecream","names":["icecream"],"emoji":"🍦","category":"Food & Drink"},{"name":"aquarius","key":"aquarius","names":["aquarius"],"emoji":"♒","category":"Symbols"},{"name":"flag-dz","key":"flag-dz","names":["flag-dz"],"emoji":"🇩🇿","category":"Flags"},{"name":"whale2","key":"whale2","names":["whale2"],"emoji":"🐋","category":"Animals & Nature"},{"name":"mask","key":"mask","names":["mask"],"emoji":"😷","category":"Smileys & People"},{"name":"scroll","key":"scroll","names":["scroll"],"emoji":"📜","category":"Objects"},{"name":"shaved_ice","key":"shaved_ice","names":["shaved_ice"],"emoji":"🍧","category":"Food & Drink"},{"name":"pisces","key":"pisces","names":["pisces"],"emoji":"♓","category":"Symbols"},{"name":"light_rail","key":"light_rail","names":["light_rail"],"emoji":"🚈","category":"Travel & Places"},{"name":"dolphin","key":"dolphin","names":["dolphin","flipper"],"emoji":"🐬","category":"Animals & Nature"},{"name":"face_with_thermometer","key":"face_with_thermometer","names":["face_with_thermometer"],"emoji":"🤒","category":"Smileys & People"},{"name":"flag-ea","key":"flag-ea","names":["flag-ea"],"emoji":"🇪🇦","category":"Flags"},{"name":"ophiuchus","key":"ophiuchus","names":["ophiuchus"],"emoji":"⛎","category":"Symbols"},{"name":"station","key":"station","names":["station"],"emoji":"🚉","category":"Travel & Places"},{"name":"ice_cream","key":"ice_cream","names":["ice_cream"],"emoji":"🍨","category":"Food & Drink"},{"name":"page_facing_up","key":"page_facing_up","names":["page_facing_up"],"emoji":"📄","category":"Objects"},{"name":"doughnut","key":"doughnut","names":["doughnut"],"emoji":"🍩","category":"Food & Drink"},{"name":"face_with_head_bandage","key":"face_with_head_bandage","names":["face_with_head_bandage"],"emoji":"🤕","category":"Smileys & People"},{"name":"fish","key":"fish","names":["fish"],"emoji":"🐟","category":"Animals & Nature"},{"name":"newspaper","key":"newspaper","names":["newspaper"],"emoji":"📰","category":"Objects"},{"name":"tram","key":"tram","names":["tram"],"emoji":"🚊","category":"Travel & Places"},{"name":"flag-ec","key":"flag-ec","names":["flag-ec"],"emoji":"🇪🇨","category":"Flags"},{"name":"twisted_rightwards_arrows","key":"twisted_rightwards_arrows","names":["twisted_rightwards_arrows"],"emoji":"🔀","category":"Symbols"},{"name":"flag-ee","key":"flag-ee","names":["flag-ee"],"emoji":"🇪🇪","category":"Flags"},{"name":"cookie","key":"cookie","names":["cookie"],"emoji":"🍪","category":"Food & Drink"},{"name":"monorail","key":"monorail","names":["monorail"],"emoji":"🚝","category":"Travel & Places"},{"name":"tropical_fish","key":"tropical_fish","names":["tropical_fish"],"emoji":"🐠","category":"Animals & Nature"},{"name":"rolled_up_newspaper","key":"rolled_up_newspaper","names":["rolled_up_newspaper"],"emoji":"🗞️","category":"Objects"},{"name":"nauseated_face","key":"nauseated_face","names":["nauseated_face"],"emoji":"🤢","category":"Smileys & People"},{"name":"repeat","key":"repeat","names":["repeat"],"emoji":"🔁","category":"Symbols"},{"name":"bookmark_tabs","key":"bookmark_tabs","names":["bookmark_tabs"],"emoji":"📑","category":"Objects"},{"name":"repeat_one","key":"repeat_one","names":["repeat_one"],"emoji":"🔂","category":"Symbols"},{"name":"flag-eg","key":"flag-eg","names":["flag-eg"],"emoji":"🇪🇬","category":"Flags"},{"name":"mountain_railway","key":"mountain_railway","names":["mountain_railway"],"emoji":"🚞","category":"Travel & Places"},{"name":"birthday","key":"birthday","names":["birthday"],"emoji":"🎂","category":"Food & Drink"},{"name":"blowfish","key":"blowfish","names":["blowfish"],"emoji":"🐡","category":"Animals & Nature"},{"name":"face_vomiting","key":"face_vomiting","names":["face_vomiting","face_with_open_mouth_vomiting"],"emoji":"🤮","category":"Smileys & People"},{"name":"arrow_forward","key":"arrow_forward","names":["arrow_forward"],"emoji":"▶️","category":"Symbols"},{"name":"bookmark","key":"bookmark","names":["bookmark"],"emoji":"🔖","category":"Objects"},{"name":"flag-eh","key":"flag-eh","names":["flag-eh"],"emoji":"🇪🇭","category":"Flags"},{"name":"shark","key":"shark","names":["shark"],"emoji":"🦈","category":"Animals & Nature"},{"name":"train","key":"train","names":["train"],"emoji":"🚋","category":"Travel & Places"},{"name":"sneezing_face","key":"sneezing_face","names":["sneezing_face"],"emoji":"🤧","category":"Smileys & People"},{"name":"cake","key":"cake","names":["cake"],"emoji":"🍰","category":"Food & Drink"},{"name":"bus","key":"bus","names":["bus"],"emoji":"🚌","category":"Travel & Places"},{"name":"pie","key":"pie","names":["pie"],"emoji":"🥧","category":"Food & Drink"},{"name":"innocent","key":"innocent","names":["innocent"],"emoji":"😇","category":"Smileys & People"},{"name":"fast_forward","key":"fast_forward","names":["fast_forward"],"emoji":"⏩","category":"Symbols"},{"name":"label","key":"label","names":["label"],"emoji":"🏷️","category":"Objects"},{"name":"octopus","key":"octopus","names":["octopus"],"emoji":"🐙","category":"Animals & Nature"},{"name":"flag-er","key":"flag-er","names":["flag-er"],"emoji":"🇪🇷","category":"Flags"},{"name":"black_right_pointing_double_triangle_with_vertical_bar","key":"black_right_pointing_double_triangle_with_vertical_bar","names":["black_right_pointing_double_triangle_with_vertical_bar"],"emoji":"⏭️","category":"Symbols"},{"name":"chocolate_bar","key":"chocolate_bar","names":["chocolate_bar"],"emoji":"🍫","category":"Food & Drink"},{"name":"oncoming_bus","key":"oncoming_bus","names":["oncoming_bus"],"emoji":"🚍","category":"Travel & Places"},{"name":"shell","key":"shell","names":["shell"],"emoji":"🐚","category":"Animals & Nature"},{"name":"face_with_cowboy_hat","key":"face_with_cowboy_hat","names":["face_with_cowboy_hat"],"emoji":"🤠","category":"Smileys & People"},{"name":"moneybag","key":"moneybag","names":["moneybag"],"emoji":"💰","category":"Objects"},{"name":"es","key":"es","names":["es","flag-es"],"emoji":"🇪🇸","category":"Flags"},{"name":"crab","key":"crab","names":["crab"],"emoji":"🦀","category":"Animals & Nature"},{"name":"yen","key":"yen","names":["yen"],"emoji":"💴","category":"Objects"},{"name":"flag-et","key":"flag-et","names":["flag-et"],"emoji":"🇪🇹","category":"Flags"},{"name":"clown_face","key":"clown_face","names":["clown_face"],"emoji":"🤡","category":"Smileys & People"},{"name":"black_right_pointing_triangle_with_double_vertical_bar","key":"black_right_pointing_triangle_with_double_vertical_bar","names":["black_right_pointing_triangle_with_double_vertical_bar"],"emoji":"⏯️","category":"Symbols"},{"name":"trolleybus","key":"trolleybus","names":["trolleybus"],"emoji":"🚎","category":"Travel & Places"},{"name":"candy","key":"candy","names":["candy"],"emoji":"🍬","category":"Food & Drink"},{"name":"lying_face","key":"lying_face","names":["lying_face"],"emoji":"🤥","category":"Smileys & People"},{"name":"arrow_backward","key":"arrow_backward","names":["arrow_backward"],"emoji":"◀️","category":"Symbols"},{"name":"dollar","key":"dollar","names":["dollar"],"emoji":"💵","category":"Objects"},{"name":"shrimp","key":"shrimp","names":["shrimp"],"emoji":"🦐","category":"Animals & Nature"},{"name":"minibus","key":"minibus","names":["minibus"],"emoji":"🚐","category":"Travel & Places"},{"name":"flag-eu","key":"flag-eu","names":["flag-eu"],"emoji":"🇪🇺","category":"Flags"},{"name":"lollipop","key":"lollipop","names":["lollipop"],"emoji":"🍭","category":"Food & Drink"},{"name":"squid","key":"squid","names":["squid"],"emoji":"🦑","category":"Animals & Nature"},{"name":"euro","key":"euro","names":["euro"],"emoji":"💶","category":"Objects"},{"name":"flag-fi","key":"flag-fi","names":["flag-fi"],"emoji":"🇫🇮","category":"Flags"},{"name":"ambulance","key":"ambulance","names":["ambulance"],"emoji":"🚑","category":"Travel & Places"},{"name":"custard","key":"custard","names":["custard"],"emoji":"🍮","category":"Food & Drink"},{"name":"shushing_face","key":"shushing_face","names":["shushing_face","face_with_finger_covering_closed_lips"],"emoji":"🤫","category":"Smileys & People"},{"name":"rewind","key":"rewind","names":["rewind"],"emoji":"⏪","category":"Symbols"},{"name":"black_left_pointing_double_triangle_with_vertical_bar","key":"black_left_pointing_double_triangle_with_vertical_bar","names":["black_left_pointing_double_triangle_with_vertical_bar"],"emoji":"⏮️","category":"Symbols"},{"name":"face_with_hand_over_mouth","key":"face_with_hand_over_mouth","names":["face_with_hand_over_mouth","smiling_face_with_smiling_eyes_and_hand_covering_mouth"],"emoji":"🤭","category":"Smileys & People"},{"name":"flag-fj","key":"flag-fj","names":["flag-fj"],"emoji":"🇫🇯","category":"Flags"},{"name":"honey_pot","key":"honey_pot","names":["honey_pot"],"emoji":"🍯","category":"Food & Drink"},{"name":"snail","key":"snail","names":["snail"],"emoji":"🐌","category":"Animals & Nature"},{"name":"pound","key":"pound","names":["pound"],"emoji":"💷","category":"Objects"},{"name":"fire_engine","key":"fire_engine","names":["fire_engine"],"emoji":"🚒","category":"Travel & Places"},{"name":"baby_bottle","key":"baby_bottle","names":["baby_bottle"],"emoji":"🍼","category":"Food & Drink"},{"name":"flag-fk","key":"flag-fk","names":["flag-fk"],"emoji":"🇫🇰","category":"Flags"},{"name":"butterfly","key":"butterfly","names":["butterfly"],"emoji":"🦋","category":"Animals & Nature"},{"name":"money_with_wings","key":"money_with_wings","names":["money_with_wings"],"emoji":"💸","category":"Objects"},{"name":"face_with_monocle","key":"face_with_monocle","names":["face_with_monocle"],"emoji":"🧐","category":"Smileys & People"},{"name":"police_car","key":"police_car","names":["police_car"],"emoji":"🚓","category":"Travel & Places"},{"name":"arrow_up_small","key":"arrow_up_small","names":["arrow_up_small"],"emoji":"🔼","category":"Symbols"},{"name":"flag-fm","key":"flag-fm","names":["flag-fm"],"emoji":"🇫🇲","category":"Flags"},{"name":"glass_of_milk","key":"glass_of_milk","names":["glass_of_milk"],"emoji":"🥛","category":"Food & Drink"},{"name":"credit_card","key":"credit_card","names":["credit_card"],"emoji":"💳","category":"Objects"},{"name":"oncoming_police_car","key":"oncoming_police_car","names":["oncoming_police_car"],"emoji":"🚔","category":"Travel & Places"},{"name":"bug","key":"bug","names":["bug"],"emoji":"🐛","category":"Animals & Nature"},{"name":"nerd_face","key":"nerd_face","names":["nerd_face"],"emoji":"🤓","category":"Smileys & People"},{"name":"arrow_double_up","key":"arrow_double_up","names":["arrow_double_up"],"emoji":"⏫","category":"Symbols"},{"name":"chart","key":"chart","names":["chart"],"emoji":"💹","category":"Objects"},{"name":"flag-fo","key":"flag-fo","names":["flag-fo"],"emoji":"🇫🇴","category":"Flags"},{"name":"ant","key":"ant","names":["ant"],"emoji":"🐜","category":"Animals & Nature"},{"name":"arrow_down_small","key":"arrow_down_small","names":["arrow_down_small"],"emoji":"🔽","category":"Symbols"},{"name":"smiling_imp","key":"smiling_imp","names":["smiling_imp"],"emoji":"😈","category":"Smileys & People"},{"name":"taxi","key":"taxi","names":["taxi"],"emoji":"🚕","category":"Travel & Places"},{"name":"coffee","key":"coffee","names":["coffee"],"emoji":"☕","category":"Food & Drink"},{"name":"fr","key":"fr","names":["fr","flag-fr"],"emoji":"🇫🇷","category":"Flags"},{"name":"oncoming_taxi","key":"oncoming_taxi","names":["oncoming_taxi"],"emoji":"🚖","category":"Travel & Places"},{"name":"arrow_double_down","key":"arrow_double_down","names":["arrow_double_down"],"emoji":"⏬","category":"Symbols"},{"name":"imp","key":"imp","names":["imp"],"emoji":"👿","category":"Smileys & People"},{"name":"currency_exchange","key":"currency_exchange","names":["currency_exchange"],"emoji":"💱","category":"Objects"},{"name":"tea","key":"tea","names":["tea"],"emoji":"🍵","category":"Food & Drink"},{"name":"bee","key":"bee","names":["bee","honeybee"],"emoji":"🐝","category":"Animals & Nature"},{"name":"heavy_dollar_sign","key":"heavy_dollar_sign","names":["heavy_dollar_sign"],"emoji":"💲","category":"Objects"},{"name":"car","key":"car","names":["car","red_car"],"emoji":"🚗","category":"Travel & Places"},{"name":"sake","key":"sake","names":["sake"],"emoji":"🍶","category":"Food & Drink"},{"name":"flag-ga","key":"flag-ga","names":["flag-ga"],"emoji":"🇬🇦","category":"Flags"},{"name":"beetle","key":"beetle","names":["beetle"],"emoji":"🐞","category":"Animals & Nature"},{"name":"japanese_ogre","key":"japanese_ogre","names":["japanese_ogre"],"emoji":"👹","category":"Smileys & People"},{"name":"double_vertical_bar","key":"double_vertical_bar","names":["double_vertical_bar"],"emoji":"⏸️","category":"Symbols"},{"name":"champagne","key":"champagne","names":["champagne"],"emoji":"🍾","category":"Food & Drink"},{"name":"japanese_goblin","key":"japanese_goblin","names":["japanese_goblin"],"emoji":"👺","category":"Smileys & People"},{"name":"black_square_for_stop","key":"black_square_for_stop","names":["black_square_for_stop"],"emoji":"⏹️","category":"Symbols"},{"name":"oncoming_automobile","key":"oncoming_automobile","names":["oncoming_automobile"],"emoji":"🚘","category":"Travel & Places"},{"name":"email","key":"email","names":["email","envelope"],"emoji":"✉️","category":"Objects"},{"name":"cricket","key":"cricket","names":["cricket"],"emoji":"🦗","category":"Animals & Nature"},{"name":"gb","key":"gb","names":["gb","uk","flag-gb"],"emoji":"🇬🇧","category":"Flags"},{"name":"black_circle_for_record","key":"black_circle_for_record","names":["black_circle_for_record"],"emoji":"⏺️","category":"Symbols"},{"name":"flag-gd","key":"flag-gd","names":["flag-gd"],"emoji":"🇬🇩","category":"Flags"},{"name":"spider","key":"spider","names":["spider"],"emoji":"🕷️","category":"Animals & Nature"},{"name":"blue_car","key":"blue_car","names":["blue_car"],"emoji":"🚙","category":"Travel & Places"},{"name":"skull","key":"skull","names":["skull"],"emoji":"💀","category":"Smileys & People"},{"name":"e-mail","key":"e-mail","names":["e-mail"],"emoji":"📧","category":"Objects"},{"name":"wine_glass","key":"wine_glass","names":["wine_glass"],"emoji":"🍷","category":"Food & Drink"},{"name":"spider_web","key":"spider_web","names":["spider_web"],"emoji":"🕸️","category":"Animals & Nature"},{"name":"cocktail","key":"cocktail","names":["cocktail"],"emoji":"🍸","category":"Food & Drink"},{"name":"skull_and_crossbones","key":"skull_and_crossbones","names":["skull_and_crossbones"],"emoji":"☠️","category":"Smileys & People"},{"name":"flag-ge","key":"flag-ge","names":["flag-ge"],"emoji":"🇬🇪","category":"Flags"},{"name":"eject","key":"eject","names":["eject"],"emoji":"⏏️","category":"Symbols"},{"name":"truck","key":"truck","names":["truck"],"emoji":"🚚","category":"Travel & Places"},{"name":"incoming_envelope","key":"incoming_envelope","names":["incoming_envelope"],"emoji":"📨","category":"Objects"},{"name":"tropical_drink","key":"tropical_drink","names":["tropical_drink"],"emoji":"🍹","category":"Food & Drink"},{"name":"scorpion","key":"scorpion","names":["scorpion"],"emoji":"🦂","category":"Animals & Nature"},{"name":"cinema","key":"cinema","names":["cinema"],"emoji":"🎦","category":"Symbols"},{"name":"articulated_lorry","key":"articulated_lorry","names":["articulated_lorry"],"emoji":"🚛","category":"Travel & Places"},{"name":"envelope_with_arrow","key":"envelope_with_arrow","names":["envelope_with_arrow"],"emoji":"📩","category":"Objects"},{"name":"ghost","key":"ghost","names":["ghost"],"emoji":"👻","category":"Smileys & People"},{"name":"flag-gf","key":"flag-gf","names":["flag-gf"],"emoji":"🇬🇫","category":"Flags"},{"name":"bouquet","key":"bouquet","names":["bouquet"],"emoji":"💐","category":"Animals & Nature"},{"name":"tractor","key":"tractor","names":["tractor"],"emoji":"🚜","category":"Travel & Places"},{"name":"beer","key":"beer","names":["beer"],"emoji":"🍺","category":"Food & Drink"},{"name":"outbox_tray","key":"outbox_tray","names":["outbox_tray"],"emoji":"📤","category":"Objects"},{"name":"low_brightness","key":"low_brightness","names":["low_brightness"],"emoji":"🔅","category":"Symbols"},{"name":"alien","key":"alien","names":["alien"],"emoji":"👽","category":"Smileys & People"},{"name":"flag-gg","key":"flag-gg","names":["flag-gg"],"emoji":"🇬🇬","category":"Flags"},{"name":"cherry_blossom","key":"cherry_blossom","names":["cherry_blossom"],"emoji":"🌸","category":"Animals & Nature"},{"name":"inbox_tray","key":"inbox_tray","names":["inbox_tray"],"emoji":"📥","category":"Objects"},{"name":"flag-gh","key":"flag-gh","names":["flag-gh"],"emoji":"🇬🇭","category":"Flags"},{"name":"bike","key":"bike","names":["bike"],"emoji":"🚲","category":"Travel & Places"},{"name":"space_invader","key":"space_invader","names":["space_invader"],"emoji":"👾","category":"Smileys & People"},{"name":"beers","key":"beers","names":["beers"],"emoji":"🍻","category":"Food & Drink"},{"name":"high_brightness","key":"high_brightness","names":["high_brightness"],"emoji":"🔆","category":"Symbols"},{"name":"package","key":"package","names":["package"],"emoji":"📦","category":"Objects"},{"name":"scooter","key":"scooter","names":["scooter"],"emoji":"🛴","category":"Travel & Places"},{"name":"white_flower","key":"white_flower","names":["white_flower"],"emoji":"💮","category":"Animals & Nature"},{"name":"clinking_glasses","key":"clinking_glasses","names":["clinking_glasses"],"emoji":"🥂","category":"Food & Drink"},{"name":"robot_face","key":"robot_face","names":["robot_face"],"emoji":"🤖","category":"Smileys & People"},{"name":"signal_strength","key":"signal_strength","names":["signal_strength"],"emoji":"📶","category":"Symbols"},{"name":"flag-gi","key":"flag-gi","names":["flag-gi"],"emoji":"🇬🇮","category":"Flags"},{"name":"flag-gl","key":"flag-gl","names":["flag-gl"],"emoji":"🇬🇱","category":"Flags"},{"name":"motor_scooter","key":"motor_scooter","names":["motor_scooter"],"emoji":"🛵","category":"Travel & Places"},{"name":"mailbox","key":"mailbox","names":["mailbox"],"emoji":"📫","category":"Objects"},{"name":"vibration_mode","key":"vibration_mode","names":["vibration_mode"],"emoji":"📳","category":"Symbols"},{"name":"hankey","key":"hankey","names":["hankey","poop","shit"],"emoji":"💩","category":"Smileys & People"},{"name":"rosette","key":"rosette","names":["rosette"],"emoji":"🏵️","category":"Animals & Nature"},{"name":"tumbler_glass","key":"tumbler_glass","names":["tumbler_glass"],"emoji":"🥃","category":"Food & Drink"},{"name":"cup_with_straw","key":"cup_with_straw","names":["cup_with_straw"],"emoji":"🥤","category":"Food & Drink"},{"name":"flag-gm","key":"flag-gm","names":["flag-gm"],"emoji":"🇬🇲","category":"Flags"},{"name":"mailbox_closed","key":"mailbox_closed","names":["mailbox_closed"],"emoji":"📪","category":"Objects"},{"name":"mobile_phone_off","key":"mobile_phone_off","names":["mobile_phone_off"],"emoji":"📴","category":"Symbols"},{"name":"busstop","key":"busstop","names":["busstop"],"emoji":"🚏","category":"Travel & Places"},{"name":"smiley_cat","key":"smiley_cat","names":["smiley_cat"],"emoji":"😺","category":"Smileys & People"},{"name":"rose","key":"rose","names":["rose"],"emoji":"🌹","category":"Animals & Nature"},{"name":"motorway","key":"motorway","names":["motorway"],"emoji":"🛣️","category":"Travel & Places"},{"name":"smile_cat","key":"smile_cat","names":["smile_cat"],"emoji":"😸","category":"Smileys & People"},{"name":"flag-gn","key":"flag-gn","names":["flag-gn"],"emoji":"🇬🇳","category":"Flags"},{"name":"wilted_flower","key":"wilted_flower","names":["wilted_flower"],"emoji":"🥀","category":"Animals & Nature"},{"name":"mailbox_with_mail","key":"mailbox_with_mail","names":["mailbox_with_mail"],"emoji":"📬","category":"Objects"},{"name":"chopsticks","key":"chopsticks","names":["chopsticks"],"emoji":"🥢","category":"Food & Drink"},{"name":"female_sign","key":"female_sign","names":["female_sign"],"emoji":"♀️","category":"Symbols"},{"name":"mailbox_with_no_mail","key":"mailbox_with_no_mail","names":["mailbox_with_no_mail"],"emoji":"📭","category":"Objects"},{"name":"knife_fork_plate","key":"knife_fork_plate","names":["knife_fork_plate"],"emoji":"🍽️","category":"Food & Drink"},{"name":"hibiscus","key":"hibiscus","names":["hibiscus"],"emoji":"🌺","category":"Animals & Nature"},{"name":"flag-gp","key":"flag-gp","names":["flag-gp"],"emoji":"🇬🇵","category":"Flags"},{"name":"railway_track","key":"railway_track","names":["railway_track"],"emoji":"🛤️","category":"Travel & Places"},{"name":"male_sign","key":"male_sign","names":["male_sign"],"emoji":"♂️","category":"Symbols"},{"name":"joy_cat","key":"joy_cat","names":["joy_cat"],"emoji":"😹","category":"Smileys & People"},{"name":"fuelpump","key":"fuelpump","names":["fuelpump"],"emoji":"⛽","category":"Travel & Places"},{"name":"sunflower","key":"sunflower","names":["sunflower"],"emoji":"🌻","category":"Animals & Nature"},{"name":"postbox","key":"postbox","names":["postbox"],"emoji":"📮","category":"Objects"},{"name":"flag-gq","key":"flag-gq","names":["flag-gq"],"emoji":"🇬🇶","category":"Flags"},{"name":"heart_eyes_cat","key":"heart_eyes_cat","names":["heart_eyes_cat"],"emoji":"😻","category":"Smileys & People"},{"name":"fork_and_knife","key":"fork_and_knife","names":["fork_and_knife"],"emoji":"🍴","category":"Food & Drink"},{"name":"medical_symbol","key":"medical_symbol","names":["medical_symbol","staff_of_aesculapius"],"emoji":"⚕️","category":"Symbols"},{"name":"recycle","key":"recycle","names":["recycle"],"emoji":"♻️","category":"Symbols"},{"name":"spoon","key":"spoon","names":["spoon"],"emoji":"🥄","category":"Food & Drink"},{"name":"blossom","key":"blossom","names":["blossom"],"emoji":"🌼","category":"Animals & Nature"},{"name":"rotating_light","key":"rotating_light","names":["rotating_light"],"emoji":"🚨","category":"Travel & Places"},{"name":"smirk_cat","key":"smirk_cat","names":["smirk_cat"],"emoji":"😼","category":"Smileys & People"},{"name":"ballot_box_with_ballot","key":"ballot_box_with_ballot","names":["ballot_box_with_ballot"],"emoji":"🗳️","category":"Objects"},{"name":"flag-gr","key":"flag-gr","names":["flag-gr"],"emoji":"🇬🇷","category":"Flags"},{"name":"kissing_cat","key":"kissing_cat","names":["kissing_cat"],"emoji":"😽","category":"Smileys & People"},{"name":"pencil2","key":"pencil2","names":["pencil2"],"emoji":"✏️","category":"Objects"},{"name":"traffic_light","key":"traffic_light","names":["traffic_light"],"emoji":"🚥","category":"Travel & Places"},{"name":"fleur_de_lis","key":"fleur_de_lis","names":["fleur_de_lis"],"emoji":"⚜️","category":"Symbols"},{"name":"tulip","key":"tulip","names":["tulip"],"emoji":"🌷","category":"Animals & Nature"},{"name":"hocho","key":"hocho","names":["hocho","knife"],"emoji":"🔪","category":"Food & Drink"},{"name":"flag-gs","key":"flag-gs","names":["flag-gs"],"emoji":"🇬🇸","category":"Flags"},{"name":"seedling","key":"seedling","names":["seedling"],"emoji":"🌱","category":"Animals & Nature"},{"name":"amphora","key":"amphora","names":["amphora"],"emoji":"🏺","category":"Food & Drink"},{"name":"scream_cat","key":"scream_cat","names":["scream_cat"],"emoji":"🙀","category":"Smileys & People"},{"name":"vertical_traffic_light","key":"vertical_traffic_light","names":["vertical_traffic_light"],"emoji":"🚦","category":"Travel & Places"},{"name":"black_nib","key":"black_nib","names":["black_nib"],"emoji":"✒️","category":"Objects"},{"name":"flag-gt","key":"flag-gt","names":["flag-gt"],"emoji":"🇬🇹","category":"Flags"},{"name":"trident","key":"trident","names":["trident"],"emoji":"🔱","category":"Symbols"},{"name":"flag-gu","key":"flag-gu","names":["flag-gu"],"emoji":"🇬🇺","category":"Flags"},{"name":"name_badge","key":"name_badge","names":["name_badge"],"emoji":"📛","category":"Symbols"},{"name":"construction","key":"construction","names":["construction"],"emoji":"🚧","category":"Travel & Places"},{"name":"lower_left_fountain_pen","key":"lower_left_fountain_pen","names":["lower_left_fountain_pen"],"emoji":"🖋️","category":"Objects"},{"name":"evergreen_tree","key":"evergreen_tree","names":["evergreen_tree"],"emoji":"🌲","category":"Animals & Nature"},{"name":"crying_cat_face","key":"crying_cat_face","names":["crying_cat_face"],"emoji":"😿","category":"Smileys & People"},{"name":"flag-gw","key":"flag-gw","names":["flag-gw"],"emoji":"🇬🇼","category":"Flags"},{"name":"lower_left_ballpoint_pen","key":"lower_left_ballpoint_pen","names":["lower_left_ballpoint_pen"],"emoji":"🖊️","category":"Objects"},{"name":"pouting_cat","key":"pouting_cat","names":["pouting_cat"],"emoji":"😾","category":"Smileys & People"},{"name":"deciduous_tree","key":"deciduous_tree","names":["deciduous_tree"],"emoji":"🌳","category":"Animals & Nature"},{"name":"octagonal_sign","key":"octagonal_sign","names":["octagonal_sign"],"emoji":"🛑","category":"Travel & Places"},{"name":"beginner","key":"beginner","names":["beginner"],"emoji":"🔰","category":"Symbols"},{"name":"flag-gy","key":"flag-gy","names":["flag-gy"],"emoji":"🇬🇾","category":"Flags"},{"name":"lower_left_paintbrush","key":"lower_left_paintbrush","names":["lower_left_paintbrush"],"emoji":"🖌️","category":"Objects"},{"name":"o","key":"o","names":["o"],"emoji":"⭕","category":"Symbols"},{"name":"palm_tree","key":"palm_tree","names":["palm_tree"],"emoji":"🌴","category":"Animals & Nature"},{"name":"anchor","key":"anchor","names":["anchor"],"emoji":"⚓","category":"Travel & Places"},{"name":"see_no_evil","key":"see_no_evil","names":["see_no_evil"],"emoji":"🙈","category":"Smileys & People"},{"name":"boat","key":"boat","names":["boat","sailboat"],"emoji":"⛵","category":"Travel & Places"},{"name":"white_check_mark","key":"white_check_mark","names":["white_check_mark"],"emoji":"✅","category":"Symbols"},{"name":"flag-hk","key":"flag-hk","names":["flag-hk"],"emoji":"🇭🇰","category":"Flags"},{"name":"lower_left_crayon","key":"lower_left_crayon","names":["lower_left_crayon"],"emoji":"🖍️","category":"Objects"},{"name":"hear_no_evil","key":"hear_no_evil","names":["hear_no_evil"],"emoji":"🙉","category":"Smileys & People"},{"name":"cactus","key":"cactus","names":["cactus"],"emoji":"🌵","category":"Animals & Nature"},{"name":"ear_of_rice","key":"ear_of_rice","names":["ear_of_rice"],"emoji":"🌾","category":"Animals & Nature"},{"name":"speak_no_evil","key":"speak_no_evil","names":["speak_no_evil"],"emoji":"🙊","category":"Smileys & People"},{"name":"flag-hm","key":"flag-hm","names":["flag-hm"],"emoji":"🇭🇲","category":"Flags"},{"name":"ballot_box_with_check","key":"ballot_box_with_check","names":["ballot_box_with_check"],"emoji":"☑️","category":"Symbols"},{"name":"canoe","key":"canoe","names":["canoe"],"emoji":"🛶","category":"Travel & Places"},{"name":"memo","key":"memo","names":["memo","pencil"],"emoji":"📝","category":"Objects"},{"name":"herb","key":"herb","names":["herb"],"emoji":"🌿","category":"Animals & Nature"},{"name":"flag-hn","key":"flag-hn","names":["flag-hn"],"emoji":"🇭🇳","category":"Flags"},{"name":"heavy_check_mark","key":"heavy_check_mark","names":["heavy_check_mark"],"emoji":"✔️","category":"Symbols"},{"name":"briefcase","key":"briefcase","names":["briefcase"],"emoji":"💼","category":"Objects"},{"name":"speedboat","key":"speedboat","names":["speedboat"],"emoji":"🚤","category":"Travel & Places"},{"name":"baby","key":"baby","names":["baby"],"emoji":"👶","category":"Smileys & People","variants":{"1F3FB":{"name":"baby","key":"baby-1F3FB","emoji":"👶🏻"},"1F3FC":{"name":"baby","key":"baby-1F3FC","emoji":"👶🏼"},"1F3FD":{"name":"baby","key":"baby-1F3FD","emoji":"👶🏽"},"1F3FE":{"name":"baby","key":"baby-1F3FE","emoji":"👶🏾"},"1F3FF":{"name":"baby","key":"baby-1F3FF","emoji":"👶🏿"}}},{"name":"heavy_multiplication_x","key":"heavy_multiplication_x","names":["heavy_multiplication_x"],"emoji":"✖️","category":"Symbols"},{"name":"child","key":"child","names":["child"],"emoji":"🧒","category":"Smileys & People","variants":{"1F3FB":{"name":"child","key":"child-1F3FB","emoji":"🧒🏻"},"1F3FC":{"name":"child","key":"child-1F3FC","emoji":"🧒🏼"},"1F3FD":{"name":"child","key":"child-1F3FD","emoji":"🧒🏽"},"1F3FE":{"name":"child","key":"child-1F3FE","emoji":"🧒🏾"},"1F3FF":{"name":"child","key":"child-1F3FF","emoji":"🧒🏿"}}},{"name":"shamrock","key":"shamrock","names":["shamrock"],"emoji":"☘️","category":"Animals & Nature"},{"name":"passenger_ship","key":"passenger_ship","names":["passenger_ship"],"emoji":"🛳️","category":"Travel & Places"},{"name":"flag-hr","key":"flag-hr","names":["flag-hr"],"emoji":"🇭🇷","category":"Flags"},{"name":"file_folder","key":"file_folder","names":["file_folder"],"emoji":"📁","category":"Objects"},{"name":"x","key":"x","names":["x"],"emoji":"❌","category":"Symbols"},{"name":"four_leaf_clover","key":"four_leaf_clover","names":["four_leaf_clover"],"emoji":"🍀","category":"Animals & Nature"},{"name":"open_file_folder","key":"open_file_folder","names":["open_file_folder"],"emoji":"📂","category":"Objects"},{"name":"boy","key":"boy","names":["boy"],"emoji":"👦","category":"Smileys & People","variants":{"1F3FB":{"name":"boy","key":"boy-1F3FB","emoji":"👦🏻"},"1F3FC":{"name":"boy","key":"boy-1F3FC","emoji":"👦🏼"},"1F3FD":{"name":"boy","key":"boy-1F3FD","emoji":"👦🏽"},"1F3FE":{"name":"boy","key":"boy-1F3FE","emoji":"👦🏾"},"1F3FF":{"name":"boy","key":"boy-1F3FF","emoji":"👦🏿"}}},{"name":"ferry","key":"ferry","names":["ferry"],"emoji":"⛴️","category":"Travel & Places"},{"name":"flag-ht","key":"flag-ht","names":["flag-ht"],"emoji":"🇭🇹","category":"Flags"},{"name":"girl","key":"girl","names":["girl"],"emoji":"👧","category":"Smileys & People","variants":{"1F3FB":{"name":"girl","key":"girl-1F3FB","emoji":"👧🏻"},"1F3FC":{"name":"girl","key":"girl-1F3FC","emoji":"👧🏼"},"1F3FD":{"name":"girl","key":"girl-1F3FD","emoji":"👧🏽"},"1F3FE":{"name":"girl","key":"girl-1F3FE","emoji":"👧🏾"},"1F3FF":{"name":"girl","key":"girl-1F3FF","emoji":"👧🏿"}}},{"name":"negative_squared_cross_mark","key":"negative_squared_cross_mark","names":["negative_squared_cross_mark"],"emoji":"❎","category":"Symbols"},{"name":"flag-hu","key":"flag-hu","names":["flag-hu"],"emoji":"🇭🇺","category":"Flags"},{"name":"card_index_dividers","key":"card_index_dividers","names":["card_index_dividers"],"emoji":"🗂️","category":"Objects"},{"name":"maple_leaf","key":"maple_leaf","names":["maple_leaf"],"emoji":"🍁","category":"Animals & Nature"},{"name":"motor_boat","key":"motor_boat","names":["motor_boat"],"emoji":"🛥️","category":"Travel & Places"},{"name":"flag-ic","key":"flag-ic","names":["flag-ic"],"emoji":"🇮🇨","category":"Flags"},{"name":"fallen_leaf","key":"fallen_leaf","names":["fallen_leaf"],"emoji":"🍂","category":"Animals & Nature"},{"name":"adult","key":"adult","names":["adult"],"emoji":"🧑","category":"Smileys & People","variants":{"1F3FB":{"name":"adult","key":"adult-1F3FB","emoji":"🧑🏻"},"1F3FC":{"name":"adult","key":"adult-1F3FC","emoji":"🧑🏼"},"1F3FD":{"name":"adult","key":"adult-1F3FD","emoji":"🧑🏽"},"1F3FE":{"name":"adult","key":"adult-1F3FE","emoji":"🧑🏾"},"1F3FF":{"name":"adult","key":"adult-1F3FF","emoji":"🧑🏿"}}},{"name":"ship","key":"ship","names":["ship"],"emoji":"🚢","category":"Travel & Places"},{"name":"heavy_plus_sign","key":"heavy_plus_sign","names":["heavy_plus_sign"],"emoji":"➕","category":"Symbols"},{"name":"date","key":"date","names":["date"],"emoji":"📅","category":"Objects"},{"name":"man","key":"man","names":["man"],"emoji":"👨","category":"Smileys & People","variants":{"1F3FB":{"name":"man","key":"man-1F3FB","emoji":"👨🏻"},"1F3FC":{"name":"man","key":"man-1F3FC","emoji":"👨🏼"},"1F3FD":{"name":"man","key":"man-1F3FD","emoji":"👨🏽"},"1F3FE":{"name":"man","key":"man-1F3FE","emoji":"👨🏾"},"1F3FF":{"name":"man","key":"man-1F3FF","emoji":"👨🏿"}}},{"name":"flag-id","key":"flag-id","names":["flag-id"],"emoji":"🇮🇩","category":"Flags"},{"name":"leaves","key":"leaves","names":["leaves"],"emoji":"🍃","category":"Animals & Nature"},{"name":"heavy_minus_sign","key":"heavy_minus_sign","names":["heavy_minus_sign"],"emoji":"➖","category":"Symbols"},{"name":"calendar","key":"calendar","names":["calendar"],"emoji":"📆","category":"Objects"},{"name":"airplane","key":"airplane","names":["airplane"],"emoji":"✈️","category":"Travel & Places"},{"name":"spiral_note_pad","key":"spiral_note_pad","names":["spiral_note_pad"],"emoji":"🗒️","category":"Objects"},{"name":"heavy_division_sign","key":"heavy_division_sign","names":["heavy_division_sign"],"emoji":"➗","category":"Symbols"},{"name":"small_airplane","key":"small_airplane","names":["small_airplane"],"emoji":"🛩️","category":"Travel & Places"},{"name":"woman","key":"woman","names":["woman"],"emoji":"👩","category":"Smileys & People","variants":{"1F3FB":{"name":"woman","key":"woman-1F3FB","emoji":"👩🏻"},"1F3FC":{"name":"woman","key":"woman-1F3FC","emoji":"👩🏼"},"1F3FD":{"name":"woman","key":"woman-1F3FD","emoji":"👩🏽"},"1F3FE":{"name":"woman","key":"woman-1F3FE","emoji":"👩🏾"},"1F3FF":{"name":"woman","key":"woman-1F3FF","emoji":"👩🏿"}}},{"name":"flag-ie","key":"flag-ie","names":["flag-ie"],"emoji":"🇮🇪","category":"Flags"},{"name":"curly_loop","key":"curly_loop","names":["curly_loop"],"emoji":"➰","category":"Symbols"},{"name":"flag-il","key":"flag-il","names":["flag-il"],"emoji":"🇮🇱","category":"Flags"},{"name":"airplane_departure","key":"airplane_departure","names":["airplane_departure"],"emoji":"🛫","category":"Travel & Places"},{"name":"spiral_calendar_pad","key":"spiral_calendar_pad","names":["spiral_calendar_pad"],"emoji":"🗓️","category":"Objects"},{"name":"older_adult","key":"older_adult","names":["older_adult"],"emoji":"🧓","category":"Smileys & People","variants":{"1F3FB":{"name":"older_adult","key":"older_adult-1F3FB","emoji":"🧓🏻"},"1F3FC":{"name":"older_adult","key":"older_adult-1F3FC","emoji":"🧓🏼"},"1F3FD":{"name":"older_adult","key":"older_adult-1F3FD","emoji":"🧓🏽"},"1F3FE":{"name":"older_adult","key":"older_adult-1F3FE","emoji":"🧓🏾"},"1F3FF":{"name":"older_adult","key":"older_adult-1F3FF","emoji":"🧓🏿"}}},{"name":"airplane_arriving","key":"airplane_arriving","names":["airplane_arriving"],"emoji":"🛬","category":"Travel & Places"},{"name":"card_index","key":"card_index","names":["card_index"],"emoji":"📇","category":"Objects"},{"name":"loop","key":"loop","names":["loop"],"emoji":"➿","category":"Symbols"},{"name":"older_man","key":"older_man","names":["older_man"],"emoji":"👴","category":"Smileys & People","variants":{"1F3FB":{"name":"older_man","key":"older_man-1F3FB","emoji":"👴🏻"},"1F3FC":{"name":"older_man","key":"older_man-1F3FC","emoji":"👴🏼"},"1F3FD":{"name":"older_man","key":"older_man-1F3FD","emoji":"👴🏽"},"1F3FE":{"name":"older_man","key":"older_man-1F3FE","emoji":"👴🏾"},"1F3FF":{"name":"older_man","key":"older_man-1F3FF","emoji":"👴🏿"}}},{"name":"flag-im","key":"flag-im","names":["flag-im"],"emoji":"🇮🇲","category":"Flags"},{"name":"flag-in","key":"flag-in","names":["flag-in"],"emoji":"🇮🇳","category":"Flags"},{"name":"chart_with_upwards_trend","key":"chart_with_upwards_trend","names":["chart_with_upwards_trend"],"emoji":"📈","category":"Objects"},{"name":"part_alternation_mark","key":"part_alternation_mark","names":["part_alternation_mark"],"emoji":"〽️","category":"Symbols"},{"name":"seat","key":"seat","names":["seat"],"emoji":"💺","category":"Travel & Places"},{"name":"older_woman","key":"older_woman","names":["older_woman"],"emoji":"👵","category":"Smileys & People","variants":{"1F3FB":{"name":"older_woman","key":"older_woman-1F3FB","emoji":"👵🏻"},"1F3FC":{"name":"older_woman","key":"older_woman-1F3FC","emoji":"👵🏼"},"1F3FD":{"name":"older_woman","key":"older_woman-1F3FD","emoji":"👵🏽"},"1F3FE":{"name":"older_woman","key":"older_woman-1F3FE","emoji":"👵🏾"},"1F3FF":{"name":"older_woman","key":"older_woman-1F3FF","emoji":"👵🏿"}}},{"name":"eight_spoked_asterisk","key":"eight_spoked_asterisk","names":["eight_spoked_asterisk"],"emoji":"✳️","category":"Symbols"},{"name":"chart_with_downwards_trend","key":"chart_with_downwards_trend","names":["chart_with_downwards_trend"],"emoji":"📉","category":"Objects"},{"name":"flag-io","key":"flag-io","names":["flag-io"],"emoji":"🇮🇴","category":"Flags"},{"name":"male-doctor","key":"male-doctor","names":["male-doctor"],"emoji":"👨‍⚕️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-doctor","key":"male-doctor-1F3FB","emoji":"👨🏻‍⚕️"},"1F3FC":{"name":"male-doctor","key":"male-doctor-1F3FC","emoji":"👨🏼‍⚕️"},"1F3FD":{"name":"male-doctor","key":"male-doctor-1F3FD","emoji":"👨🏽‍⚕️"},"1F3FE":{"name":"male-doctor","key":"male-doctor-1F3FE","emoji":"👨🏾‍⚕️"},"1F3FF":{"name":"male-doctor","key":"male-doctor-1F3FF","emoji":"👨🏿‍⚕️"}}},{"name":"helicopter","key":"helicopter","names":["helicopter"],"emoji":"🚁","category":"Travel & Places"},{"name":"female-doctor","key":"female-doctor","names":["female-doctor"],"emoji":"👩‍⚕️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-doctor","key":"female-doctor-1F3FB","emoji":"👩🏻‍⚕️"},"1F3FC":{"name":"female-doctor","key":"female-doctor-1F3FC","emoji":"👩🏼‍⚕️"},"1F3FD":{"name":"female-doctor","key":"female-doctor-1F3FD","emoji":"👩🏽‍⚕️"},"1F3FE":{"name":"female-doctor","key":"female-doctor-1F3FE","emoji":"👩🏾‍⚕️"},"1F3FF":{"name":"female-doctor","key":"female-doctor-1F3FF","emoji":"👩🏿‍⚕️"}}},{"name":"suspension_railway","key":"suspension_railway","names":["suspension_railway"],"emoji":"🚟","category":"Travel & Places"},{"name":"bar_chart","key":"bar_chart","names":["bar_chart"],"emoji":"📊","category":"Objects"},{"name":"flag-iq","key":"flag-iq","names":["flag-iq"],"emoji":"🇮🇶","category":"Flags"},{"name":"eight_pointed_black_star","key":"eight_pointed_black_star","names":["eight_pointed_black_star"],"emoji":"✴️","category":"Symbols"},{"name":"mountain_cableway","key":"mountain_cableway","names":["mountain_cableway"],"emoji":"🚠","category":"Travel & Places"},{"name":"male-student","key":"male-student","names":["male-student"],"emoji":"👨‍🎓","category":"Smileys & People","variants":{"1F3FB":{"name":"male-student","key":"male-student-1F3FB","emoji":"👨🏻‍🎓"},"1F3FC":{"name":"male-student","key":"male-student-1F3FC","emoji":"👨🏼‍🎓"},"1F3FD":{"name":"male-student","key":"male-student-1F3FD","emoji":"👨🏽‍🎓"},"1F3FE":{"name":"male-student","key":"male-student-1F3FE","emoji":"👨🏾‍🎓"},"1F3FF":{"name":"male-student","key":"male-student-1F3FF","emoji":"👨🏿‍🎓"}}},{"name":"clipboard","key":"clipboard","names":["clipboard"],"emoji":"📋","category":"Objects"},{"name":"flag-ir","key":"flag-ir","names":["flag-ir"],"emoji":"🇮🇷","category":"Flags"},{"name":"sparkle","key":"sparkle","names":["sparkle"],"emoji":"❇️","category":"Symbols"},{"name":"female-student","key":"female-student","names":["female-student"],"emoji":"👩‍🎓","category":"Smileys & People","variants":{"1F3FB":{"name":"female-student","key":"female-student-1F3FB","emoji":"👩🏻‍🎓"},"1F3FC":{"name":"female-student","key":"female-student-1F3FC","emoji":"👩🏼‍🎓"},"1F3FD":{"name":"female-student","key":"female-student-1F3FD","emoji":"👩🏽‍🎓"},"1F3FE":{"name":"female-student","key":"female-student-1F3FE","emoji":"👩🏾‍🎓"},"1F3FF":{"name":"female-student","key":"female-student-1F3FF","emoji":"👩🏿‍🎓"}}},{"name":"pushpin","key":"pushpin","names":["pushpin"],"emoji":"📌","category":"Objects"},{"name":"aerial_tramway","key":"aerial_tramway","names":["aerial_tramway"],"emoji":"🚡","category":"Travel & Places"},{"name":"flag-is","key":"flag-is","names":["flag-is"],"emoji":"🇮🇸","category":"Flags"},{"name":"bangbang","key":"bangbang","names":["bangbang"],"emoji":"‼️","category":"Symbols"},{"name":"interrobang","key":"interrobang","names":["interrobang"],"emoji":"⁉️","category":"Symbols"},{"name":"satellite","key":"satellite","names":["satellite"],"emoji":"🛰️","category":"Travel & Places"},{"name":"it","key":"it","names":["it","flag-it"],"emoji":"🇮🇹","category":"Flags"},{"name":"male-teacher","key":"male-teacher","names":["male-teacher"],"emoji":"👨‍🏫","category":"Smileys & People","variants":{"1F3FB":{"name":"male-teacher","key":"male-teacher-1F3FB","emoji":"👨🏻‍🏫"},"1F3FC":{"name":"male-teacher","key":"male-teacher-1F3FC","emoji":"👨🏼‍🏫"},"1F3FD":{"name":"male-teacher","key":"male-teacher-1F3FD","emoji":"👨🏽‍🏫"},"1F3FE":{"name":"male-teacher","key":"male-teacher-1F3FE","emoji":"👨🏾‍🏫"},"1F3FF":{"name":"male-teacher","key":"male-teacher-1F3FF","emoji":"👨🏿‍🏫"}}},{"name":"round_pushpin","key":"round_pushpin","names":["round_pushpin"],"emoji":"📍","category":"Objects"},{"name":"flag-je","key":"flag-je","names":["flag-je"],"emoji":"🇯🇪","category":"Flags"},{"name":"question","key":"question","names":["question"],"emoji":"❓","category":"Symbols"},{"name":"rocket","key":"rocket","names":["rocket"],"emoji":"🚀","category":"Travel & Places"},{"name":"female-teacher","key":"female-teacher","names":["female-teacher"],"emoji":"👩‍🏫","category":"Smileys & People","variants":{"1F3FB":{"name":"female-teacher","key":"female-teacher-1F3FB","emoji":"👩🏻‍🏫"},"1F3FC":{"name":"female-teacher","key":"female-teacher-1F3FC","emoji":"👩🏼‍🏫"},"1F3FD":{"name":"female-teacher","key":"female-teacher-1F3FD","emoji":"👩🏽‍🏫"},"1F3FE":{"name":"female-teacher","key":"female-teacher-1F3FE","emoji":"👩🏾‍🏫"},"1F3FF":{"name":"female-teacher","key":"female-teacher-1F3FF","emoji":"👩🏿‍🏫"}}},{"name":"paperclip","key":"paperclip","names":["paperclip"],"emoji":"📎","category":"Objects"},{"name":"linked_paperclips","key":"linked_paperclips","names":["linked_paperclips"],"emoji":"🖇️","category":"Objects"},{"name":"flying_saucer","key":"flying_saucer","names":["flying_saucer"],"emoji":"🛸","category":"Travel & Places"},{"name":"male-judge","key":"male-judge","names":["male-judge"],"emoji":"👨‍⚖️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-judge","key":"male-judge-1F3FB","emoji":"👨🏻‍⚖️"},"1F3FC":{"name":"male-judge","key":"male-judge-1F3FC","emoji":"👨🏼‍⚖️"},"1F3FD":{"name":"male-judge","key":"male-judge-1F3FD","emoji":"👨🏽‍⚖️"},"1F3FE":{"name":"male-judge","key":"male-judge-1F3FE","emoji":"👨🏾‍⚖️"},"1F3FF":{"name":"male-judge","key":"male-judge-1F3FF","emoji":"👨🏿‍⚖️"}}},{"name":"grey_question","key":"grey_question","names":["grey_question"],"emoji":"❔","category":"Symbols"},{"name":"flag-jm","key":"flag-jm","names":["flag-jm"],"emoji":"🇯🇲","category":"Flags"},{"name":"bellhop_bell","key":"bellhop_bell","names":["bellhop_bell"],"emoji":"🛎️","category":"Travel & Places"},{"name":"straight_ruler","key":"straight_ruler","names":["straight_ruler"],"emoji":"📏","category":"Objects"},{"name":"flag-jo","key":"flag-jo","names":["flag-jo"],"emoji":"🇯🇴","category":"Flags"},{"name":"female-judge","key":"female-judge","names":["female-judge"],"emoji":"👩‍⚖️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-judge","key":"female-judge-1F3FB","emoji":"👩🏻‍⚖️"},"1F3FC":{"name":"female-judge","key":"female-judge-1F3FC","emoji":"👩🏼‍⚖️"},"1F3FD":{"name":"female-judge","key":"female-judge-1F3FD","emoji":"👩🏽‍⚖️"},"1F3FE":{"name":"female-judge","key":"female-judge-1F3FE","emoji":"👩🏾‍⚖️"},"1F3FF":{"name":"female-judge","key":"female-judge-1F3FF","emoji":"👩🏿‍⚖️"}}},{"name":"grey_exclamation","key":"grey_exclamation","names":["grey_exclamation"],"emoji":"❕","category":"Symbols"},{"name":"door","key":"door","names":["door"],"emoji":"🚪","category":"Travel & Places"},{"name":"male-farmer","key":"male-farmer","names":["male-farmer"],"emoji":"👨‍🌾","category":"Smileys & People","variants":{"1F3FB":{"name":"male-farmer","key":"male-farmer-1F3FB","emoji":"👨🏻‍🌾"},"1F3FC":{"name":"male-farmer","key":"male-farmer-1F3FC","emoji":"👨🏼‍🌾"},"1F3FD":{"name":"male-farmer","key":"male-farmer-1F3FD","emoji":"👨🏽‍🌾"},"1F3FE":{"name":"male-farmer","key":"male-farmer-1F3FE","emoji":"👨🏾‍🌾"},"1F3FF":{"name":"male-farmer","key":"male-farmer-1F3FF","emoji":"👨🏿‍🌾"}}},{"name":"jp","key":"jp","names":["jp","flag-jp"],"emoji":"🇯🇵","category":"Flags"},{"name":"triangular_ruler","key":"triangular_ruler","names":["triangular_ruler"],"emoji":"📐","category":"Objects"},{"name":"exclamation","key":"exclamation","names":["exclamation","heavy_exclamation_mark"],"emoji":"❗","category":"Symbols"},{"name":"bed","key":"bed","names":["bed"],"emoji":"🛏️","category":"Travel & Places"},{"name":"female-farmer","key":"female-farmer","names":["female-farmer"],"emoji":"👩‍🌾","category":"Smileys & People","variants":{"1F3FB":{"name":"female-farmer","key":"female-farmer-1F3FB","emoji":"👩🏻‍🌾"},"1F3FC":{"name":"female-farmer","key":"female-farmer-1F3FC","emoji":"👩🏼‍🌾"},"1F3FD":{"name":"female-farmer","key":"female-farmer-1F3FD","emoji":"👩🏽‍🌾"},"1F3FE":{"name":"female-farmer","key":"female-farmer-1F3FE","emoji":"👩🏾‍🌾"},"1F3FF":{"name":"female-farmer","key":"female-farmer-1F3FF","emoji":"👩🏿‍🌾"}}},{"name":"scissors","key":"scissors","names":["scissors"],"emoji":"✂️","category":"Objects"},{"name":"wavy_dash","key":"wavy_dash","names":["wavy_dash"],"emoji":"〰️","category":"Symbols"},{"name":"flag-ke","key":"flag-ke","names":["flag-ke"],"emoji":"🇰🇪","category":"Flags"},{"name":"flag-kg","key":"flag-kg","names":["flag-kg"],"emoji":"🇰🇬","category":"Flags"},{"name":"couch_and_lamp","key":"couch_and_lamp","names":["couch_and_lamp"],"emoji":"🛋️","category":"Travel & Places"},{"name":"male-cook","key":"male-cook","names":["male-cook"],"emoji":"👨‍🍳","category":"Smileys & People","variants":{"1F3FB":{"name":"male-cook","key":"male-cook-1F3FB","emoji":"👨🏻‍🍳"},"1F3FC":{"name":"male-cook","key":"male-cook-1F3FC","emoji":"👨🏼‍🍳"},"1F3FD":{"name":"male-cook","key":"male-cook-1F3FD","emoji":"👨🏽‍🍳"},"1F3FE":{"name":"male-cook","key":"male-cook-1F3FE","emoji":"👨🏾‍🍳"},"1F3FF":{"name":"male-cook","key":"male-cook-1F3FF","emoji":"👨🏿‍🍳"}}},{"name":"card_file_box","key":"card_file_box","names":["card_file_box"],"emoji":"🗃️","category":"Objects"},{"name":"copyright","key":"copyright","names":["copyright"],"emoji":"©️","category":"Symbols"},{"name":"file_cabinet","key":"file_cabinet","names":["file_cabinet"],"emoji":"🗄️","category":"Objects"},{"name":"registered","key":"registered","names":["registered"],"emoji":"®️","category":"Symbols"},{"name":"flag-kh","key":"flag-kh","names":["flag-kh"],"emoji":"🇰🇭","category":"Flags"},{"name":"female-cook","key":"female-cook","names":["female-cook"],"emoji":"👩‍🍳","category":"Smileys & People","variants":{"1F3FB":{"name":"female-cook","key":"female-cook-1F3FB","emoji":"👩🏻‍🍳"},"1F3FC":{"name":"female-cook","key":"female-cook-1F3FC","emoji":"👩🏼‍🍳"},"1F3FD":{"name":"female-cook","key":"female-cook-1F3FD","emoji":"👩🏽‍🍳"},"1F3FE":{"name":"female-cook","key":"female-cook-1F3FE","emoji":"👩🏾‍🍳"},"1F3FF":{"name":"female-cook","key":"female-cook-1F3FF","emoji":"👩🏿‍🍳"}}},{"name":"toilet","key":"toilet","names":["toilet"],"emoji":"🚽","category":"Travel & Places"},{"name":"wastebasket","key":"wastebasket","names":["wastebasket"],"emoji":"🗑️","category":"Objects"},{"name":"flag-ki","key":"flag-ki","names":["flag-ki"],"emoji":"🇰🇮","category":"Flags"},{"name":"shower","key":"shower","names":["shower"],"emoji":"🚿","category":"Travel & Places"},{"name":"male-mechanic","key":"male-mechanic","names":["male-mechanic"],"emoji":"👨‍🔧","category":"Smileys & People","variants":{"1F3FB":{"name":"male-mechanic","key":"male-mechanic-1F3FB","emoji":"👨🏻‍🔧"},"1F3FC":{"name":"male-mechanic","key":"male-mechanic-1F3FC","emoji":"👨🏼‍🔧"},"1F3FD":{"name":"male-mechanic","key":"male-mechanic-1F3FD","emoji":"👨🏽‍🔧"},"1F3FE":{"name":"male-mechanic","key":"male-mechanic-1F3FE","emoji":"👨🏾‍🔧"},"1F3FF":{"name":"male-mechanic","key":"male-mechanic-1F3FF","emoji":"👨🏿‍🔧"}}},{"name":"tm","key":"tm","names":["tm"],"emoji":"™️","category":"Symbols"},{"name":"hash","key":"hash","names":["hash"],"emoji":"#️⃣","category":"Symbols"},{"name":"flag-km","key":"flag-km","names":["flag-km"],"emoji":"🇰🇲","category":"Flags"},{"name":"bathtub","key":"bathtub","names":["bathtub"],"emoji":"🛁","category":"Travel & Places"},{"name":"female-mechanic","key":"female-mechanic","names":["female-mechanic"],"emoji":"👩‍🔧","category":"Smileys & People","variants":{"1F3FB":{"name":"female-mechanic","key":"female-mechanic-1F3FB","emoji":"👩🏻‍🔧"},"1F3FC":{"name":"female-mechanic","key":"female-mechanic-1F3FC","emoji":"👩🏼‍🔧"},"1F3FD":{"name":"female-mechanic","key":"female-mechanic-1F3FD","emoji":"👩🏽‍🔧"},"1F3FE":{"name":"female-mechanic","key":"female-mechanic-1F3FE","emoji":"👩🏾‍🔧"},"1F3FF":{"name":"female-mechanic","key":"female-mechanic-1F3FF","emoji":"👩🏿‍🔧"}}},{"name":"lock","key":"lock","names":["lock"],"emoji":"🔒","category":"Objects"},{"name":"male-factory-worker","key":"male-factory-worker","names":["male-factory-worker"],"emoji":"👨‍🏭","category":"Smileys & People","variants":{"1F3FB":{"name":"male-factory-worker","key":"male-factory-worker-1F3FB","emoji":"👨🏻‍🏭"},"1F3FC":{"name":"male-factory-worker","key":"male-factory-worker-1F3FC","emoji":"👨🏼‍🏭"},"1F3FD":{"name":"male-factory-worker","key":"male-factory-worker-1F3FD","emoji":"👨🏽‍🏭"},"1F3FE":{"name":"male-factory-worker","key":"male-factory-worker-1F3FE","emoji":"👨🏾‍🏭"},"1F3FF":{"name":"male-factory-worker","key":"male-factory-worker-1F3FF","emoji":"👨🏿‍🏭"}}},{"name":"flag-kn","key":"flag-kn","names":["flag-kn"],"emoji":"🇰🇳","category":"Flags"},{"name":"hourglass","key":"hourglass","names":["hourglass"],"emoji":"⌛","category":"Travel & Places"},{"name":"keycap_star","key":"keycap_star","names":["keycap_star"],"emoji":"*️⃣","category":"Symbols"},{"name":"unlock","key":"unlock","names":["unlock"],"emoji":"🔓","category":"Objects"},{"name":"flag-kp","key":"flag-kp","names":["flag-kp"],"emoji":"🇰🇵","category":"Flags"},{"name":"female-factory-worker","key":"female-factory-worker","names":["female-factory-worker"],"emoji":"👩‍🏭","category":"Smileys & People","variants":{"1F3FB":{"name":"female-factory-worker","key":"female-factory-worker-1F3FB","emoji":"👩🏻‍🏭"},"1F3FC":{"name":"female-factory-worker","key":"female-factory-worker-1F3FC","emoji":"👩🏼‍🏭"},"1F3FD":{"name":"female-factory-worker","key":"female-factory-worker-1F3FD","emoji":"👩🏽‍🏭"},"1F3FE":{"name":"female-factory-worker","key":"female-factory-worker-1F3FE","emoji":"👩🏾‍🏭"},"1F3FF":{"name":"female-factory-worker","key":"female-factory-worker-1F3FF","emoji":"👩🏿‍🏭"}}},{"name":"zero","key":"zero","names":["zero"],"emoji":"0️⃣","category":"Symbols"},{"name":"lock_with_ink_pen","key":"lock_with_ink_pen","names":["lock_with_ink_pen"],"emoji":"🔏","category":"Objects"},{"name":"hourglass_flowing_sand","key":"hourglass_flowing_sand","names":["hourglass_flowing_sand"],"emoji":"⏳","category":"Travel & Places"},{"name":"one","key":"one","names":["one"],"emoji":"1️⃣","category":"Symbols"},{"name":"kr","key":"kr","names":["kr","flag-kr"],"emoji":"🇰🇷","category":"Flags"},{"name":"watch","key":"watch","names":["watch"],"emoji":"⌚","category":"Travel & Places"},{"name":"male-office-worker","key":"male-office-worker","names":["male-office-worker"],"emoji":"👨‍💼","category":"Smileys & People","variants":{"1F3FB":{"name":"male-office-worker","key":"male-office-worker-1F3FB","emoji":"👨🏻‍💼"},"1F3FC":{"name":"male-office-worker","key":"male-office-worker-1F3FC","emoji":"👨🏼‍💼"},"1F3FD":{"name":"male-office-worker","key":"male-office-worker-1F3FD","emoji":"👨🏽‍💼"},"1F3FE":{"name":"male-office-worker","key":"male-office-worker-1F3FE","emoji":"👨🏾‍💼"},"1F3FF":{"name":"male-office-worker","key":"male-office-worker-1F3FF","emoji":"👨🏿‍💼"}}},{"name":"closed_lock_with_key","key":"closed_lock_with_key","names":["closed_lock_with_key"],"emoji":"🔐","category":"Objects"},{"name":"female-office-worker","key":"female-office-worker","names":["female-office-worker"],"emoji":"👩‍💼","category":"Smileys & People","variants":{"1F3FB":{"name":"female-office-worker","key":"female-office-worker-1F3FB","emoji":"👩🏻‍💼"},"1F3FC":{"name":"female-office-worker","key":"female-office-worker-1F3FC","emoji":"👩🏼‍💼"},"1F3FD":{"name":"female-office-worker","key":"female-office-worker-1F3FD","emoji":"👩🏽‍💼"},"1F3FE":{"name":"female-office-worker","key":"female-office-worker-1F3FE","emoji":"👩🏾‍💼"},"1F3FF":{"name":"female-office-worker","key":"female-office-worker-1F3FF","emoji":"👩🏿‍💼"}}},{"name":"two","key":"two","names":["two"],"emoji":"2️⃣","category":"Symbols"},{"name":"alarm_clock","key":"alarm_clock","names":["alarm_clock"],"emoji":"⏰","category":"Travel & Places"},{"name":"key","key":"key","names":["key"],"emoji":"🔑","category":"Objects"},{"name":"flag-kw","key":"flag-kw","names":["flag-kw"],"emoji":"🇰🇼","category":"Flags"},{"name":"stopwatch","key":"stopwatch","names":["stopwatch"],"emoji":"⏱️","category":"Travel & Places"},{"name":"male-scientist","key":"male-scientist","names":["male-scientist"],"emoji":"👨‍🔬","category":"Smileys & People","variants":{"1F3FB":{"name":"male-scientist","key":"male-scientist-1F3FB","emoji":"👨🏻‍🔬"},"1F3FC":{"name":"male-scientist","key":"male-scientist-1F3FC","emoji":"👨🏼‍🔬"},"1F3FD":{"name":"male-scientist","key":"male-scientist-1F3FD","emoji":"👨🏽‍🔬"},"1F3FE":{"name":"male-scientist","key":"male-scientist-1F3FE","emoji":"👨🏾‍🔬"},"1F3FF":{"name":"male-scientist","key":"male-scientist-1F3FF","emoji":"👨🏿‍🔬"}}},{"name":"three","key":"three","names":["three"],"emoji":"3️⃣","category":"Symbols"},{"name":"flag-ky","key":"flag-ky","names":["flag-ky"],"emoji":"🇰🇾","category":"Flags"},{"name":"old_key","key":"old_key","names":["old_key"],"emoji":"🗝️","category":"Objects"},{"name":"flag-kz","key":"flag-kz","names":["flag-kz"],"emoji":"🇰🇿","category":"Flags"},{"name":"hammer","key":"hammer","names":["hammer"],"emoji":"🔨","category":"Objects"},{"name":"female-scientist","key":"female-scientist","names":["female-scientist"],"emoji":"👩‍🔬","category":"Smileys & People","variants":{"1F3FB":{"name":"female-scientist","key":"female-scientist-1F3FB","emoji":"👩🏻‍🔬"},"1F3FC":{"name":"female-scientist","key":"female-scientist-1F3FC","emoji":"👩🏼‍🔬"},"1F3FD":{"name":"female-scientist","key":"female-scientist-1F3FD","emoji":"👩🏽‍🔬"},"1F3FE":{"name":"female-scientist","key":"female-scientist-1F3FE","emoji":"👩🏾‍🔬"},"1F3FF":{"name":"female-scientist","key":"female-scientist-1F3FF","emoji":"👩🏿‍🔬"}}},{"name":"timer_clock","key":"timer_clock","names":["timer_clock"],"emoji":"⏲️","category":"Travel & Places"},{"name":"four","key":"four","names":["four"],"emoji":"4️⃣","category":"Symbols"},{"name":"male-technologist","key":"male-technologist","names":["male-technologist"],"emoji":"👨‍💻","category":"Smileys & People","variants":{"1F3FB":{"name":"male-technologist","key":"male-technologist-1F3FB","emoji":"👨🏻‍💻"},"1F3FC":{"name":"male-technologist","key":"male-technologist-1F3FC","emoji":"👨🏼‍💻"},"1F3FD":{"name":"male-technologist","key":"male-technologist-1F3FD","emoji":"👨🏽‍💻"},"1F3FE":{"name":"male-technologist","key":"male-technologist-1F3FE","emoji":"👨🏾‍💻"},"1F3FF":{"name":"male-technologist","key":"male-technologist-1F3FF","emoji":"👨🏿‍💻"}}},{"name":"mantelpiece_clock","key":"mantelpiece_clock","names":["mantelpiece_clock"],"emoji":"🕰️","category":"Travel & Places"},{"name":"five","key":"five","names":["five"],"emoji":"5️⃣","category":"Symbols"},{"name":"flag-la","key":"flag-la","names":["flag-la"],"emoji":"🇱🇦","category":"Flags"},{"name":"pick","key":"pick","names":["pick"],"emoji":"⛏️","category":"Objects"},{"name":"flag-lb","key":"flag-lb","names":["flag-lb"],"emoji":"🇱🇧","category":"Flags"},{"name":"clock12","key":"clock12","names":["clock12"],"emoji":"🕛","category":"Travel & Places"},{"name":"hammer_and_pick","key":"hammer_and_pick","names":["hammer_and_pick"],"emoji":"⚒️","category":"Objects"},{"name":"six","key":"six","names":["six"],"emoji":"6️⃣","category":"Symbols"},{"name":"female-technologist","key":"female-technologist","names":["female-technologist"],"emoji":"👩‍💻","category":"Smileys & People","variants":{"1F3FB":{"name":"female-technologist","key":"female-technologist-1F3FB","emoji":"👩🏻‍💻"},"1F3FC":{"name":"female-technologist","key":"female-technologist-1F3FC","emoji":"👩🏼‍💻"},"1F3FD":{"name":"female-technologist","key":"female-technologist-1F3FD","emoji":"👩🏽‍💻"},"1F3FE":{"name":"female-technologist","key":"female-technologist-1F3FE","emoji":"👩🏾‍💻"},"1F3FF":{"name":"female-technologist","key":"female-technologist-1F3FF","emoji":"👩🏿‍💻"}}},{"name":"hammer_and_wrench","key":"hammer_and_wrench","names":["hammer_and_wrench"],"emoji":"🛠️","category":"Objects"},{"name":"flag-lc","key":"flag-lc","names":["flag-lc"],"emoji":"🇱🇨","category":"Flags"},{"name":"clock1230","key":"clock1230","names":["clock1230"],"emoji":"🕧","category":"Travel & Places"},{"name":"seven","key":"seven","names":["seven"],"emoji":"7️⃣","category":"Symbols"},{"name":"male-singer","key":"male-singer","names":["male-singer"],"emoji":"👨‍🎤","category":"Smileys & People","variants":{"1F3FB":{"name":"male-singer","key":"male-singer-1F3FB","emoji":"👨🏻‍🎤"},"1F3FC":{"name":"male-singer","key":"male-singer-1F3FC","emoji":"👨🏼‍🎤"},"1F3FD":{"name":"male-singer","key":"male-singer-1F3FD","emoji":"👨🏽‍🎤"},"1F3FE":{"name":"male-singer","key":"male-singer-1F3FE","emoji":"👨🏾‍🎤"},"1F3FF":{"name":"male-singer","key":"male-singer-1F3FF","emoji":"👨🏿‍🎤"}}},{"name":"eight","key":"eight","names":["eight"],"emoji":"8️⃣","category":"Symbols"},{"name":"flag-li","key":"flag-li","names":["flag-li"],"emoji":"🇱🇮","category":"Flags"},{"name":"dagger_knife","key":"dagger_knife","names":["dagger_knife"],"emoji":"🗡️","category":"Objects"},{"name":"clock1","key":"clock1","names":["clock1"],"emoji":"🕐","category":"Travel & Places"},{"name":"female-singer","key":"female-singer","names":["female-singer"],"emoji":"👩‍🎤","category":"Smileys & People","variants":{"1F3FB":{"name":"female-singer","key":"female-singer-1F3FB","emoji":"👩🏻‍🎤"},"1F3FC":{"name":"female-singer","key":"female-singer-1F3FC","emoji":"👩🏼‍🎤"},"1F3FD":{"name":"female-singer","key":"female-singer-1F3FD","emoji":"👩🏽‍🎤"},"1F3FE":{"name":"female-singer","key":"female-singer-1F3FE","emoji":"👩🏾‍🎤"},"1F3FF":{"name":"female-singer","key":"female-singer-1F3FF","emoji":"👩🏿‍🎤"}}},{"name":"male-artist","key":"male-artist","names":["male-artist"],"emoji":"👨‍🎨","category":"Smileys & People","variants":{"1F3FB":{"name":"male-artist","key":"male-artist-1F3FB","emoji":"👨🏻‍🎨"},"1F3FC":{"name":"male-artist","key":"male-artist-1F3FC","emoji":"👨🏼‍🎨"},"1F3FD":{"name":"male-artist","key":"male-artist-1F3FD","emoji":"👨🏽‍🎨"},"1F3FE":{"name":"male-artist","key":"male-artist-1F3FE","emoji":"👨🏾‍🎨"},"1F3FF":{"name":"male-artist","key":"male-artist-1F3FF","emoji":"👨🏿‍🎨"}}},{"name":"crossed_swords","key":"crossed_swords","names":["crossed_swords"],"emoji":"⚔️","category":"Objects"},{"name":"nine","key":"nine","names":["nine"],"emoji":"9️⃣","category":"Symbols"},{"name":"flag-lk","key":"flag-lk","names":["flag-lk"],"emoji":"🇱🇰","category":"Flags"},{"name":"clock130","key":"clock130","names":["clock130"],"emoji":"🕜","category":"Travel & Places"},{"name":"clock2","key":"clock2","names":["clock2"],"emoji":"🕑","category":"Travel & Places"},{"name":"gun","key":"gun","names":["gun"],"emoji":"🔫","category":"Objects"},{"name":"keycap_ten","key":"keycap_ten","names":["keycap_ten"],"emoji":"🔟","category":"Symbols"},{"name":"female-artist","key":"female-artist","names":["female-artist"],"emoji":"👩‍🎨","category":"Smileys & People","variants":{"1F3FB":{"name":"female-artist","key":"female-artist-1F3FB","emoji":"👩🏻‍🎨"},"1F3FC":{"name":"female-artist","key":"female-artist-1F3FC","emoji":"👩🏼‍🎨"},"1F3FD":{"name":"female-artist","key":"female-artist-1F3FD","emoji":"👩🏽‍🎨"},"1F3FE":{"name":"female-artist","key":"female-artist-1F3FE","emoji":"👩🏾‍🎨"},"1F3FF":{"name":"female-artist","key":"female-artist-1F3FF","emoji":"👩🏿‍🎨"}}},{"name":"flag-lr","key":"flag-lr","names":["flag-lr"],"emoji":"🇱🇷","category":"Flags"},{"name":"clock230","key":"clock230","names":["clock230"],"emoji":"🕝","category":"Travel & Places"},{"name":"100","key":"100","names":["100"],"emoji":"💯","category":"Symbols"},{"name":"bow_and_arrow","key":"bow_and_arrow","names":["bow_and_arrow"],"emoji":"🏹","category":"Objects"},{"name":"male-pilot","key":"male-pilot","names":["male-pilot"],"emoji":"👨‍✈️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-pilot","key":"male-pilot-1F3FB","emoji":"👨🏻‍✈️"},"1F3FC":{"name":"male-pilot","key":"male-pilot-1F3FC","emoji":"👨🏼‍✈️"},"1F3FD":{"name":"male-pilot","key":"male-pilot-1F3FD","emoji":"👨🏽‍✈️"},"1F3FE":{"name":"male-pilot","key":"male-pilot-1F3FE","emoji":"👨🏾‍✈️"},"1F3FF":{"name":"male-pilot","key":"male-pilot-1F3FF","emoji":"👨🏿‍✈️"}}},{"name":"flag-ls","key":"flag-ls","names":["flag-ls"],"emoji":"🇱🇸","category":"Flags"},{"name":"flag-lt","key":"flag-lt","names":["flag-lt"],"emoji":"🇱🇹","category":"Flags"},{"name":"capital_abcd","key":"capital_abcd","names":["capital_abcd"],"emoji":"🔠","category":"Symbols"},{"name":"female-pilot","key":"female-pilot","names":["female-pilot"],"emoji":"👩‍✈️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-pilot","key":"female-pilot-1F3FB","emoji":"👩🏻‍✈️"},"1F3FC":{"name":"female-pilot","key":"female-pilot-1F3FC","emoji":"👩🏼‍✈️"},"1F3FD":{"name":"female-pilot","key":"female-pilot-1F3FD","emoji":"👩🏽‍✈️"},"1F3FE":{"name":"female-pilot","key":"female-pilot-1F3FE","emoji":"👩🏾‍✈️"},"1F3FF":{"name":"female-pilot","key":"female-pilot-1F3FF","emoji":"👩🏿‍✈️"}}},{"name":"clock3","key":"clock3","names":["clock3"],"emoji":"🕒","category":"Travel & Places"},{"name":"shield","key":"shield","names":["shield"],"emoji":"🛡️","category":"Objects"},{"name":"male-astronaut","key":"male-astronaut","names":["male-astronaut"],"emoji":"👨‍🚀","category":"Smileys & People","variants":{"1F3FB":{"name":"male-astronaut","key":"male-astronaut-1F3FB","emoji":"👨🏻‍🚀"},"1F3FC":{"name":"male-astronaut","key":"male-astronaut-1F3FC","emoji":"👨🏼‍🚀"},"1F3FD":{"name":"male-astronaut","key":"male-astronaut-1F3FD","emoji":"👨🏽‍🚀"},"1F3FE":{"name":"male-astronaut","key":"male-astronaut-1F3FE","emoji":"👨🏾‍🚀"},"1F3FF":{"name":"male-astronaut","key":"male-astronaut-1F3FF","emoji":"👨🏿‍🚀"}}},{"name":"abcd","key":"abcd","names":["abcd"],"emoji":"🔡","category":"Symbols"},{"name":"clock330","key":"clock330","names":["clock330"],"emoji":"🕞","category":"Travel & Places"},{"name":"flag-lu","key":"flag-lu","names":["flag-lu"],"emoji":"🇱🇺","category":"Flags"},{"name":"wrench","key":"wrench","names":["wrench"],"emoji":"🔧","category":"Objects"},{"name":"nut_and_bolt","key":"nut_and_bolt","names":["nut_and_bolt"],"emoji":"🔩","category":"Objects"},{"name":"1234","key":"1234","names":["1234"],"emoji":"🔢","category":"Symbols"},{"name":"clock4","key":"clock4","names":["clock4"],"emoji":"🕓","category":"Travel & Places"},{"name":"female-astronaut","key":"female-astronaut","names":["female-astronaut"],"emoji":"👩‍🚀","category":"Smileys & People","variants":{"1F3FB":{"name":"female-astronaut","key":"female-astronaut-1F3FB","emoji":"👩🏻‍🚀"},"1F3FC":{"name":"female-astronaut","key":"female-astronaut-1F3FC","emoji":"👩🏼‍🚀"},"1F3FD":{"name":"female-astronaut","key":"female-astronaut-1F3FD","emoji":"👩🏽‍🚀"},"1F3FE":{"name":"female-astronaut","key":"female-astronaut-1F3FE","emoji":"👩🏾‍🚀"},"1F3FF":{"name":"female-astronaut","key":"female-astronaut-1F3FF","emoji":"👩🏿‍🚀"}}},{"name":"flag-lv","key":"flag-lv","names":["flag-lv"],"emoji":"🇱🇻","category":"Flags"},{"name":"gear","key":"gear","names":["gear"],"emoji":"⚙️","category":"Objects"},{"name":"male-firefighter","key":"male-firefighter","names":["male-firefighter"],"emoji":"👨‍🚒","category":"Smileys & People","variants":{"1F3FB":{"name":"male-firefighter","key":"male-firefighter-1F3FB","emoji":"👨🏻‍🚒"},"1F3FC":{"name":"male-firefighter","key":"male-firefighter-1F3FC","emoji":"👨🏼‍🚒"},"1F3FD":{"name":"male-firefighter","key":"male-firefighter-1F3FD","emoji":"👨🏽‍🚒"},"1F3FE":{"name":"male-firefighter","key":"male-firefighter-1F3FE","emoji":"👨🏾‍🚒"},"1F3FF":{"name":"male-firefighter","key":"male-firefighter-1F3FF","emoji":"👨🏿‍🚒"}}},{"name":"flag-ly","key":"flag-ly","names":["flag-ly"],"emoji":"🇱🇾","category":"Flags"},{"name":"symbols","key":"symbols","names":["symbols"],"emoji":"🔣","category":"Symbols"},{"name":"clock430","key":"clock430","names":["clock430"],"emoji":"🕟","category":"Travel & Places"},{"name":"flag-ma","key":"flag-ma","names":["flag-ma"],"emoji":"🇲🇦","category":"Flags"},{"name":"compression","key":"compression","names":["compression"],"emoji":"🗜️","category":"Objects"},{"name":"female-firefighter","key":"female-firefighter","names":["female-firefighter"],"emoji":"👩‍🚒","category":"Smileys & People","variants":{"1F3FB":{"name":"female-firefighter","key":"female-firefighter-1F3FB","emoji":"👩🏻‍🚒"},"1F3FC":{"name":"female-firefighter","key":"female-firefighter-1F3FC","emoji":"👩🏼‍🚒"},"1F3FD":{"name":"female-firefighter","key":"female-firefighter-1F3FD","emoji":"👩🏽‍🚒"},"1F3FE":{"name":"female-firefighter","key":"female-firefighter-1F3FE","emoji":"👩🏾‍🚒"},"1F3FF":{"name":"female-firefighter","key":"female-firefighter-1F3FF","emoji":"👩🏿‍🚒"}}},{"name":"abc","key":"abc","names":["abc"],"emoji":"🔤","category":"Symbols"},{"name":"clock5","key":"clock5","names":["clock5"],"emoji":"🕔","category":"Travel & Places"},{"name":"clock530","key":"clock530","names":["clock530"],"emoji":"🕠","category":"Travel & Places"},{"name":"a","key":"a","names":["a"],"emoji":"🅰️","category":"Symbols"},{"name":"alembic","key":"alembic","names":["alembic"],"emoji":"⚗️","category":"Objects"},{"name":"flag-mc","key":"flag-mc","names":["flag-mc"],"emoji":"🇲🇨","category":"Flags"},{"name":"cop","key":"cop","names":["cop"],"emoji":"👮","category":"Smileys & People","variants":{"1F3FB":{"name":"cop","key":"cop-1F3FB","emoji":"👮🏻"},"1F3FC":{"name":"cop","key":"cop-1F3FC","emoji":"👮🏼"},"1F3FD":{"name":"cop","key":"cop-1F3FD","emoji":"👮🏽"},"1F3FE":{"name":"cop","key":"cop-1F3FE","emoji":"👮🏾"},"1F3FF":{"name":"cop","key":"cop-1F3FF","emoji":"👮🏿"}}},{"name":"scales","key":"scales","names":["scales"],"emoji":"⚖️","category":"Objects"},{"name":"clock6","key":"clock6","names":["clock6"],"emoji":"🕕","category":"Travel & Places"},{"name":"flag-md","key":"flag-md","names":["flag-md"],"emoji":"🇲🇩","category":"Flags"},{"name":"ab","key":"ab","names":["ab"],"emoji":"🆎","category":"Symbols"},{"name":"male-police-officer","key":"male-police-officer","names":["male-police-officer"],"emoji":"👮‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-police-officer","key":"male-police-officer-1F3FB","emoji":"👮🏻‍♂️"},"1F3FC":{"name":"male-police-officer","key":"male-police-officer-1F3FC","emoji":"👮🏼‍♂️"},"1F3FD":{"name":"male-police-officer","key":"male-police-officer-1F3FD","emoji":"👮🏽‍♂️"},"1F3FE":{"name":"male-police-officer","key":"male-police-officer-1F3FE","emoji":"👮🏾‍♂️"},"1F3FF":{"name":"male-police-officer","key":"male-police-officer-1F3FF","emoji":"👮🏿‍♂️"}}},{"name":"link","key":"link","names":["link"],"emoji":"🔗","category":"Objects"},{"name":"flag-me","key":"flag-me","names":["flag-me"],"emoji":"🇲🇪","category":"Flags"},{"name":"clock630","key":"clock630","names":["clock630"],"emoji":"🕡","category":"Travel & Places"},{"name":"b","key":"b","names":["b"],"emoji":"🅱️","category":"Symbols"},{"name":"female-police-officer","key":"female-police-officer","names":["female-police-officer"],"emoji":"👮‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-police-officer","key":"female-police-officer-1F3FB","emoji":"👮🏻‍♀️"},"1F3FC":{"name":"female-police-officer","key":"female-police-officer-1F3FC","emoji":"👮🏼‍♀️"},"1F3FD":{"name":"female-police-officer","key":"female-police-officer-1F3FD","emoji":"👮🏽‍♀️"},"1F3FE":{"name":"female-police-officer","key":"female-police-officer-1F3FE","emoji":"👮🏾‍♀️"},"1F3FF":{"name":"female-police-officer","key":"female-police-officer-1F3FF","emoji":"👮🏿‍♀️"}}},{"name":"clock7","key":"clock7","names":["clock7"],"emoji":"🕖","category":"Travel & Places"},{"name":"cl","key":"cl","names":["cl"],"emoji":"🆑","category":"Symbols"},{"name":"sleuth_or_spy","key":"sleuth_or_spy","names":["sleuth_or_spy"],"emoji":"🕵️","category":"Smileys & People","variants":{"1F3FB":{"name":"sleuth_or_spy","key":"sleuth_or_spy-1F3FB","emoji":"🕵🏻"},"1F3FC":{"name":"sleuth_or_spy","key":"sleuth_or_spy-1F3FC","emoji":"🕵🏼"},"1F3FD":{"name":"sleuth_or_spy","key":"sleuth_or_spy-1F3FD","emoji":"🕵🏽"},"1F3FE":{"name":"sleuth_or_spy","key":"sleuth_or_spy-1F3FE","emoji":"🕵🏾"},"1F3FF":{"name":"sleuth_or_spy","key":"sleuth_or_spy-1F3FF","emoji":"🕵🏿"}}},{"name":"flag-mf","key":"flag-mf","names":["flag-mf"],"emoji":"🇲🇫","category":"Flags"},{"name":"chains","key":"chains","names":["chains"],"emoji":"⛓️","category":"Objects"},{"name":"syringe","key":"syringe","names":["syringe"],"emoji":"💉","category":"Objects"},{"name":"male-detective","key":"male-detective","names":["male-detective"],"emoji":"🕵️‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-detective","key":"male-detective-1F3FB","emoji":"🕵🏻‍♂️"},"1F3FC":{"name":"male-detective","key":"male-detective-1F3FC","emoji":"🕵🏼‍♂️"},"1F3FD":{"name":"male-detective","key":"male-detective-1F3FD","emoji":"🕵🏽‍♂️"},"1F3FE":{"name":"male-detective","key":"male-detective-1F3FE","emoji":"🕵🏾‍♂️"},"1F3FF":{"name":"male-detective","key":"male-detective-1F3FF","emoji":"🕵🏿‍♂️"}}},{"name":"cool","key":"cool","names":["cool"],"emoji":"🆒","category":"Symbols"},{"name":"clock730","key":"clock730","names":["clock730"],"emoji":"🕢","category":"Travel & Places"},{"name":"flag-mg","key":"flag-mg","names":["flag-mg"],"emoji":"🇲🇬","category":"Flags"},{"name":"free","key":"free","names":["free"],"emoji":"🆓","category":"Symbols"},{"name":"flag-mh","key":"flag-mh","names":["flag-mh"],"emoji":"🇲🇭","category":"Flags"},{"name":"clock8","key":"clock8","names":["clock8"],"emoji":"🕗","category":"Travel & Places"},{"name":"pill","key":"pill","names":["pill"],"emoji":"💊","category":"Objects"},{"name":"female-detective","key":"female-detective","names":["female-detective"],"emoji":"🕵️‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-detective","key":"female-detective-1F3FB","emoji":"🕵🏻‍♀️"},"1F3FC":{"name":"female-detective","key":"female-detective-1F3FC","emoji":"🕵🏼‍♀️"},"1F3FD":{"name":"female-detective","key":"female-detective-1F3FD","emoji":"🕵🏽‍♀️"},"1F3FE":{"name":"female-detective","key":"female-detective-1F3FE","emoji":"🕵🏾‍♀️"},"1F3FF":{"name":"female-detective","key":"female-detective-1F3FF","emoji":"🕵🏿‍♀️"}}},{"name":"clock830","key":"clock830","names":["clock830"],"emoji":"🕣","category":"Travel & Places"},{"name":"guardsman","key":"guardsman","names":["guardsman"],"emoji":"💂","category":"Smileys & People","variants":{"1F3FB":{"name":"guardsman","key":"guardsman-1F3FB","emoji":"💂🏻"},"1F3FC":{"name":"guardsman","key":"guardsman-1F3FC","emoji":"💂🏼"},"1F3FD":{"name":"guardsman","key":"guardsman-1F3FD","emoji":"💂🏽"},"1F3FE":{"name":"guardsman","key":"guardsman-1F3FE","emoji":"💂🏾"},"1F3FF":{"name":"guardsman","key":"guardsman-1F3FF","emoji":"💂🏿"}}},{"name":"information_source","key":"information_source","names":["information_source"],"emoji":"ℹ️","category":"Symbols"},{"name":"flag-mk","key":"flag-mk","names":["flag-mk"],"emoji":"🇲🇰","category":"Flags"},{"name":"smoking","key":"smoking","names":["smoking"],"emoji":"🚬","category":"Objects"},{"name":"id","key":"id","names":["id"],"emoji":"🆔","category":"Symbols"},{"name":"clock9","key":"clock9","names":["clock9"],"emoji":"🕘","category":"Travel & Places"},{"name":"flag-ml","key":"flag-ml","names":["flag-ml"],"emoji":"🇲🇱","category":"Flags"},{"name":"coffin","key":"coffin","names":["coffin"],"emoji":"⚰️","category":"Objects"},{"name":"male-guard","key":"male-guard","names":["male-guard"],"emoji":"💂‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-guard","key":"male-guard-1F3FB","emoji":"💂🏻‍♂️"},"1F3FC":{"name":"male-guard","key":"male-guard-1F3FC","emoji":"💂🏼‍♂️"},"1F3FD":{"name":"male-guard","key":"male-guard-1F3FD","emoji":"💂🏽‍♂️"},"1F3FE":{"name":"male-guard","key":"male-guard-1F3FE","emoji":"💂🏾‍♂️"},"1F3FF":{"name":"male-guard","key":"male-guard-1F3FF","emoji":"💂🏿‍♂️"}}},{"name":"m","key":"m","names":["m"],"emoji":"Ⓜ️","category":"Symbols"},{"name":"funeral_urn","key":"funeral_urn","names":["funeral_urn"],"emoji":"⚱️","category":"Objects"},{"name":"female-guard","key":"female-guard","names":["female-guard"],"emoji":"💂‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-guard","key":"female-guard-1F3FB","emoji":"💂🏻‍♀️"},"1F3FC":{"name":"female-guard","key":"female-guard-1F3FC","emoji":"💂🏼‍♀️"},"1F3FD":{"name":"female-guard","key":"female-guard-1F3FD","emoji":"💂🏽‍♀️"},"1F3FE":{"name":"female-guard","key":"female-guard-1F3FE","emoji":"💂🏾‍♀️"},"1F3FF":{"name":"female-guard","key":"female-guard-1F3FF","emoji":"💂🏿‍♀️"}}},{"name":"flag-mm","key":"flag-mm","names":["flag-mm"],"emoji":"🇲🇲","category":"Flags"},{"name":"clock930","key":"clock930","names":["clock930"],"emoji":"🕤","category":"Travel & Places"},{"name":"moyai","key":"moyai","names":["moyai"],"emoji":"🗿","category":"Objects"},{"name":"new","key":"new","names":["new"],"emoji":"🆕","category":"Symbols"},{"name":"flag-mn","key":"flag-mn","names":["flag-mn"],"emoji":"🇲🇳","category":"Flags"},{"name":"construction_worker","key":"construction_worker","names":["construction_worker"],"emoji":"👷","category":"Smileys & People","variants":{"1F3FB":{"name":"construction_worker","key":"construction_worker-1F3FB","emoji":"👷🏻"},"1F3FC":{"name":"construction_worker","key":"construction_worker-1F3FC","emoji":"👷🏼"},"1F3FD":{"name":"construction_worker","key":"construction_worker-1F3FD","emoji":"👷🏽"},"1F3FE":{"name":"construction_worker","key":"construction_worker-1F3FE","emoji":"👷🏾"},"1F3FF":{"name":"construction_worker","key":"construction_worker-1F3FF","emoji":"👷🏿"}}},{"name":"clock10","key":"clock10","names":["clock10"],"emoji":"🕙","category":"Travel & Places"},{"name":"clock1030","key":"clock1030","names":["clock1030"],"emoji":"🕥","category":"Travel & Places"},{"name":"ng","key":"ng","names":["ng"],"emoji":"🆖","category":"Symbols"},{"name":"male-construction-worker","key":"male-construction-worker","names":["male-construction-worker"],"emoji":"👷‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male-construction-worker","key":"male-construction-worker-1F3FB","emoji":"👷🏻‍♂️"},"1F3FC":{"name":"male-construction-worker","key":"male-construction-worker-1F3FC","emoji":"👷🏼‍♂️"},"1F3FD":{"name":"male-construction-worker","key":"male-construction-worker-1F3FD","emoji":"👷🏽‍♂️"},"1F3FE":{"name":"male-construction-worker","key":"male-construction-worker-1F3FE","emoji":"👷🏾‍♂️"},"1F3FF":{"name":"male-construction-worker","key":"male-construction-worker-1F3FF","emoji":"👷🏿‍♂️"}}},{"name":"flag-mo","key":"flag-mo","names":["flag-mo"],"emoji":"🇲🇴","category":"Flags"},{"name":"oil_drum","key":"oil_drum","names":["oil_drum"],"emoji":"🛢️","category":"Objects"},{"name":"o2","key":"o2","names":["o2"],"emoji":"🅾️","category":"Symbols"},{"name":"female-construction-worker","key":"female-construction-worker","names":["female-construction-worker"],"emoji":"👷‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female-construction-worker","key":"female-construction-worker-1F3FB","emoji":"👷🏻‍♀️"},"1F3FC":{"name":"female-construction-worker","key":"female-construction-worker-1F3FC","emoji":"👷🏼‍♀️"},"1F3FD":{"name":"female-construction-worker","key":"female-construction-worker-1F3FD","emoji":"👷🏽‍♀️"},"1F3FE":{"name":"female-construction-worker","key":"female-construction-worker-1F3FE","emoji":"👷🏾‍♀️"},"1F3FF":{"name":"female-construction-worker","key":"female-construction-worker-1F3FF","emoji":"👷🏿‍♀️"}}},{"name":"clock11","key":"clock11","names":["clock11"],"emoji":"🕚","category":"Travel & Places"},{"name":"crystal_ball","key":"crystal_ball","names":["crystal_ball"],"emoji":"🔮","category":"Objects"},{"name":"flag-mp","key":"flag-mp","names":["flag-mp"],"emoji":"🇲🇵","category":"Flags"},{"name":"flag-mq","key":"flag-mq","names":["flag-mq"],"emoji":"🇲🇶","category":"Flags"},{"name":"prince","key":"prince","names":["prince"],"emoji":"🤴","category":"Smileys & People","variants":{"1F3FB":{"name":"prince","key":"prince-1F3FB","emoji":"🤴🏻"},"1F3FC":{"name":"prince","key":"prince-1F3FC","emoji":"🤴🏼"},"1F3FD":{"name":"prince","key":"prince-1F3FD","emoji":"🤴🏽"},"1F3FE":{"name":"prince","key":"prince-1F3FE","emoji":"🤴🏾"},"1F3FF":{"name":"prince","key":"prince-1F3FF","emoji":"🤴🏿"}}},{"name":"ok","key":"ok","names":["ok"],"emoji":"🆗","category":"Symbols"},{"name":"clock1130","key":"clock1130","names":["clock1130"],"emoji":"🕦","category":"Travel & Places"},{"name":"shopping_trolley","key":"shopping_trolley","names":["shopping_trolley"],"emoji":"🛒","category":"Objects"},{"name":"flag-mr","key":"flag-mr","names":["flag-mr"],"emoji":"🇲🇷","category":"Flags"},{"name":"princess","key":"princess","names":["princess"],"emoji":"👸","category":"Smileys & People","variants":{"1F3FB":{"name":"princess","key":"princess-1F3FB","emoji":"👸🏻"},"1F3FC":{"name":"princess","key":"princess-1F3FC","emoji":"👸🏼"},"1F3FD":{"name":"princess","key":"princess-1F3FD","emoji":"👸🏽"},"1F3FE":{"name":"princess","key":"princess-1F3FE","emoji":"👸🏾"},"1F3FF":{"name":"princess","key":"princess-1F3FF","emoji":"👸🏿"}}},{"name":"new_moon","key":"new_moon","names":["new_moon"],"emoji":"🌑","category":"Travel & Places"},{"name":"parking","key":"parking","names":["parking"],"emoji":"🅿️","category":"Symbols"},{"name":"sos","key":"sos","names":["sos"],"emoji":"🆘","category":"Symbols"},{"name":"man_with_turban","key":"man_with_turban","names":["man_with_turban"],"emoji":"👳","category":"Smileys & People","variants":{"1F3FB":{"name":"man_with_turban","key":"man_with_turban-1F3FB","emoji":"👳🏻"},"1F3FC":{"name":"man_with_turban","key":"man_with_turban-1F3FC","emoji":"👳🏼"},"1F3FD":{"name":"man_with_turban","key":"man_with_turban-1F3FD","emoji":"👳🏽"},"1F3FE":{"name":"man_with_turban","key":"man_with_turban-1F3FE","emoji":"👳🏾"},"1F3FF":{"name":"man_with_turban","key":"man_with_turban-1F3FF","emoji":"👳🏿"}}},{"name":"flag-ms","key":"flag-ms","names":["flag-ms"],"emoji":"🇲🇸","category":"Flags"},{"name":"waxing_crescent_moon","key":"waxing_crescent_moon","names":["waxing_crescent_moon"],"emoji":"🌒","category":"Travel & Places"},{"name":"up","key":"up","names":["up"],"emoji":"🆙","category":"Symbols"},{"name":"first_quarter_moon","key":"first_quarter_moon","names":["first_quarter_moon"],"emoji":"🌓","category":"Travel & Places"},{"name":"flag-mt","key":"flag-mt","names":["flag-mt"],"emoji":"🇲🇹","category":"Flags"},{"name":"man-wearing-turban","key":"man-wearing-turban","names":["man-wearing-turban"],"emoji":"👳‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-wearing-turban","key":"man-wearing-turban-1F3FB","emoji":"👳🏻‍♂️"},"1F3FC":{"name":"man-wearing-turban","key":"man-wearing-turban-1F3FC","emoji":"👳🏼‍♂️"},"1F3FD":{"name":"man-wearing-turban","key":"man-wearing-turban-1F3FD","emoji":"👳🏽‍♂️"},"1F3FE":{"name":"man-wearing-turban","key":"man-wearing-turban-1F3FE","emoji":"👳🏾‍♂️"},"1F3FF":{"name":"man-wearing-turban","key":"man-wearing-turban-1F3FF","emoji":"👳🏿‍♂️"}}},{"name":"moon","key":"moon","names":["moon","waxing_gibbous_moon"],"emoji":"🌔","category":"Travel & Places"},{"name":"woman-wearing-turban","key":"woman-wearing-turban","names":["woman-wearing-turban"],"emoji":"👳‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-wearing-turban","key":"woman-wearing-turban-1F3FB","emoji":"👳🏻‍♀️"},"1F3FC":{"name":"woman-wearing-turban","key":"woman-wearing-turban-1F3FC","emoji":"👳🏼‍♀️"},"1F3FD":{"name":"woman-wearing-turban","key":"woman-wearing-turban-1F3FD","emoji":"👳🏽‍♀️"},"1F3FE":{"name":"woman-wearing-turban","key":"woman-wearing-turban-1F3FE","emoji":"👳🏾‍♀️"},"1F3FF":{"name":"woman-wearing-turban","key":"woman-wearing-turban-1F3FF","emoji":"👳🏿‍♀️"}}},{"name":"vs","key":"vs","names":["vs"],"emoji":"🆚","category":"Symbols"},{"name":"flag-mu","key":"flag-mu","names":["flag-mu"],"emoji":"🇲🇺","category":"Flags"},{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao","names":["man_with_gua_pi_mao"],"emoji":"👲","category":"Smileys & People","variants":{"1F3FB":{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao-1F3FB","emoji":"👲🏻"},"1F3FC":{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao-1F3FC","emoji":"👲🏼"},"1F3FD":{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao-1F3FD","emoji":"👲🏽"},"1F3FE":{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao-1F3FE","emoji":"👲🏾"},"1F3FF":{"name":"man_with_gua_pi_mao","key":"man_with_gua_pi_mao-1F3FF","emoji":"👲🏿"}}},{"name":"koko","key":"koko","names":["koko"],"emoji":"🈁","category":"Symbols"},{"name":"full_moon","key":"full_moon","names":["full_moon"],"emoji":"🌕","category":"Travel & Places"},{"name":"flag-mv","key":"flag-mv","names":["flag-mv"],"emoji":"🇲🇻","category":"Flags"},{"name":"person_with_headscarf","key":"person_with_headscarf","names":["person_with_headscarf"],"emoji":"🧕","category":"Smileys & People","variants":{"1F3FB":{"name":"person_with_headscarf","key":"person_with_headscarf-1F3FB","emoji":"🧕🏻"},"1F3FC":{"name":"person_with_headscarf","key":"person_with_headscarf-1F3FC","emoji":"🧕🏼"},"1F3FD":{"name":"person_with_headscarf","key":"person_with_headscarf-1F3FD","emoji":"🧕🏽"},"1F3FE":{"name":"person_with_headscarf","key":"person_with_headscarf-1F3FE","emoji":"🧕🏾"},"1F3FF":{"name":"person_with_headscarf","key":"person_with_headscarf-1F3FF","emoji":"🧕🏿"}}},{"name":"waning_gibbous_moon","key":"waning_gibbous_moon","names":["waning_gibbous_moon"],"emoji":"🌖","category":"Travel & Places"},{"name":"sa","key":"sa","names":["sa"],"emoji":"🈂️","category":"Symbols"},{"name":"flag-mw","key":"flag-mw","names":["flag-mw"],"emoji":"🇲🇼","category":"Flags"},{"name":"last_quarter_moon","key":"last_quarter_moon","names":["last_quarter_moon"],"emoji":"🌗","category":"Travel & Places"},{"name":"u6708","key":"u6708","names":["u6708"],"emoji":"🈷️","category":"Symbols"},{"name":"bearded_person","key":"bearded_person","names":["bearded_person"],"emoji":"🧔","category":"Smileys & People","variants":{"1F3FB":{"name":"bearded_person","key":"bearded_person-1F3FB","emoji":"🧔🏻"},"1F3FC":{"name":"bearded_person","key":"bearded_person-1F3FC","emoji":"🧔🏼"},"1F3FD":{"name":"bearded_person","key":"bearded_person-1F3FD","emoji":"🧔🏽"},"1F3FE":{"name":"bearded_person","key":"bearded_person-1F3FE","emoji":"🧔🏾"},"1F3FF":{"name":"bearded_person","key":"bearded_person-1F3FF","emoji":"🧔🏿"}}},{"name":"flag-mx","key":"flag-mx","names":["flag-mx"],"emoji":"🇲🇽","category":"Flags"},{"name":"u6709","key":"u6709","names":["u6709"],"emoji":"🈶","category":"Symbols"},{"name":"person_with_blond_hair","key":"person_with_blond_hair","names":["person_with_blond_hair"],"emoji":"👱","category":"Smileys & People","variants":{"1F3FB":{"name":"person_with_blond_hair","key":"person_with_blond_hair-1F3FB","emoji":"👱🏻"},"1F3FC":{"name":"person_with_blond_hair","key":"person_with_blond_hair-1F3FC","emoji":"👱🏼"},"1F3FD":{"name":"person_with_blond_hair","key":"person_with_blond_hair-1F3FD","emoji":"👱🏽"},"1F3FE":{"name":"person_with_blond_hair","key":"person_with_blond_hair-1F3FE","emoji":"👱🏾"},"1F3FF":{"name":"person_with_blond_hair","key":"person_with_blond_hair-1F3FF","emoji":"👱🏿"}}},{"name":"waning_crescent_moon","key":"waning_crescent_moon","names":["waning_crescent_moon"],"emoji":"🌘","category":"Travel & Places"},{"name":"flag-my","key":"flag-my","names":["flag-my"],"emoji":"🇲🇾","category":"Flags"},{"name":"u6307","key":"u6307","names":["u6307"],"emoji":"🈯","category":"Symbols"},{"name":"blond-haired-man","key":"blond-haired-man","names":["blond-haired-man"],"emoji":"👱‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"blond-haired-man","key":"blond-haired-man-1F3FB","emoji":"👱🏻‍♂️"},"1F3FC":{"name":"blond-haired-man","key":"blond-haired-man-1F3FC","emoji":"👱🏼‍♂️"},"1F3FD":{"name":"blond-haired-man","key":"blond-haired-man-1F3FD","emoji":"👱🏽‍♂️"},"1F3FE":{"name":"blond-haired-man","key":"blond-haired-man-1F3FE","emoji":"👱🏾‍♂️"},"1F3FF":{"name":"blond-haired-man","key":"blond-haired-man-1F3FF","emoji":"👱🏿‍♂️"}}},{"name":"crescent_moon","key":"crescent_moon","names":["crescent_moon"],"emoji":"🌙","category":"Travel & Places"},{"name":"flag-mz","key":"flag-mz","names":["flag-mz"],"emoji":"🇲🇿","category":"Flags"},{"name":"new_moon_with_face","key":"new_moon_with_face","names":["new_moon_with_face"],"emoji":"🌚","category":"Travel & Places"},{"name":"flag-na","key":"flag-na","names":["flag-na"],"emoji":"🇳🇦","category":"Flags"},{"name":"blond-haired-woman","key":"blond-haired-woman","names":["blond-haired-woman"],"emoji":"👱‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"blond-haired-woman","key":"blond-haired-woman-1F3FB","emoji":"👱🏻‍♀️"},"1F3FC":{"name":"blond-haired-woman","key":"blond-haired-woman-1F3FC","emoji":"👱🏼‍♀️"},"1F3FD":{"name":"blond-haired-woman","key":"blond-haired-woman-1F3FD","emoji":"👱🏽‍♀️"},"1F3FE":{"name":"blond-haired-woman","key":"blond-haired-woman-1F3FE","emoji":"👱🏾‍♀️"},"1F3FF":{"name":"blond-haired-woman","key":"blond-haired-woman-1F3FF","emoji":"👱🏿‍♀️"}}},{"name":"ideograph_advantage","key":"ideograph_advantage","names":["ideograph_advantage"],"emoji":"🉐","category":"Symbols"},{"name":"first_quarter_moon_with_face","key":"first_quarter_moon_with_face","names":["first_quarter_moon_with_face"],"emoji":"🌛","category":"Travel & Places"},{"name":"man_in_tuxedo","key":"man_in_tuxedo","names":["man_in_tuxedo"],"emoji":"🤵","category":"Smileys & People","variants":{"1F3FB":{"name":"man_in_tuxedo","key":"man_in_tuxedo-1F3FB","emoji":"🤵🏻"},"1F3FC":{"name":"man_in_tuxedo","key":"man_in_tuxedo-1F3FC","emoji":"🤵🏼"},"1F3FD":{"name":"man_in_tuxedo","key":"man_in_tuxedo-1F3FD","emoji":"🤵🏽"},"1F3FE":{"name":"man_in_tuxedo","key":"man_in_tuxedo-1F3FE","emoji":"🤵🏾"},"1F3FF":{"name":"man_in_tuxedo","key":"man_in_tuxedo-1F3FF","emoji":"🤵🏿"}}},{"name":"flag-nc","key":"flag-nc","names":["flag-nc"],"emoji":"🇳🇨","category":"Flags"},{"name":"u5272","key":"u5272","names":["u5272"],"emoji":"🈹","category":"Symbols"},{"name":"flag-ne","key":"flag-ne","names":["flag-ne"],"emoji":"🇳🇪","category":"Flags"},{"name":"last_quarter_moon_with_face","key":"last_quarter_moon_with_face","names":["last_quarter_moon_with_face"],"emoji":"🌜","category":"Travel & Places"},{"name":"u7121","key":"u7121","names":["u7121"],"emoji":"🈚","category":"Symbols"},{"name":"bride_with_veil","key":"bride_with_veil","names":["bride_with_veil"],"emoji":"👰","category":"Smileys & People","variants":{"1F3FB":{"name":"bride_with_veil","key":"bride_with_veil-1F3FB","emoji":"👰🏻"},"1F3FC":{"name":"bride_with_veil","key":"bride_with_veil-1F3FC","emoji":"👰🏼"},"1F3FD":{"name":"bride_with_veil","key":"bride_with_veil-1F3FD","emoji":"👰🏽"},"1F3FE":{"name":"bride_with_veil","key":"bride_with_veil-1F3FE","emoji":"👰🏾"},"1F3FF":{"name":"bride_with_veil","key":"bride_with_veil-1F3FF","emoji":"👰🏿"}}},{"name":"u7981","key":"u7981","names":["u7981"],"emoji":"🈲","category":"Symbols"},{"name":"pregnant_woman","key":"pregnant_woman","names":["pregnant_woman"],"emoji":"🤰","category":"Smileys & People","variants":{"1F3FB":{"name":"pregnant_woman","key":"pregnant_woman-1F3FB","emoji":"🤰🏻"},"1F3FC":{"name":"pregnant_woman","key":"pregnant_woman-1F3FC","emoji":"🤰🏼"},"1F3FD":{"name":"pregnant_woman","key":"pregnant_woman-1F3FD","emoji":"🤰🏽"},"1F3FE":{"name":"pregnant_woman","key":"pregnant_woman-1F3FE","emoji":"🤰🏾"},"1F3FF":{"name":"pregnant_woman","key":"pregnant_woman-1F3FF","emoji":"🤰🏿"}}},{"name":"thermometer","key":"thermometer","names":["thermometer"],"emoji":"🌡️","category":"Travel & Places"},{"name":"flag-nf","key":"flag-nf","names":["flag-nf"],"emoji":"🇳🇫","category":"Flags"},{"name":"sunny","key":"sunny","names":["sunny"],"emoji":"☀️","category":"Travel & Places"},{"name":"accept","key":"accept","names":["accept"],"emoji":"🉑","category":"Symbols"},{"name":"flag-ng","key":"flag-ng","names":["flag-ng"],"emoji":"🇳🇬","category":"Flags"},{"name":"breast-feeding","key":"breast-feeding","names":["breast-feeding"],"emoji":"🤱","category":"Smileys & People","variants":{"1F3FB":{"name":"breast-feeding","key":"breast-feeding-1F3FB","emoji":"🤱🏻"},"1F3FC":{"name":"breast-feeding","key":"breast-feeding-1F3FC","emoji":"🤱🏼"},"1F3FD":{"name":"breast-feeding","key":"breast-feeding-1F3FD","emoji":"🤱🏽"},"1F3FE":{"name":"breast-feeding","key":"breast-feeding-1F3FE","emoji":"🤱🏾"},"1F3FF":{"name":"breast-feeding","key":"breast-feeding-1F3FF","emoji":"🤱🏿"}}},{"name":"full_moon_with_face","key":"full_moon_with_face","names":["full_moon_with_face"],"emoji":"🌝","category":"Travel & Places"},{"name":"flag-ni","key":"flag-ni","names":["flag-ni"],"emoji":"🇳🇮","category":"Flags"},{"name":"u7533","key":"u7533","names":["u7533"],"emoji":"🈸","category":"Symbols"},{"name":"angel","key":"angel","names":["angel"],"emoji":"👼","category":"Smileys & People","variants":{"1F3FB":{"name":"angel","key":"angel-1F3FB","emoji":"👼🏻"},"1F3FC":{"name":"angel","key":"angel-1F3FC","emoji":"👼🏼"},"1F3FD":{"name":"angel","key":"angel-1F3FD","emoji":"👼🏽"},"1F3FE":{"name":"angel","key":"angel-1F3FE","emoji":"👼🏾"},"1F3FF":{"name":"angel","key":"angel-1F3FF","emoji":"👼🏿"}}},{"name":"sun_with_face","key":"sun_with_face","names":["sun_with_face"],"emoji":"🌞","category":"Travel & Places"},{"name":"santa","key":"santa","names":["santa"],"emoji":"🎅","category":"Smileys & People","variants":{"1F3FB":{"name":"santa","key":"santa-1F3FB","emoji":"🎅🏻"},"1F3FC":{"name":"santa","key":"santa-1F3FC","emoji":"🎅🏼"},"1F3FD":{"name":"santa","key":"santa-1F3FD","emoji":"🎅🏽"},"1F3FE":{"name":"santa","key":"santa-1F3FE","emoji":"🎅🏾"},"1F3FF":{"name":"santa","key":"santa-1F3FF","emoji":"🎅🏿"}}},{"name":"u5408","key":"u5408","names":["u5408"],"emoji":"🈴","category":"Symbols"},{"name":"flag-nl","key":"flag-nl","names":["flag-nl"],"emoji":"🇳🇱","category":"Flags"},{"name":"mrs_claus","key":"mrs_claus","names":["mrs_claus","mother_christmas"],"emoji":"🤶","category":"Smileys & People","variants":{"1F3FB":{"name":"mrs_claus","key":"mrs_claus-1F3FB","emoji":"🤶🏻"},"1F3FC":{"name":"mrs_claus","key":"mrs_claus-1F3FC","emoji":"🤶🏼"},"1F3FD":{"name":"mrs_claus","key":"mrs_claus-1F3FD","emoji":"🤶🏽"},"1F3FE":{"name":"mrs_claus","key":"mrs_claus-1F3FE","emoji":"🤶🏾"},"1F3FF":{"name":"mrs_claus","key":"mrs_claus-1F3FF","emoji":"🤶🏿"}}},{"name":"u7a7a","key":"u7a7a","names":["u7a7a"],"emoji":"🈳","category":"Symbols"},{"name":"star","key":"star","names":["star"],"emoji":"⭐","category":"Travel & Places"},{"name":"flag-no","key":"flag-no","names":["flag-no"],"emoji":"🇳🇴","category":"Flags"},{"name":"mage","key":"mage","names":["mage"],"emoji":"🧙","category":"Smileys & People","variants":{"1F3FB":{"name":"mage","key":"mage-1F3FB","emoji":"🧙🏻"},"1F3FC":{"name":"mage","key":"mage-1F3FC","emoji":"🧙🏼"},"1F3FD":{"name":"mage","key":"mage-1F3FD","emoji":"🧙🏽"},"1F3FE":{"name":"mage","key":"mage-1F3FE","emoji":"🧙🏾"},"1F3FF":{"name":"mage","key":"mage-1F3FF","emoji":"🧙🏿"}}},{"name":"star2","key":"star2","names":["star2"],"emoji":"🌟","category":"Travel & Places"},{"name":"flag-np","key":"flag-np","names":["flag-np"],"emoji":"🇳🇵","category":"Flags"},{"name":"congratulations","key":"congratulations","names":["congratulations"],"emoji":"㊗️","category":"Symbols"},{"name":"flag-nr","key":"flag-nr","names":["flag-nr"],"emoji":"🇳🇷","category":"Flags"},{"name":"stars","key":"stars","names":["stars"],"emoji":"🌠","category":"Travel & Places"},{"name":"female_mage","key":"female_mage","names":["female_mage"],"emoji":"🧙‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female_mage","key":"female_mage-1F3FB","emoji":"🧙🏻‍♀️"},"1F3FC":{"name":"female_mage","key":"female_mage-1F3FC","emoji":"🧙🏼‍♀️"},"1F3FD":{"name":"female_mage","key":"female_mage-1F3FD","emoji":"🧙🏽‍♀️"},"1F3FE":{"name":"female_mage","key":"female_mage-1F3FE","emoji":"🧙🏾‍♀️"},"1F3FF":{"name":"female_mage","key":"female_mage-1F3FF","emoji":"🧙🏿‍♀️"}}},{"name":"secret","key":"secret","names":["secret"],"emoji":"㊙️","category":"Symbols"},{"name":"flag-nu","key":"flag-nu","names":["flag-nu"],"emoji":"🇳🇺","category":"Flags"},{"name":"u55b6","key":"u55b6","names":["u55b6"],"emoji":"🈺","category":"Symbols"},{"name":"male_mage","key":"male_mage","names":["male_mage"],"emoji":"🧙‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male_mage","key":"male_mage-1F3FB","emoji":"🧙🏻‍♂️"},"1F3FC":{"name":"male_mage","key":"male_mage-1F3FC","emoji":"🧙🏼‍♂️"},"1F3FD":{"name":"male_mage","key":"male_mage-1F3FD","emoji":"🧙🏽‍♂️"},"1F3FE":{"name":"male_mage","key":"male_mage-1F3FE","emoji":"🧙🏾‍♂️"},"1F3FF":{"name":"male_mage","key":"male_mage-1F3FF","emoji":"🧙🏿‍♂️"}}},{"name":"cloud","key":"cloud","names":["cloud"],"emoji":"☁️","category":"Travel & Places"},{"name":"flag-nz","key":"flag-nz","names":["flag-nz"],"emoji":"🇳🇿","category":"Flags"},{"name":"partly_sunny","key":"partly_sunny","names":["partly_sunny"],"emoji":"⛅","category":"Travel & Places"},{"name":"fairy","key":"fairy","names":["fairy"],"emoji":"🧚","category":"Smileys & People","variants":{"1F3FB":{"name":"fairy","key":"fairy-1F3FB","emoji":"🧚🏻"},"1F3FC":{"name":"fairy","key":"fairy-1F3FC","emoji":"🧚🏼"},"1F3FD":{"name":"fairy","key":"fairy-1F3FD","emoji":"🧚🏽"},"1F3FE":{"name":"fairy","key":"fairy-1F3FE","emoji":"🧚🏾"},"1F3FF":{"name":"fairy","key":"fairy-1F3FF","emoji":"🧚🏿"}}},{"name":"u6e80","key":"u6e80","names":["u6e80"],"emoji":"🈵","category":"Symbols"},{"name":"black_small_square","key":"black_small_square","names":["black_small_square"],"emoji":"▪️","category":"Symbols"},{"name":"thunder_cloud_and_rain","key":"thunder_cloud_and_rain","names":["thunder_cloud_and_rain"],"emoji":"⛈️","category":"Travel & Places"},{"name":"female_fairy","key":"female_fairy","names":["female_fairy"],"emoji":"🧚‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female_fairy","key":"female_fairy-1F3FB","emoji":"🧚🏻‍♀️"},"1F3FC":{"name":"female_fairy","key":"female_fairy-1F3FC","emoji":"🧚🏼‍♀️"},"1F3FD":{"name":"female_fairy","key":"female_fairy-1F3FD","emoji":"🧚🏽‍♀️"},"1F3FE":{"name":"female_fairy","key":"female_fairy-1F3FE","emoji":"🧚🏾‍♀️"},"1F3FF":{"name":"female_fairy","key":"female_fairy-1F3FF","emoji":"🧚🏿‍♀️"}}},{"name":"flag-om","key":"flag-om","names":["flag-om"],"emoji":"🇴🇲","category":"Flags"},{"name":"white_small_square","key":"white_small_square","names":["white_small_square"],"emoji":"▫️","category":"Symbols"},{"name":"flag-pa","key":"flag-pa","names":["flag-pa"],"emoji":"🇵🇦","category":"Flags"},{"name":"mostly_sunny","key":"mostly_sunny","names":["mostly_sunny","sun_small_cloud"],"emoji":"🌤️","category":"Travel & Places"},{"name":"male_fairy","key":"male_fairy","names":["male_fairy"],"emoji":"🧚‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male_fairy","key":"male_fairy-1F3FB","emoji":"🧚🏻‍♂️"},"1F3FC":{"name":"male_fairy","key":"male_fairy-1F3FC","emoji":"🧚🏼‍♂️"},"1F3FD":{"name":"male_fairy","key":"male_fairy-1F3FD","emoji":"🧚🏽‍♂️"},"1F3FE":{"name":"male_fairy","key":"male_fairy-1F3FE","emoji":"🧚🏾‍♂️"},"1F3FF":{"name":"male_fairy","key":"male_fairy-1F3FF","emoji":"🧚🏿‍♂️"}}},{"name":"barely_sunny","key":"barely_sunny","names":["barely_sunny","sun_behind_cloud"],"emoji":"🌥️","category":"Travel & Places"},{"name":"white_medium_square","key":"white_medium_square","names":["white_medium_square"],"emoji":"◻️","category":"Symbols"},{"name":"flag-pe","key":"flag-pe","names":["flag-pe"],"emoji":"🇵🇪","category":"Flags"},{"name":"vampire","key":"vampire","names":["vampire"],"emoji":"🧛","category":"Smileys & People","variants":{"1F3FB":{"name":"vampire","key":"vampire-1F3FB","emoji":"🧛🏻"},"1F3FC":{"name":"vampire","key":"vampire-1F3FC","emoji":"🧛🏼"},"1F3FD":{"name":"vampire","key":"vampire-1F3FD","emoji":"🧛🏽"},"1F3FE":{"name":"vampire","key":"vampire-1F3FE","emoji":"🧛🏾"},"1F3FF":{"name":"vampire","key":"vampire-1F3FF","emoji":"🧛🏿"}}},{"name":"female_vampire","key":"female_vampire","names":["female_vampire"],"emoji":"🧛‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female_vampire","key":"female_vampire-1F3FB","emoji":"🧛🏻‍♀️"},"1F3FC":{"name":"female_vampire","key":"female_vampire-1F3FC","emoji":"🧛🏼‍♀️"},"1F3FD":{"name":"female_vampire","key":"female_vampire-1F3FD","emoji":"🧛🏽‍♀️"},"1F3FE":{"name":"female_vampire","key":"female_vampire-1F3FE","emoji":"🧛🏾‍♀️"},"1F3FF":{"name":"female_vampire","key":"female_vampire-1F3FF","emoji":"🧛🏿‍♀️"}}},{"name":"partly_sunny_rain","key":"partly_sunny_rain","names":["partly_sunny_rain","sun_behind_rain_cloud"],"emoji":"🌦️","category":"Travel & Places"},{"name":"flag-pf","key":"flag-pf","names":["flag-pf"],"emoji":"🇵🇫","category":"Flags"},{"name":"black_medium_square","key":"black_medium_square","names":["black_medium_square"],"emoji":"◼️","category":"Symbols"},{"name":"white_medium_small_square","key":"white_medium_small_square","names":["white_medium_small_square"],"emoji":"◽","category":"Symbols"},{"name":"rain_cloud","key":"rain_cloud","names":["rain_cloud"],"emoji":"🌧️","category":"Travel & Places"},{"name":"flag-pg","key":"flag-pg","names":["flag-pg"],"emoji":"🇵🇬","category":"Flags"},{"name":"male_vampire","key":"male_vampire","names":["male_vampire"],"emoji":"🧛‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male_vampire","key":"male_vampire-1F3FB","emoji":"🧛🏻‍♂️"},"1F3FC":{"name":"male_vampire","key":"male_vampire-1F3FC","emoji":"🧛🏼‍♂️"},"1F3FD":{"name":"male_vampire","key":"male_vampire-1F3FD","emoji":"🧛🏽‍♂️"},"1F3FE":{"name":"male_vampire","key":"male_vampire-1F3FE","emoji":"🧛🏾‍♂️"},"1F3FF":{"name":"male_vampire","key":"male_vampire-1F3FF","emoji":"🧛🏿‍♂️"}}},{"name":"flag-ph","key":"flag-ph","names":["flag-ph"],"emoji":"🇵🇭","category":"Flags"},{"name":"merperson","key":"merperson","names":["merperson"],"emoji":"🧜","category":"Smileys & People","variants":{"1F3FB":{"name":"merperson","key":"merperson-1F3FB","emoji":"🧜🏻"},"1F3FC":{"name":"merperson","key":"merperson-1F3FC","emoji":"🧜🏼"},"1F3FD":{"name":"merperson","key":"merperson-1F3FD","emoji":"🧜🏽"},"1F3FE":{"name":"merperson","key":"merperson-1F3FE","emoji":"🧜🏾"},"1F3FF":{"name":"merperson","key":"merperson-1F3FF","emoji":"🧜🏿"}}},{"name":"black_medium_small_square","key":"black_medium_small_square","names":["black_medium_small_square"],"emoji":"◾","category":"Symbols"},{"name":"snow_cloud","key":"snow_cloud","names":["snow_cloud"],"emoji":"🌨️","category":"Travel & Places"},{"name":"lightning","key":"lightning","names":["lightning","lightning_cloud"],"emoji":"🌩️","category":"Travel & Places"},{"name":"black_large_square","key":"black_large_square","names":["black_large_square"],"emoji":"⬛","category":"Symbols"},{"name":"mermaid","key":"mermaid","names":["mermaid"],"emoji":"🧜‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"mermaid","key":"mermaid-1F3FB","emoji":"🧜🏻‍♀️"},"1F3FC":{"name":"mermaid","key":"mermaid-1F3FC","emoji":"🧜🏼‍♀️"},"1F3FD":{"name":"mermaid","key":"mermaid-1F3FD","emoji":"🧜🏽‍♀️"},"1F3FE":{"name":"mermaid","key":"mermaid-1F3FE","emoji":"🧜🏾‍♀️"},"1F3FF":{"name":"mermaid","key":"mermaid-1F3FF","emoji":"🧜🏿‍♀️"}}},{"name":"flag-pk","key":"flag-pk","names":["flag-pk"],"emoji":"🇵🇰","category":"Flags"},{"name":"merman","key":"merman","names":["merman"],"emoji":"🧜‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"merman","key":"merman-1F3FB","emoji":"🧜🏻‍♂️"},"1F3FC":{"name":"merman","key":"merman-1F3FC","emoji":"🧜🏼‍♂️"},"1F3FD":{"name":"merman","key":"merman-1F3FD","emoji":"🧜🏽‍♂️"},"1F3FE":{"name":"merman","key":"merman-1F3FE","emoji":"🧜🏾‍♂️"},"1F3FF":{"name":"merman","key":"merman-1F3FF","emoji":"🧜🏿‍♂️"}}},{"name":"white_large_square","key":"white_large_square","names":["white_large_square"],"emoji":"⬜","category":"Symbols"},{"name":"tornado","key":"tornado","names":["tornado","tornado_cloud"],"emoji":"🌪️","category":"Travel & Places"},{"name":"flag-pl","key":"flag-pl","names":["flag-pl"],"emoji":"🇵🇱","category":"Flags"},{"name":"elf","key":"elf","names":["elf"],"emoji":"🧝","category":"Smileys & People","variants":{"1F3FB":{"name":"elf","key":"elf-1F3FB","emoji":"🧝🏻"},"1F3FC":{"name":"elf","key":"elf-1F3FC","emoji":"🧝🏼"},"1F3FD":{"name":"elf","key":"elf-1F3FD","emoji":"🧝🏽"},"1F3FE":{"name":"elf","key":"elf-1F3FE","emoji":"🧝🏾"},"1F3FF":{"name":"elf","key":"elf-1F3FF","emoji":"🧝🏿"}}},{"name":"fog","key":"fog","names":["fog"],"emoji":"🌫️","category":"Travel & Places"},{"name":"large_orange_diamond","key":"large_orange_diamond","names":["large_orange_diamond"],"emoji":"🔶","category":"Symbols"},{"name":"flag-pm","key":"flag-pm","names":["flag-pm"],"emoji":"🇵🇲","category":"Flags"},{"name":"flag-pn","key":"flag-pn","names":["flag-pn"],"emoji":"🇵🇳","category":"Flags"},{"name":"wind_blowing_face","key":"wind_blowing_face","names":["wind_blowing_face"],"emoji":"🌬️","category":"Travel & Places"},{"name":"female_elf","key":"female_elf","names":["female_elf"],"emoji":"🧝‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"female_elf","key":"female_elf-1F3FB","emoji":"🧝🏻‍♀️"},"1F3FC":{"name":"female_elf","key":"female_elf-1F3FC","emoji":"🧝🏼‍♀️"},"1F3FD":{"name":"female_elf","key":"female_elf-1F3FD","emoji":"🧝🏽‍♀️"},"1F3FE":{"name":"female_elf","key":"female_elf-1F3FE","emoji":"🧝🏾‍♀️"},"1F3FF":{"name":"female_elf","key":"female_elf-1F3FF","emoji":"🧝🏿‍♀️"}}},{"name":"large_blue_diamond","key":"large_blue_diamond","names":["large_blue_diamond"],"emoji":"🔷","category":"Symbols"},{"name":"male_elf","key":"male_elf","names":["male_elf"],"emoji":"🧝‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"male_elf","key":"male_elf-1F3FB","emoji":"🧝🏻‍♂️"},"1F3FC":{"name":"male_elf","key":"male_elf-1F3FC","emoji":"🧝🏼‍♂️"},"1F3FD":{"name":"male_elf","key":"male_elf-1F3FD","emoji":"🧝🏽‍♂️"},"1F3FE":{"name":"male_elf","key":"male_elf-1F3FE","emoji":"🧝🏾‍♂️"},"1F3FF":{"name":"male_elf","key":"male_elf-1F3FF","emoji":"🧝🏿‍♂️"}}},{"name":"small_orange_diamond","key":"small_orange_diamond","names":["small_orange_diamond"],"emoji":"🔸","category":"Symbols"},{"name":"flag-pr","key":"flag-pr","names":["flag-pr"],"emoji":"🇵🇷","category":"Flags"},{"name":"cyclone","key":"cyclone","names":["cyclone"],"emoji":"🌀","category":"Travel & Places"},{"name":"rainbow","key":"rainbow","names":["rainbow"],"emoji":"🌈","category":"Travel & Places"},{"name":"small_blue_diamond","key":"small_blue_diamond","names":["small_blue_diamond"],"emoji":"🔹","category":"Symbols"},{"name":"genie","key":"genie","names":["genie"],"emoji":"🧞","category":"Smileys & People"},{"name":"flag-ps","key":"flag-ps","names":["flag-ps"],"emoji":"🇵🇸","category":"Flags"},{"name":"small_red_triangle","key":"small_red_triangle","names":["small_red_triangle"],"emoji":"🔺","category":"Symbols"},{"name":"closed_umbrella","key":"closed_umbrella","names":["closed_umbrella"],"emoji":"🌂","category":"Travel & Places"},{"name":"female_genie","key":"female_genie","names":["female_genie"],"emoji":"🧞‍♀️","category":"Smileys & People"},{"name":"flag-pt","key":"flag-pt","names":["flag-pt"],"emoji":"🇵🇹","category":"Flags"},{"name":"flag-pw","key":"flag-pw","names":["flag-pw"],"emoji":"🇵🇼","category":"Flags"},{"name":"small_red_triangle_down","key":"small_red_triangle_down","names":["small_red_triangle_down"],"emoji":"🔻","category":"Symbols"},{"name":"umbrella","key":"umbrella","names":["umbrella"],"emoji":"☂️","category":"Travel & Places"},{"name":"male_genie","key":"male_genie","names":["male_genie"],"emoji":"🧞‍♂️","category":"Smileys & People"},{"name":"zombie","key":"zombie","names":["zombie"],"emoji":"🧟","category":"Smileys & People"},{"name":"flag-py","key":"flag-py","names":["flag-py"],"emoji":"🇵🇾","category":"Flags"},{"name":"diamond_shape_with_a_dot_inside","key":"diamond_shape_with_a_dot_inside","names":["diamond_shape_with_a_dot_inside"],"emoji":"💠","category":"Symbols"},{"name":"umbrella_with_rain_drops","key":"umbrella_with_rain_drops","names":["umbrella_with_rain_drops"],"emoji":"☔","category":"Travel & Places"},{"name":"radio_button","key":"radio_button","names":["radio_button"],"emoji":"🔘","category":"Symbols"},{"name":"female_zombie","key":"female_zombie","names":["female_zombie"],"emoji":"🧟‍♀️","category":"Smileys & People"},{"name":"flag-qa","key":"flag-qa","names":["flag-qa"],"emoji":"🇶🇦","category":"Flags"},{"name":"umbrella_on_ground","key":"umbrella_on_ground","names":["umbrella_on_ground"],"emoji":"⛱️","category":"Travel & Places"},{"name":"black_square_button","key":"black_square_button","names":["black_square_button"],"emoji":"🔲","category":"Symbols"},{"name":"zap","key":"zap","names":["zap"],"emoji":"⚡","category":"Travel & Places"},{"name":"male_zombie","key":"male_zombie","names":["male_zombie"],"emoji":"🧟‍♂️","category":"Smileys & People"},{"name":"flag-re","key":"flag-re","names":["flag-re"],"emoji":"🇷🇪","category":"Flags"},{"name":"flag-ro","key":"flag-ro","names":["flag-ro"],"emoji":"🇷🇴","category":"Flags"},{"name":"snowflake","key":"snowflake","names":["snowflake"],"emoji":"❄️","category":"Travel & Places"},{"name":"white_square_button","key":"white_square_button","names":["white_square_button"],"emoji":"🔳","category":"Symbols"},{"name":"person_frowning","key":"person_frowning","names":["person_frowning"],"emoji":"🙍","category":"Smileys & People","variants":{"1F3FB":{"name":"person_frowning","key":"person_frowning-1F3FB","emoji":"🙍🏻"},"1F3FC":{"name":"person_frowning","key":"person_frowning-1F3FC","emoji":"🙍🏼"},"1F3FD":{"name":"person_frowning","key":"person_frowning-1F3FD","emoji":"🙍🏽"},"1F3FE":{"name":"person_frowning","key":"person_frowning-1F3FE","emoji":"🙍🏾"},"1F3FF":{"name":"person_frowning","key":"person_frowning-1F3FF","emoji":"🙍🏿"}}},{"name":"flag-rs","key":"flag-rs","names":["flag-rs"],"emoji":"🇷🇸","category":"Flags"},{"name":"man-frowning","key":"man-frowning","names":["man-frowning"],"emoji":"🙍‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-frowning","key":"man-frowning-1F3FB","emoji":"🙍🏻‍♂️"},"1F3FC":{"name":"man-frowning","key":"man-frowning-1F3FC","emoji":"🙍🏼‍♂️"},"1F3FD":{"name":"man-frowning","key":"man-frowning-1F3FD","emoji":"🙍🏽‍♂️"},"1F3FE":{"name":"man-frowning","key":"man-frowning-1F3FE","emoji":"🙍🏾‍♂️"},"1F3FF":{"name":"man-frowning","key":"man-frowning-1F3FF","emoji":"🙍🏿‍♂️"}}},{"name":"white_circle","key":"white_circle","names":["white_circle"],"emoji":"⚪","category":"Symbols"},{"name":"snowman","key":"snowman","names":["snowman"],"emoji":"☃️","category":"Travel & Places"},{"name":"snowman_without_snow","key":"snowman_without_snow","names":["snowman_without_snow"],"emoji":"⛄","category":"Travel & Places"},{"name":"ru","key":"ru","names":["ru","flag-ru"],"emoji":"🇷🇺","category":"Flags"},{"name":"black_circle","key":"black_circle","names":["black_circle"],"emoji":"⚫","category":"Symbols"},{"name":"woman-frowning","key":"woman-frowning","names":["woman-frowning"],"emoji":"🙍‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-frowning","key":"woman-frowning-1F3FB","emoji":"🙍🏻‍♀️"},"1F3FC":{"name":"woman-frowning","key":"woman-frowning-1F3FC","emoji":"🙍🏼‍♀️"},"1F3FD":{"name":"woman-frowning","key":"woman-frowning-1F3FD","emoji":"🙍🏽‍♀️"},"1F3FE":{"name":"woman-frowning","key":"woman-frowning-1F3FE","emoji":"🙍🏾‍♀️"},"1F3FF":{"name":"woman-frowning","key":"woman-frowning-1F3FF","emoji":"🙍🏿‍♀️"}}},{"name":"flag-rw","key":"flag-rw","names":["flag-rw"],"emoji":"🇷🇼","category":"Flags"},{"name":"comet","key":"comet","names":["comet"],"emoji":"☄️","category":"Travel & Places"},{"name":"person_with_pouting_face","key":"person_with_pouting_face","names":["person_with_pouting_face"],"emoji":"🙎","category":"Smileys & People","variants":{"1F3FB":{"name":"person_with_pouting_face","key":"person_with_pouting_face-1F3FB","emoji":"🙎🏻"},"1F3FC":{"name":"person_with_pouting_face","key":"person_with_pouting_face-1F3FC","emoji":"🙎🏼"},"1F3FD":{"name":"person_with_pouting_face","key":"person_with_pouting_face-1F3FD","emoji":"🙎🏽"},"1F3FE":{"name":"person_with_pouting_face","key":"person_with_pouting_face-1F3FE","emoji":"🙎🏾"},"1F3FF":{"name":"person_with_pouting_face","key":"person_with_pouting_face-1F3FF","emoji":"🙎🏿"}}},{"name":"red_circle","key":"red_circle","names":["red_circle"],"emoji":"🔴","category":"Symbols"},{"name":"large_blue_circle","key":"large_blue_circle","names":["large_blue_circle"],"emoji":"🔵","category":"Symbols"},{"name":"man-pouting","key":"man-pouting","names":["man-pouting"],"emoji":"🙎‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-pouting","key":"man-pouting-1F3FB","emoji":"🙎🏻‍♂️"},"1F3FC":{"name":"man-pouting","key":"man-pouting-1F3FC","emoji":"🙎🏼‍♂️"},"1F3FD":{"name":"man-pouting","key":"man-pouting-1F3FD","emoji":"🙎🏽‍♂️"},"1F3FE":{"name":"man-pouting","key":"man-pouting-1F3FE","emoji":"🙎🏾‍♂️"},"1F3FF":{"name":"man-pouting","key":"man-pouting-1F3FF","emoji":"🙎🏿‍♂️"}}},{"name":"flag-sa","key":"flag-sa","names":["flag-sa"],"emoji":"🇸🇦","category":"Flags"},{"name":"fire","key":"fire","names":["fire"],"emoji":"🔥","category":"Travel & Places"},{"name":"woman-pouting","key":"woman-pouting","names":["woman-pouting"],"emoji":"🙎‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-pouting","key":"woman-pouting-1F3FB","emoji":"🙎🏻‍♀️"},"1F3FC":{"name":"woman-pouting","key":"woman-pouting-1F3FC","emoji":"🙎🏼‍♀️"},"1F3FD":{"name":"woman-pouting","key":"woman-pouting-1F3FD","emoji":"🙎🏽‍♀️"},"1F3FE":{"name":"woman-pouting","key":"woman-pouting-1F3FE","emoji":"🙎🏾‍♀️"},"1F3FF":{"name":"woman-pouting","key":"woman-pouting-1F3FF","emoji":"🙎🏿‍♀️"}}},{"name":"flag-sb","key":"flag-sb","names":["flag-sb"],"emoji":"🇸🇧","category":"Flags"},{"name":"droplet","key":"droplet","names":["droplet"],"emoji":"💧","category":"Travel & Places"},{"name":"no_good","key":"no_good","names":["no_good"],"emoji":"🙅","category":"Smileys & People","variants":{"1F3FB":{"name":"no_good","key":"no_good-1F3FB","emoji":"🙅🏻"},"1F3FC":{"name":"no_good","key":"no_good-1F3FC","emoji":"🙅🏼"},"1F3FD":{"name":"no_good","key":"no_good-1F3FD","emoji":"🙅🏽"},"1F3FE":{"name":"no_good","key":"no_good-1F3FE","emoji":"🙅🏾"},"1F3FF":{"name":"no_good","key":"no_good-1F3FF","emoji":"🙅🏿"}}},{"name":"flag-sc","key":"flag-sc","names":["flag-sc"],"emoji":"🇸🇨","category":"Flags"},{"name":"ocean","key":"ocean","names":["ocean"],"emoji":"🌊","category":"Travel & Places"},{"name":"man-gesturing-no","key":"man-gesturing-no","names":["man-gesturing-no"],"emoji":"🙅‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-gesturing-no","key":"man-gesturing-no-1F3FB","emoji":"🙅🏻‍♂️"},"1F3FC":{"name":"man-gesturing-no","key":"man-gesturing-no-1F3FC","emoji":"🙅🏼‍♂️"},"1F3FD":{"name":"man-gesturing-no","key":"man-gesturing-no-1F3FD","emoji":"🙅🏽‍♂️"},"1F3FE":{"name":"man-gesturing-no","key":"man-gesturing-no-1F3FE","emoji":"🙅🏾‍♂️"},"1F3FF":{"name":"man-gesturing-no","key":"man-gesturing-no-1F3FF","emoji":"🙅🏿‍♂️"}}},{"name":"flag-sd","key":"flag-sd","names":["flag-sd"],"emoji":"🇸🇩","category":"Flags"},{"name":"woman-gesturing-no","key":"woman-gesturing-no","names":["woman-gesturing-no"],"emoji":"🙅‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-gesturing-no","key":"woman-gesturing-no-1F3FB","emoji":"🙅🏻‍♀️"},"1F3FC":{"name":"woman-gesturing-no","key":"woman-gesturing-no-1F3FC","emoji":"🙅🏼‍♀️"},"1F3FD":{"name":"woman-gesturing-no","key":"woman-gesturing-no-1F3FD","emoji":"🙅🏽‍♀️"},"1F3FE":{"name":"woman-gesturing-no","key":"woman-gesturing-no-1F3FE","emoji":"🙅🏾‍♀️"},"1F3FF":{"name":"woman-gesturing-no","key":"woman-gesturing-no-1F3FF","emoji":"🙅🏿‍♀️"}}},{"name":"flag-se","key":"flag-se","names":["flag-se"],"emoji":"🇸🇪","category":"Flags"},{"name":"flag-sg","key":"flag-sg","names":["flag-sg"],"emoji":"🇸🇬","category":"Flags"},{"name":"ok_woman","key":"ok_woman","names":["ok_woman"],"emoji":"🙆","category":"Smileys & People","variants":{"1F3FB":{"name":"ok_woman","key":"ok_woman-1F3FB","emoji":"🙆🏻"},"1F3FC":{"name":"ok_woman","key":"ok_woman-1F3FC","emoji":"🙆🏼"},"1F3FD":{"name":"ok_woman","key":"ok_woman-1F3FD","emoji":"🙆🏽"},"1F3FE":{"name":"ok_woman","key":"ok_woman-1F3FE","emoji":"🙆🏾"},"1F3FF":{"name":"ok_woman","key":"ok_woman-1F3FF","emoji":"🙆🏿"}}},{"name":"flag-sh","key":"flag-sh","names":["flag-sh"],"emoji":"🇸🇭","category":"Flags"},{"name":"man-gesturing-ok","key":"man-gesturing-ok","names":["man-gesturing-ok"],"emoji":"🙆‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-gesturing-ok","key":"man-gesturing-ok-1F3FB","emoji":"🙆🏻‍♂️"},"1F3FC":{"name":"man-gesturing-ok","key":"man-gesturing-ok-1F3FC","emoji":"🙆🏼‍♂️"},"1F3FD":{"name":"man-gesturing-ok","key":"man-gesturing-ok-1F3FD","emoji":"🙆🏽‍♂️"},"1F3FE":{"name":"man-gesturing-ok","key":"man-gesturing-ok-1F3FE","emoji":"🙆🏾‍♂️"},"1F3FF":{"name":"man-gesturing-ok","key":"man-gesturing-ok-1F3FF","emoji":"🙆🏿‍♂️"}}},{"name":"flag-si","key":"flag-si","names":["flag-si"],"emoji":"🇸🇮","category":"Flags"},{"name":"woman-gesturing-ok","key":"woman-gesturing-ok","names":["woman-gesturing-ok"],"emoji":"🙆‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-gesturing-ok","key":"woman-gesturing-ok-1F3FB","emoji":"🙆🏻‍♀️"},"1F3FC":{"name":"woman-gesturing-ok","key":"woman-gesturing-ok-1F3FC","emoji":"🙆🏼‍♀️"},"1F3FD":{"name":"woman-gesturing-ok","key":"woman-gesturing-ok-1F3FD","emoji":"🙆🏽‍♀️"},"1F3FE":{"name":"woman-gesturing-ok","key":"woman-gesturing-ok-1F3FE","emoji":"🙆🏾‍♀️"},"1F3FF":{"name":"woman-gesturing-ok","key":"woman-gesturing-ok-1F3FF","emoji":"🙆🏿‍♀️"}}},{"name":"information_desk_person","key":"information_desk_person","names":["information_desk_person"],"emoji":"💁","category":"Smileys & People","variants":{"1F3FB":{"name":"information_desk_person","key":"information_desk_person-1F3FB","emoji":"💁🏻"},"1F3FC":{"name":"information_desk_person","key":"information_desk_person-1F3FC","emoji":"💁🏼"},"1F3FD":{"name":"information_desk_person","key":"information_desk_person-1F3FD","emoji":"💁🏽"},"1F3FE":{"name":"information_desk_person","key":"information_desk_person-1F3FE","emoji":"💁🏾"},"1F3FF":{"name":"information_desk_person","key":"information_desk_person-1F3FF","emoji":"💁🏿"}}},{"name":"flag-sj","key":"flag-sj","names":["flag-sj"],"emoji":"🇸🇯","category":"Flags"},{"name":"man-tipping-hand","key":"man-tipping-hand","names":["man-tipping-hand"],"emoji":"💁‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-tipping-hand","key":"man-tipping-hand-1F3FB","emoji":"💁🏻‍♂️"},"1F3FC":{"name":"man-tipping-hand","key":"man-tipping-hand-1F3FC","emoji":"💁🏼‍♂️"},"1F3FD":{"name":"man-tipping-hand","key":"man-tipping-hand-1F3FD","emoji":"💁🏽‍♂️"},"1F3FE":{"name":"man-tipping-hand","key":"man-tipping-hand-1F3FE","emoji":"💁🏾‍♂️"},"1F3FF":{"name":"man-tipping-hand","key":"man-tipping-hand-1F3FF","emoji":"💁🏿‍♂️"}}},{"name":"flag-sk","key":"flag-sk","names":["flag-sk"],"emoji":"🇸🇰","category":"Flags"},{"name":"flag-sl","key":"flag-sl","names":["flag-sl"],"emoji":"🇸🇱","category":"Flags"},{"name":"woman-tipping-hand","key":"woman-tipping-hand","names":["woman-tipping-hand"],"emoji":"💁‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-tipping-hand","key":"woman-tipping-hand-1F3FB","emoji":"💁🏻‍♀️"},"1F3FC":{"name":"woman-tipping-hand","key":"woman-tipping-hand-1F3FC","emoji":"💁🏼‍♀️"},"1F3FD":{"name":"woman-tipping-hand","key":"woman-tipping-hand-1F3FD","emoji":"💁🏽‍♀️"},"1F3FE":{"name":"woman-tipping-hand","key":"woman-tipping-hand-1F3FE","emoji":"💁🏾‍♀️"},"1F3FF":{"name":"woman-tipping-hand","key":"woman-tipping-hand-1F3FF","emoji":"💁🏿‍♀️"}}},{"name":"flag-sm","key":"flag-sm","names":["flag-sm"],"emoji":"🇸🇲","category":"Flags"},{"name":"raising_hand","key":"raising_hand","names":["raising_hand"],"emoji":"🙋","category":"Smileys & People","variants":{"1F3FB":{"name":"raising_hand","key":"raising_hand-1F3FB","emoji":"🙋🏻"},"1F3FC":{"name":"raising_hand","key":"raising_hand-1F3FC","emoji":"🙋🏼"},"1F3FD":{"name":"raising_hand","key":"raising_hand-1F3FD","emoji":"🙋🏽"},"1F3FE":{"name":"raising_hand","key":"raising_hand-1F3FE","emoji":"🙋🏾"},"1F3FF":{"name":"raising_hand","key":"raising_hand-1F3FF","emoji":"🙋🏿"}}},{"name":"flag-sn","key":"flag-sn","names":["flag-sn"],"emoji":"🇸🇳","category":"Flags"},{"name":"man-raising-hand","key":"man-raising-hand","names":["man-raising-hand"],"emoji":"🙋‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-raising-hand","key":"man-raising-hand-1F3FB","emoji":"🙋🏻‍♂️"},"1F3FC":{"name":"man-raising-hand","key":"man-raising-hand-1F3FC","emoji":"🙋🏼‍♂️"},"1F3FD":{"name":"man-raising-hand","key":"man-raising-hand-1F3FD","emoji":"🙋🏽‍♂️"},"1F3FE":{"name":"man-raising-hand","key":"man-raising-hand-1F3FE","emoji":"🙋🏾‍♂️"},"1F3FF":{"name":"man-raising-hand","key":"man-raising-hand-1F3FF","emoji":"🙋🏿‍♂️"}}},{"name":"flag-so","key":"flag-so","names":["flag-so"],"emoji":"🇸🇴","category":"Flags"},{"name":"woman-raising-hand","key":"woman-raising-hand","names":["woman-raising-hand"],"emoji":"🙋‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-raising-hand","key":"woman-raising-hand-1F3FB","emoji":"🙋🏻‍♀️"},"1F3FC":{"name":"woman-raising-hand","key":"woman-raising-hand-1F3FC","emoji":"🙋🏼‍♀️"},"1F3FD":{"name":"woman-raising-hand","key":"woman-raising-hand-1F3FD","emoji":"🙋🏽‍♀️"},"1F3FE":{"name":"woman-raising-hand","key":"woman-raising-hand-1F3FE","emoji":"🙋🏾‍♀️"},"1F3FF":{"name":"woman-raising-hand","key":"woman-raising-hand-1F3FF","emoji":"🙋🏿‍♀️"}}},{"name":"flag-sr","key":"flag-sr","names":["flag-sr"],"emoji":"🇸🇷","category":"Flags"},{"name":"bow","key":"bow","names":["bow"],"emoji":"🙇","category":"Smileys & People","variants":{"1F3FB":{"name":"bow","key":"bow-1F3FB","emoji":"🙇🏻"},"1F3FC":{"name":"bow","key":"bow-1F3FC","emoji":"🙇🏼"},"1F3FD":{"name":"bow","key":"bow-1F3FD","emoji":"🙇🏽"},"1F3FE":{"name":"bow","key":"bow-1F3FE","emoji":"🙇🏾"},"1F3FF":{"name":"bow","key":"bow-1F3FF","emoji":"🙇🏿"}}},{"name":"man-bowing","key":"man-bowing","names":["man-bowing"],"emoji":"🙇‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-bowing","key":"man-bowing-1F3FB","emoji":"🙇🏻‍♂️"},"1F3FC":{"name":"man-bowing","key":"man-bowing-1F3FC","emoji":"🙇🏼‍♂️"},"1F3FD":{"name":"man-bowing","key":"man-bowing-1F3FD","emoji":"🙇🏽‍♂️"},"1F3FE":{"name":"man-bowing","key":"man-bowing-1F3FE","emoji":"🙇🏾‍♂️"},"1F3FF":{"name":"man-bowing","key":"man-bowing-1F3FF","emoji":"🙇🏿‍♂️"}}},{"name":"flag-ss","key":"flag-ss","names":["flag-ss"],"emoji":"🇸🇸","category":"Flags"},{"name":"woman-bowing","key":"woman-bowing","names":["woman-bowing"],"emoji":"🙇‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-bowing","key":"woman-bowing-1F3FB","emoji":"🙇🏻‍♀️"},"1F3FC":{"name":"woman-bowing","key":"woman-bowing-1F3FC","emoji":"🙇🏼‍♀️"},"1F3FD":{"name":"woman-bowing","key":"woman-bowing-1F3FD","emoji":"🙇🏽‍♀️"},"1F3FE":{"name":"woman-bowing","key":"woman-bowing-1F3FE","emoji":"🙇🏾‍♀️"},"1F3FF":{"name":"woman-bowing","key":"woman-bowing-1F3FF","emoji":"🙇🏿‍♀️"}}},{"name":"flag-st","key":"flag-st","names":["flag-st"],"emoji":"🇸🇹","category":"Flags"},{"name":"face_palm","key":"face_palm","names":["face_palm"],"emoji":"🤦","category":"Smileys & People","variants":{"1F3FB":{"name":"face_palm","key":"face_palm-1F3FB","emoji":"🤦🏻"},"1F3FC":{"name":"face_palm","key":"face_palm-1F3FC","emoji":"🤦🏼"},"1F3FD":{"name":"face_palm","key":"face_palm-1F3FD","emoji":"🤦🏽"},"1F3FE":{"name":"face_palm","key":"face_palm-1F3FE","emoji":"🤦🏾"},"1F3FF":{"name":"face_palm","key":"face_palm-1F3FF","emoji":"🤦🏿"}}},{"name":"flag-sv","key":"flag-sv","names":["flag-sv"],"emoji":"🇸🇻","category":"Flags"},{"name":"man-facepalming","key":"man-facepalming","names":["man-facepalming"],"emoji":"🤦‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-facepalming","key":"man-facepalming-1F3FB","emoji":"🤦🏻‍♂️"},"1F3FC":{"name":"man-facepalming","key":"man-facepalming-1F3FC","emoji":"🤦🏼‍♂️"},"1F3FD":{"name":"man-facepalming","key":"man-facepalming-1F3FD","emoji":"🤦🏽‍♂️"},"1F3FE":{"name":"man-facepalming","key":"man-facepalming-1F3FE","emoji":"🤦🏾‍♂️"},"1F3FF":{"name":"man-facepalming","key":"man-facepalming-1F3FF","emoji":"🤦🏿‍♂️"}}},{"name":"flag-sx","key":"flag-sx","names":["flag-sx"],"emoji":"🇸🇽","category":"Flags"},{"name":"flag-sy","key":"flag-sy","names":["flag-sy"],"emoji":"🇸🇾","category":"Flags"},{"name":"woman-facepalming","key":"woman-facepalming","names":["woman-facepalming"],"emoji":"🤦‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-facepalming","key":"woman-facepalming-1F3FB","emoji":"🤦🏻‍♀️"},"1F3FC":{"name":"woman-facepalming","key":"woman-facepalming-1F3FC","emoji":"🤦🏼‍♀️"},"1F3FD":{"name":"woman-facepalming","key":"woman-facepalming-1F3FD","emoji":"🤦🏽‍♀️"},"1F3FE":{"name":"woman-facepalming","key":"woman-facepalming-1F3FE","emoji":"🤦🏾‍♀️"},"1F3FF":{"name":"woman-facepalming","key":"woman-facepalming-1F3FF","emoji":"🤦🏿‍♀️"}}},{"name":"shrug","key":"shrug","names":["shrug"],"emoji":"🤷","category":"Smileys & People","variants":{"1F3FB":{"name":"shrug","key":"shrug-1F3FB","emoji":"🤷🏻"},"1F3FC":{"name":"shrug","key":"shrug-1F3FC","emoji":"🤷🏼"},"1F3FD":{"name":"shrug","key":"shrug-1F3FD","emoji":"🤷🏽"},"1F3FE":{"name":"shrug","key":"shrug-1F3FE","emoji":"🤷🏾"},"1F3FF":{"name":"shrug","key":"shrug-1F3FF","emoji":"🤷🏿"}}},{"name":"flag-sz","key":"flag-sz","names":["flag-sz"],"emoji":"🇸🇿","category":"Flags"},{"name":"flag-ta","key":"flag-ta","names":["flag-ta"],"emoji":"🇹🇦","category":"Flags"},{"name":"man-shrugging","key":"man-shrugging","names":["man-shrugging"],"emoji":"🤷‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-shrugging","key":"man-shrugging-1F3FB","emoji":"🤷🏻‍♂️"},"1F3FC":{"name":"man-shrugging","key":"man-shrugging-1F3FC","emoji":"🤷🏼‍♂️"},"1F3FD":{"name":"man-shrugging","key":"man-shrugging-1F3FD","emoji":"🤷🏽‍♂️"},"1F3FE":{"name":"man-shrugging","key":"man-shrugging-1F3FE","emoji":"🤷🏾‍♂️"},"1F3FF":{"name":"man-shrugging","key":"man-shrugging-1F3FF","emoji":"🤷🏿‍♂️"}}},{"name":"woman-shrugging","key":"woman-shrugging","names":["woman-shrugging"],"emoji":"🤷‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-shrugging","key":"woman-shrugging-1F3FB","emoji":"🤷🏻‍♀️"},"1F3FC":{"name":"woman-shrugging","key":"woman-shrugging-1F3FC","emoji":"🤷🏼‍♀️"},"1F3FD":{"name":"woman-shrugging","key":"woman-shrugging-1F3FD","emoji":"🤷🏽‍♀️"},"1F3FE":{"name":"woman-shrugging","key":"woman-shrugging-1F3FE","emoji":"🤷🏾‍♀️"},"1F3FF":{"name":"woman-shrugging","key":"woman-shrugging-1F3FF","emoji":"🤷🏿‍♀️"}}},{"name":"flag-tc","key":"flag-tc","names":["flag-tc"],"emoji":"🇹🇨","category":"Flags"},{"name":"massage","key":"massage","names":["massage"],"emoji":"💆","category":"Smileys & People","variants":{"1F3FB":{"name":"massage","key":"massage-1F3FB","emoji":"💆🏻"},"1F3FC":{"name":"massage","key":"massage-1F3FC","emoji":"💆🏼"},"1F3FD":{"name":"massage","key":"massage-1F3FD","emoji":"💆🏽"},"1F3FE":{"name":"massage","key":"massage-1F3FE","emoji":"💆🏾"},"1F3FF":{"name":"massage","key":"massage-1F3FF","emoji":"💆🏿"}}},{"name":"flag-td","key":"flag-td","names":["flag-td"],"emoji":"🇹🇩","category":"Flags"},{"name":"man-getting-massage","key":"man-getting-massage","names":["man-getting-massage"],"emoji":"💆‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-getting-massage","key":"man-getting-massage-1F3FB","emoji":"💆🏻‍♂️"},"1F3FC":{"name":"man-getting-massage","key":"man-getting-massage-1F3FC","emoji":"💆🏼‍♂️"},"1F3FD":{"name":"man-getting-massage","key":"man-getting-massage-1F3FD","emoji":"💆🏽‍♂️"},"1F3FE":{"name":"man-getting-massage","key":"man-getting-massage-1F3FE","emoji":"💆🏾‍♂️"},"1F3FF":{"name":"man-getting-massage","key":"man-getting-massage-1F3FF","emoji":"💆🏿‍♂️"}}},{"name":"flag-tf","key":"flag-tf","names":["flag-tf"],"emoji":"🇹🇫","category":"Flags"},{"name":"woman-getting-massage","key":"woman-getting-massage","names":["woman-getting-massage"],"emoji":"💆‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-getting-massage","key":"woman-getting-massage-1F3FB","emoji":"💆🏻‍♀️"},"1F3FC":{"name":"woman-getting-massage","key":"woman-getting-massage-1F3FC","emoji":"💆🏼‍♀️"},"1F3FD":{"name":"woman-getting-massage","key":"woman-getting-massage-1F3FD","emoji":"💆🏽‍♀️"},"1F3FE":{"name":"woman-getting-massage","key":"woman-getting-massage-1F3FE","emoji":"💆🏾‍♀️"},"1F3FF":{"name":"woman-getting-massage","key":"woman-getting-massage-1F3FF","emoji":"💆🏿‍♀️"}}},{"name":"flag-tg","key":"flag-tg","names":["flag-tg"],"emoji":"🇹🇬","category":"Flags"},{"name":"haircut","key":"haircut","names":["haircut"],"emoji":"💇","category":"Smileys & People","variants":{"1F3FB":{"name":"haircut","key":"haircut-1F3FB","emoji":"💇🏻"},"1F3FC":{"name":"haircut","key":"haircut-1F3FC","emoji":"💇🏼"},"1F3FD":{"name":"haircut","key":"haircut-1F3FD","emoji":"💇🏽"},"1F3FE":{"name":"haircut","key":"haircut-1F3FE","emoji":"💇🏾"},"1F3FF":{"name":"haircut","key":"haircut-1F3FF","emoji":"💇🏿"}}},{"name":"flag-th","key":"flag-th","names":["flag-th"],"emoji":"🇹🇭","category":"Flags"},{"name":"man-getting-haircut","key":"man-getting-haircut","names":["man-getting-haircut"],"emoji":"💇‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-getting-haircut","key":"man-getting-haircut-1F3FB","emoji":"💇🏻‍♂️"},"1F3FC":{"name":"man-getting-haircut","key":"man-getting-haircut-1F3FC","emoji":"💇🏼‍♂️"},"1F3FD":{"name":"man-getting-haircut","key":"man-getting-haircut-1F3FD","emoji":"💇🏽‍♂️"},"1F3FE":{"name":"man-getting-haircut","key":"man-getting-haircut-1F3FE","emoji":"💇🏾‍♂️"},"1F3FF":{"name":"man-getting-haircut","key":"man-getting-haircut-1F3FF","emoji":"💇🏿‍♂️"}}},{"name":"flag-tj","key":"flag-tj","names":["flag-tj"],"emoji":"🇹🇯","category":"Flags"},{"name":"flag-tk","key":"flag-tk","names":["flag-tk"],"emoji":"🇹🇰","category":"Flags"},{"name":"woman-getting-haircut","key":"woman-getting-haircut","names":["woman-getting-haircut"],"emoji":"💇‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-getting-haircut","key":"woman-getting-haircut-1F3FB","emoji":"💇🏻‍♀️"},"1F3FC":{"name":"woman-getting-haircut","key":"woman-getting-haircut-1F3FC","emoji":"💇🏼‍♀️"},"1F3FD":{"name":"woman-getting-haircut","key":"woman-getting-haircut-1F3FD","emoji":"💇🏽‍♀️"},"1F3FE":{"name":"woman-getting-haircut","key":"woman-getting-haircut-1F3FE","emoji":"💇🏾‍♀️"},"1F3FF":{"name":"woman-getting-haircut","key":"woman-getting-haircut-1F3FF","emoji":"💇🏿‍♀️"}}},{"name":"walking","key":"walking","names":["walking"],"emoji":"🚶","category":"Smileys & People","variants":{"1F3FB":{"name":"walking","key":"walking-1F3FB","emoji":"🚶🏻"},"1F3FC":{"name":"walking","key":"walking-1F3FC","emoji":"🚶🏼"},"1F3FD":{"name":"walking","key":"walking-1F3FD","emoji":"🚶🏽"},"1F3FE":{"name":"walking","key":"walking-1F3FE","emoji":"🚶🏾"},"1F3FF":{"name":"walking","key":"walking-1F3FF","emoji":"🚶🏿"}}},{"name":"flag-tl","key":"flag-tl","names":["flag-tl"],"emoji":"🇹🇱","category":"Flags"},{"name":"man-walking","key":"man-walking","names":["man-walking"],"emoji":"🚶‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-walking","key":"man-walking-1F3FB","emoji":"🚶🏻‍♂️"},"1F3FC":{"name":"man-walking","key":"man-walking-1F3FC","emoji":"🚶🏼‍♂️"},"1F3FD":{"name":"man-walking","key":"man-walking-1F3FD","emoji":"🚶🏽‍♂️"},"1F3FE":{"name":"man-walking","key":"man-walking-1F3FE","emoji":"🚶🏾‍♂️"},"1F3FF":{"name":"man-walking","key":"man-walking-1F3FF","emoji":"🚶🏿‍♂️"}}},{"name":"flag-tm","key":"flag-tm","names":["flag-tm"],"emoji":"🇹🇲","category":"Flags"},{"name":"woman-walking","key":"woman-walking","names":["woman-walking"],"emoji":"🚶‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-walking","key":"woman-walking-1F3FB","emoji":"🚶🏻‍♀️"},"1F3FC":{"name":"woman-walking","key":"woman-walking-1F3FC","emoji":"🚶🏼‍♀️"},"1F3FD":{"name":"woman-walking","key":"woman-walking-1F3FD","emoji":"🚶🏽‍♀️"},"1F3FE":{"name":"woman-walking","key":"woman-walking-1F3FE","emoji":"🚶🏾‍♀️"},"1F3FF":{"name":"woman-walking","key":"woman-walking-1F3FF","emoji":"🚶🏿‍♀️"}}},{"name":"flag-tn","key":"flag-tn","names":["flag-tn"],"emoji":"🇹🇳","category":"Flags"},{"name":"runner","key":"runner","names":["runner","running"],"emoji":"🏃","category":"Smileys & People","variants":{"1F3FB":{"name":"runner","key":"runner-1F3FB","emoji":"🏃🏻"},"1F3FC":{"name":"runner","key":"runner-1F3FC","emoji":"🏃🏼"},"1F3FD":{"name":"runner","key":"runner-1F3FD","emoji":"🏃🏽"},"1F3FE":{"name":"runner","key":"runner-1F3FE","emoji":"🏃🏾"},"1F3FF":{"name":"runner","key":"runner-1F3FF","emoji":"🏃🏿"}}},{"name":"flag-to","key":"flag-to","names":["flag-to"],"emoji":"🇹🇴","category":"Flags"},{"name":"man-running","key":"man-running","names":["man-running"],"emoji":"🏃‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-running","key":"man-running-1F3FB","emoji":"🏃🏻‍♂️"},"1F3FC":{"name":"man-running","key":"man-running-1F3FC","emoji":"🏃🏼‍♂️"},"1F3FD":{"name":"man-running","key":"man-running-1F3FD","emoji":"🏃🏽‍♂️"},"1F3FE":{"name":"man-running","key":"man-running-1F3FE","emoji":"🏃🏾‍♂️"},"1F3FF":{"name":"man-running","key":"man-running-1F3FF","emoji":"🏃🏿‍♂️"}}},{"name":"flag-tr","key":"flag-tr","names":["flag-tr"],"emoji":"🇹🇷","category":"Flags"},{"name":"flag-tt","key":"flag-tt","names":["flag-tt"],"emoji":"🇹🇹","category":"Flags"},{"name":"woman-running","key":"woman-running","names":["woman-running"],"emoji":"🏃‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-running","key":"woman-running-1F3FB","emoji":"🏃🏻‍♀️"},"1F3FC":{"name":"woman-running","key":"woman-running-1F3FC","emoji":"🏃🏼‍♀️"},"1F3FD":{"name":"woman-running","key":"woman-running-1F3FD","emoji":"🏃🏽‍♀️"},"1F3FE":{"name":"woman-running","key":"woman-running-1F3FE","emoji":"🏃🏾‍♀️"},"1F3FF":{"name":"woman-running","key":"woman-running-1F3FF","emoji":"🏃🏿‍♀️"}}},{"name":"flag-tv","key":"flag-tv","names":["flag-tv"],"emoji":"🇹🇻","category":"Flags"},{"name":"dancer","key":"dancer","names":["dancer"],"emoji":"💃","category":"Smileys & People","variants":{"1F3FB":{"name":"dancer","key":"dancer-1F3FB","emoji":"💃🏻"},"1F3FC":{"name":"dancer","key":"dancer-1F3FC","emoji":"💃🏼"},"1F3FD":{"name":"dancer","key":"dancer-1F3FD","emoji":"💃🏽"},"1F3FE":{"name":"dancer","key":"dancer-1F3FE","emoji":"💃🏾"},"1F3FF":{"name":"dancer","key":"dancer-1F3FF","emoji":"💃🏿"}}},{"name":"flag-tw","key":"flag-tw","names":["flag-tw"],"emoji":"🇹🇼","category":"Flags"},{"name":"man_dancing","key":"man_dancing","names":["man_dancing"],"emoji":"🕺","category":"Smileys & People","variants":{"1F3FB":{"name":"man_dancing","key":"man_dancing-1F3FB","emoji":"🕺🏻"},"1F3FC":{"name":"man_dancing","key":"man_dancing-1F3FC","emoji":"🕺🏼"},"1F3FD":{"name":"man_dancing","key":"man_dancing-1F3FD","emoji":"🕺🏽"},"1F3FE":{"name":"man_dancing","key":"man_dancing-1F3FE","emoji":"🕺🏾"},"1F3FF":{"name":"man_dancing","key":"man_dancing-1F3FF","emoji":"🕺🏿"}}},{"name":"dancers","key":"dancers","names":["dancers"],"emoji":"👯","category":"Smileys & People"},{"name":"flag-tz","key":"flag-tz","names":["flag-tz"],"emoji":"🇹🇿","category":"Flags"},{"name":"flag-ua","key":"flag-ua","names":["flag-ua"],"emoji":"🇺🇦","category":"Flags"},{"name":"man-with-bunny-ears-partying","key":"man-with-bunny-ears-partying","names":["man-with-bunny-ears-partying"],"emoji":"👯‍♂️","category":"Smileys & People"},{"name":"woman-with-bunny-ears-partying","key":"woman-with-bunny-ears-partying","names":["woman-with-bunny-ears-partying"],"emoji":"👯‍♀️","category":"Smileys & People"},{"name":"flag-ug","key":"flag-ug","names":["flag-ug"],"emoji":"🇺🇬","category":"Flags"},{"name":"flag-um","key":"flag-um","names":["flag-um"],"emoji":"🇺🇲","category":"Flags"},{"name":"person_in_steamy_room","key":"person_in_steamy_room","names":["person_in_steamy_room"],"emoji":"🧖","category":"Smileys & People","variants":{"1F3FB":{"name":"person_in_steamy_room","key":"person_in_steamy_room-1F3FB","emoji":"🧖🏻"},"1F3FC":{"name":"person_in_steamy_room","key":"person_in_steamy_room-1F3FC","emoji":"🧖🏼"},"1F3FD":{"name":"person_in_steamy_room","key":"person_in_steamy_room-1F3FD","emoji":"🧖🏽"},"1F3FE":{"name":"person_in_steamy_room","key":"person_in_steamy_room-1F3FE","emoji":"🧖🏾"},"1F3FF":{"name":"person_in_steamy_room","key":"person_in_steamy_room-1F3FF","emoji":"🧖🏿"}}},{"name":"woman_in_steamy_room","key":"woman_in_steamy_room","names":["woman_in_steamy_room"],"emoji":"🧖‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman_in_steamy_room","key":"woman_in_steamy_room-1F3FB","emoji":"🧖🏻‍♀️"},"1F3FC":{"name":"woman_in_steamy_room","key":"woman_in_steamy_room-1F3FC","emoji":"🧖🏼‍♀️"},"1F3FD":{"name":"woman_in_steamy_room","key":"woman_in_steamy_room-1F3FD","emoji":"🧖🏽‍♀️"},"1F3FE":{"name":"woman_in_steamy_room","key":"woman_in_steamy_room-1F3FE","emoji":"🧖🏾‍♀️"},"1F3FF":{"name":"woman_in_steamy_room","key":"woman_in_steamy_room-1F3FF","emoji":"🧖🏿‍♀️"}}},{"name":"flag-un","key":"flag-un","names":["flag-un"],"emoji":"🇺🇳","category":"Flags"},{"name":"us","key":"us","names":["us","flag-us"],"emoji":"🇺🇸","category":"Flags"},{"name":"man_in_steamy_room","key":"man_in_steamy_room","names":["man_in_steamy_room"],"emoji":"🧖‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man_in_steamy_room","key":"man_in_steamy_room-1F3FB","emoji":"🧖🏻‍♂️"},"1F3FC":{"name":"man_in_steamy_room","key":"man_in_steamy_room-1F3FC","emoji":"🧖🏼‍♂️"},"1F3FD":{"name":"man_in_steamy_room","key":"man_in_steamy_room-1F3FD","emoji":"🧖🏽‍♂️"},"1F3FE":{"name":"man_in_steamy_room","key":"man_in_steamy_room-1F3FE","emoji":"🧖🏾‍♂️"},"1F3FF":{"name":"man_in_steamy_room","key":"man_in_steamy_room-1F3FF","emoji":"🧖🏿‍♂️"}}},{"name":"person_climbing","key":"person_climbing","names":["person_climbing"],"emoji":"🧗","category":"Smileys & People","variants":{"1F3FB":{"name":"person_climbing","key":"person_climbing-1F3FB","emoji":"🧗🏻"},"1F3FC":{"name":"person_climbing","key":"person_climbing-1F3FC","emoji":"🧗🏼"},"1F3FD":{"name":"person_climbing","key":"person_climbing-1F3FD","emoji":"🧗🏽"},"1F3FE":{"name":"person_climbing","key":"person_climbing-1F3FE","emoji":"🧗🏾"},"1F3FF":{"name":"person_climbing","key":"person_climbing-1F3FF","emoji":"🧗🏿"}}},{"name":"flag-uy","key":"flag-uy","names":["flag-uy"],"emoji":"🇺🇾","category":"Flags"},{"name":"woman_climbing","key":"woman_climbing","names":["woman_climbing"],"emoji":"🧗‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman_climbing","key":"woman_climbing-1F3FB","emoji":"🧗🏻‍♀️"},"1F3FC":{"name":"woman_climbing","key":"woman_climbing-1F3FC","emoji":"🧗🏼‍♀️"},"1F3FD":{"name":"woman_climbing","key":"woman_climbing-1F3FD","emoji":"🧗🏽‍♀️"},"1F3FE":{"name":"woman_climbing","key":"woman_climbing-1F3FE","emoji":"🧗🏾‍♀️"},"1F3FF":{"name":"woman_climbing","key":"woman_climbing-1F3FF","emoji":"🧗🏿‍♀️"}}},{"name":"flag-uz","key":"flag-uz","names":["flag-uz"],"emoji":"🇺🇿","category":"Flags"},{"name":"man_climbing","key":"man_climbing","names":["man_climbing"],"emoji":"🧗‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man_climbing","key":"man_climbing-1F3FB","emoji":"🧗🏻‍♂️"},"1F3FC":{"name":"man_climbing","key":"man_climbing-1F3FC","emoji":"🧗🏼‍♂️"},"1F3FD":{"name":"man_climbing","key":"man_climbing-1F3FD","emoji":"🧗🏽‍♂️"},"1F3FE":{"name":"man_climbing","key":"man_climbing-1F3FE","emoji":"🧗🏾‍♂️"},"1F3FF":{"name":"man_climbing","key":"man_climbing-1F3FF","emoji":"🧗🏿‍♂️"}}},{"name":"flag-va","key":"flag-va","names":["flag-va"],"emoji":"🇻🇦","category":"Flags"},{"name":"person_in_lotus_position","key":"person_in_lotus_position","names":["person_in_lotus_position"],"emoji":"🧘","category":"Smileys & People","variants":{"1F3FB":{"name":"person_in_lotus_position","key":"person_in_lotus_position-1F3FB","emoji":"🧘🏻"},"1F3FC":{"name":"person_in_lotus_position","key":"person_in_lotus_position-1F3FC","emoji":"🧘🏼"},"1F3FD":{"name":"person_in_lotus_position","key":"person_in_lotus_position-1F3FD","emoji":"🧘🏽"},"1F3FE":{"name":"person_in_lotus_position","key":"person_in_lotus_position-1F3FE","emoji":"🧘🏾"},"1F3FF":{"name":"person_in_lotus_position","key":"person_in_lotus_position-1F3FF","emoji":"🧘🏿"}}},{"name":"flag-vc","key":"flag-vc","names":["flag-vc"],"emoji":"🇻🇨","category":"Flags"},{"name":"flag-ve","key":"flag-ve","names":["flag-ve"],"emoji":"🇻🇪","category":"Flags"},{"name":"woman_in_lotus_position","key":"woman_in_lotus_position","names":["woman_in_lotus_position"],"emoji":"🧘‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman_in_lotus_position","key":"woman_in_lotus_position-1F3FB","emoji":"🧘🏻‍♀️"},"1F3FC":{"name":"woman_in_lotus_position","key":"woman_in_lotus_position-1F3FC","emoji":"🧘🏼‍♀️"},"1F3FD":{"name":"woman_in_lotus_position","key":"woman_in_lotus_position-1F3FD","emoji":"🧘🏽‍♀️"},"1F3FE":{"name":"woman_in_lotus_position","key":"woman_in_lotus_position-1F3FE","emoji":"🧘🏾‍♀️"},"1F3FF":{"name":"woman_in_lotus_position","key":"woman_in_lotus_position-1F3FF","emoji":"🧘🏿‍♀️"}}},{"name":"man_in_lotus_position","key":"man_in_lotus_position","names":["man_in_lotus_position"],"emoji":"🧘‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man_in_lotus_position","key":"man_in_lotus_position-1F3FB","emoji":"🧘🏻‍♂️"},"1F3FC":{"name":"man_in_lotus_position","key":"man_in_lotus_position-1F3FC","emoji":"🧘🏼‍♂️"},"1F3FD":{"name":"man_in_lotus_position","key":"man_in_lotus_position-1F3FD","emoji":"🧘🏽‍♂️"},"1F3FE":{"name":"man_in_lotus_position","key":"man_in_lotus_position-1F3FE","emoji":"🧘🏾‍♂️"},"1F3FF":{"name":"man_in_lotus_position","key":"man_in_lotus_position-1F3FF","emoji":"🧘🏿‍♂️"}}},{"name":"flag-vg","key":"flag-vg","names":["flag-vg"],"emoji":"🇻🇬","category":"Flags"},{"name":"flag-vi","key":"flag-vi","names":["flag-vi"],"emoji":"🇻🇮","category":"Flags"},{"name":"bath","key":"bath","names":["bath"],"emoji":"🛀","category":"Smileys & People","variants":{"1F3FB":{"name":"bath","key":"bath-1F3FB","emoji":"🛀🏻"},"1F3FC":{"name":"bath","key":"bath-1F3FC","emoji":"🛀🏼"},"1F3FD":{"name":"bath","key":"bath-1F3FD","emoji":"🛀🏽"},"1F3FE":{"name":"bath","key":"bath-1F3FE","emoji":"🛀🏾"},"1F3FF":{"name":"bath","key":"bath-1F3FF","emoji":"🛀🏿"}}},{"name":"sleeping_accommodation","key":"sleeping_accommodation","names":["sleeping_accommodation"],"emoji":"🛌","category":"Smileys & People","variants":{"1F3FB":{"name":"sleeping_accommodation","key":"sleeping_accommodation-1F3FB","emoji":"🛌🏻"},"1F3FC":{"name":"sleeping_accommodation","key":"sleeping_accommodation-1F3FC","emoji":"🛌🏼"},"1F3FD":{"name":"sleeping_accommodation","key":"sleeping_accommodation-1F3FD","emoji":"🛌🏽"},"1F3FE":{"name":"sleeping_accommodation","key":"sleeping_accommodation-1F3FE","emoji":"🛌🏾"},"1F3FF":{"name":"sleeping_accommodation","key":"sleeping_accommodation-1F3FF","emoji":"🛌🏿"}}},{"name":"flag-vn","key":"flag-vn","names":["flag-vn"],"emoji":"🇻🇳","category":"Flags"},{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating","names":["man_in_business_suit_levitating"],"emoji":"🕴️","category":"Smileys & People","variants":{"1F3FB":{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating-1F3FB","emoji":"🕴🏻"},"1F3FC":{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating-1F3FC","emoji":"🕴🏼"},"1F3FD":{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating-1F3FD","emoji":"🕴🏽"},"1F3FE":{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating-1F3FE","emoji":"🕴🏾"},"1F3FF":{"name":"man_in_business_suit_levitating","key":"man_in_business_suit_levitating-1F3FF","emoji":"🕴🏿"}}},{"name":"flag-vu","key":"flag-vu","names":["flag-vu"],"emoji":"🇻🇺","category":"Flags"},{"name":"flag-wf","key":"flag-wf","names":["flag-wf"],"emoji":"🇼🇫","category":"Flags"},{"name":"speaking_head_in_silhouette","key":"speaking_head_in_silhouette","names":["speaking_head_in_silhouette"],"emoji":"🗣️","category":"Smileys & People"},{"name":"bust_in_silhouette","key":"bust_in_silhouette","names":["bust_in_silhouette"],"emoji":"👤","category":"Smileys & People"},{"name":"flag-ws","key":"flag-ws","names":["flag-ws"],"emoji":"🇼🇸","category":"Flags"},{"name":"busts_in_silhouette","key":"busts_in_silhouette","names":["busts_in_silhouette"],"emoji":"👥","category":"Smileys & People"},{"name":"flag-xk","key":"flag-xk","names":["flag-xk"],"emoji":"🇽🇰","category":"Flags"},{"name":"fencer","key":"fencer","names":["fencer"],"emoji":"🤺","category":"Smileys & People"},{"name":"flag-ye","key":"flag-ye","names":["flag-ye"],"emoji":"🇾🇪","category":"Flags"},{"name":"flag-yt","key":"flag-yt","names":["flag-yt"],"emoji":"🇾🇹","category":"Flags"},{"name":"horse_racing","key":"horse_racing","names":["horse_racing"],"emoji":"🏇","category":"Smileys & People","variants":{"1F3FB":{"name":"horse_racing","key":"horse_racing-1F3FB","emoji":"🏇🏻"},"1F3FC":{"name":"horse_racing","key":"horse_racing-1F3FC","emoji":"🏇🏼"},"1F3FD":{"name":"horse_racing","key":"horse_racing-1F3FD","emoji":"🏇🏽"},"1F3FE":{"name":"horse_racing","key":"horse_racing-1F3FE","emoji":"🏇🏾"},"1F3FF":{"name":"horse_racing","key":"horse_racing-1F3FF","emoji":"🏇🏿"}}},{"name":"flag-za","key":"flag-za","names":["flag-za"],"emoji":"🇿🇦","category":"Flags"},{"name":"skier","key":"skier","names":["skier"],"emoji":"⛷️","category":"Smileys & People"},{"name":"flag-zm","key":"flag-zm","names":["flag-zm"],"emoji":"🇿🇲","category":"Flags"},{"name":"snowboarder","key":"snowboarder","names":["snowboarder"],"emoji":"🏂","category":"Smileys & People","variants":{"1F3FB":{"name":"snowboarder","key":"snowboarder-1F3FB","emoji":"🏂🏻"},"1F3FC":{"name":"snowboarder","key":"snowboarder-1F3FC","emoji":"🏂🏼"},"1F3FD":{"name":"snowboarder","key":"snowboarder-1F3FD","emoji":"🏂🏽"},"1F3FE":{"name":"snowboarder","key":"snowboarder-1F3FE","emoji":"🏂🏾"},"1F3FF":{"name":"snowboarder","key":"snowboarder-1F3FF","emoji":"🏂🏿"}}},{"name":"golfer","key":"golfer","names":["golfer"],"emoji":"🏌️","category":"Smileys & People","variants":{"1F3FB":{"name":"golfer","key":"golfer-1F3FB","emoji":"🏌🏻"},"1F3FC":{"name":"golfer","key":"golfer-1F3FC","emoji":"🏌🏼"},"1F3FD":{"name":"golfer","key":"golfer-1F3FD","emoji":"🏌🏽"},"1F3FE":{"name":"golfer","key":"golfer-1F3FE","emoji":"🏌🏾"},"1F3FF":{"name":"golfer","key":"golfer-1F3FF","emoji":"🏌🏿"}}},{"name":"flag-zw","key":"flag-zw","names":["flag-zw"],"emoji":"🇿🇼","category":"Flags"},{"name":"man-golfing","key":"man-golfing","names":["man-golfing"],"emoji":"🏌️‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-golfing","key":"man-golfing-1F3FB","emoji":"🏌🏻‍♂️"},"1F3FC":{"name":"man-golfing","key":"man-golfing-1F3FC","emoji":"🏌🏼‍♂️"},"1F3FD":{"name":"man-golfing","key":"man-golfing-1F3FD","emoji":"🏌🏽‍♂️"},"1F3FE":{"name":"man-golfing","key":"man-golfing-1F3FE","emoji":"🏌🏾‍♂️"},"1F3FF":{"name":"man-golfing","key":"man-golfing-1F3FF","emoji":"🏌🏿‍♂️"}}},{"name":"flag-england","key":"flag-england","names":["flag-england"],"emoji":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","category":"Flags"},{"name":"woman-golfing","key":"woman-golfing","names":["woman-golfing"],"emoji":"🏌️‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-golfing","key":"woman-golfing-1F3FB","emoji":"🏌🏻‍♀️"},"1F3FC":{"name":"woman-golfing","key":"woman-golfing-1F3FC","emoji":"🏌🏼‍♀️"},"1F3FD":{"name":"woman-golfing","key":"woman-golfing-1F3FD","emoji":"🏌🏽‍♀️"},"1F3FE":{"name":"woman-golfing","key":"woman-golfing-1F3FE","emoji":"🏌🏾‍♀️"},"1F3FF":{"name":"woman-golfing","key":"woman-golfing-1F3FF","emoji":"🏌🏿‍♀️"}}},{"name":"flag-scotland","key":"flag-scotland","names":["flag-scotland"],"emoji":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","category":"Flags"},{"name":"flag-wales","key":"flag-wales","names":["flag-wales"],"emoji":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","category":"Flags"},{"name":"surfer","key":"surfer","names":["surfer"],"emoji":"🏄","category":"Smileys & People","variants":{"1F3FB":{"name":"surfer","key":"surfer-1F3FB","emoji":"🏄🏻"},"1F3FC":{"name":"surfer","key":"surfer-1F3FC","emoji":"🏄🏼"},"1F3FD":{"name":"surfer","key":"surfer-1F3FD","emoji":"🏄🏽"},"1F3FE":{"name":"surfer","key":"surfer-1F3FE","emoji":"🏄🏾"},"1F3FF":{"name":"surfer","key":"surfer-1F3FF","emoji":"🏄🏿"}}},{"name":"man-surfing","key":"man-surfing","names":["man-surfing"],"emoji":"🏄‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-surfing","key":"man-surfing-1F3FB","emoji":"🏄🏻‍♂️"},"1F3FC":{"name":"man-surfing","key":"man-surfing-1F3FC","emoji":"🏄🏼‍♂️"},"1F3FD":{"name":"man-surfing","key":"man-surfing-1F3FD","emoji":"🏄🏽‍♂️"},"1F3FE":{"name":"man-surfing","key":"man-surfing-1F3FE","emoji":"🏄🏾‍♂️"},"1F3FF":{"name":"man-surfing","key":"man-surfing-1F3FF","emoji":"🏄🏿‍♂️"}}},{"name":"woman-surfing","key":"woman-surfing","names":["woman-surfing"],"emoji":"🏄‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-surfing","key":"woman-surfing-1F3FB","emoji":"🏄🏻‍♀️"},"1F3FC":{"name":"woman-surfing","key":"woman-surfing-1F3FC","emoji":"🏄🏼‍♀️"},"1F3FD":{"name":"woman-surfing","key":"woman-surfing-1F3FD","emoji":"🏄🏽‍♀️"},"1F3FE":{"name":"woman-surfing","key":"woman-surfing-1F3FE","emoji":"🏄🏾‍♀️"},"1F3FF":{"name":"woman-surfing","key":"woman-surfing-1F3FF","emoji":"🏄🏿‍♀️"}}},{"name":"rowboat","key":"rowboat","names":["rowboat"],"emoji":"🚣","category":"Smileys & People","variants":{"1F3FB":{"name":"rowboat","key":"rowboat-1F3FB","emoji":"🚣🏻"},"1F3FC":{"name":"rowboat","key":"rowboat-1F3FC","emoji":"🚣🏼"},"1F3FD":{"name":"rowboat","key":"rowboat-1F3FD","emoji":"🚣🏽"},"1F3FE":{"name":"rowboat","key":"rowboat-1F3FE","emoji":"🚣🏾"},"1F3FF":{"name":"rowboat","key":"rowboat-1F3FF","emoji":"🚣🏿"}}},{"name":"man-rowing-boat","key":"man-rowing-boat","names":["man-rowing-boat"],"emoji":"🚣‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-rowing-boat","key":"man-rowing-boat-1F3FB","emoji":"🚣🏻‍♂️"},"1F3FC":{"name":"man-rowing-boat","key":"man-rowing-boat-1F3FC","emoji":"🚣🏼‍♂️"},"1F3FD":{"name":"man-rowing-boat","key":"man-rowing-boat-1F3FD","emoji":"🚣🏽‍♂️"},"1F3FE":{"name":"man-rowing-boat","key":"man-rowing-boat-1F3FE","emoji":"🚣🏾‍♂️"},"1F3FF":{"name":"man-rowing-boat","key":"man-rowing-boat-1F3FF","emoji":"🚣🏿‍♂️"}}},{"name":"woman-rowing-boat","key":"woman-rowing-boat","names":["woman-rowing-boat"],"emoji":"🚣‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-rowing-boat","key":"woman-rowing-boat-1F3FB","emoji":"🚣🏻‍♀️"},"1F3FC":{"name":"woman-rowing-boat","key":"woman-rowing-boat-1F3FC","emoji":"🚣🏼‍♀️"},"1F3FD":{"name":"woman-rowing-boat","key":"woman-rowing-boat-1F3FD","emoji":"🚣🏽‍♀️"},"1F3FE":{"name":"woman-rowing-boat","key":"woman-rowing-boat-1F3FE","emoji":"🚣🏾‍♀️"},"1F3FF":{"name":"woman-rowing-boat","key":"woman-rowing-boat-1F3FF","emoji":"🚣🏿‍♀️"}}},{"name":"swimmer","key":"swimmer","names":["swimmer"],"emoji":"🏊","category":"Smileys & People","variants":{"1F3FB":{"name":"swimmer","key":"swimmer-1F3FB","emoji":"🏊🏻"},"1F3FC":{"name":"swimmer","key":"swimmer-1F3FC","emoji":"🏊🏼"},"1F3FD":{"name":"swimmer","key":"swimmer-1F3FD","emoji":"🏊🏽"},"1F3FE":{"name":"swimmer","key":"swimmer-1F3FE","emoji":"🏊🏾"},"1F3FF":{"name":"swimmer","key":"swimmer-1F3FF","emoji":"🏊🏿"}}},{"name":"man-swimming","key":"man-swimming","names":["man-swimming"],"emoji":"🏊‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-swimming","key":"man-swimming-1F3FB","emoji":"🏊🏻‍♂️"},"1F3FC":{"name":"man-swimming","key":"man-swimming-1F3FC","emoji":"🏊🏼‍♂️"},"1F3FD":{"name":"man-swimming","key":"man-swimming-1F3FD","emoji":"🏊🏽‍♂️"},"1F3FE":{"name":"man-swimming","key":"man-swimming-1F3FE","emoji":"🏊🏾‍♂️"},"1F3FF":{"name":"man-swimming","key":"man-swimming-1F3FF","emoji":"🏊🏿‍♂️"}}},{"name":"woman-swimming","key":"woman-swimming","names":["woman-swimming"],"emoji":"🏊‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-swimming","key":"woman-swimming-1F3FB","emoji":"🏊🏻‍♀️"},"1F3FC":{"name":"woman-swimming","key":"woman-swimming-1F3FC","emoji":"🏊🏼‍♀️"},"1F3FD":{"name":"woman-swimming","key":"woman-swimming-1F3FD","emoji":"🏊🏽‍♀️"},"1F3FE":{"name":"woman-swimming","key":"woman-swimming-1F3FE","emoji":"🏊🏾‍♀️"},"1F3FF":{"name":"woman-swimming","key":"woman-swimming-1F3FF","emoji":"🏊🏿‍♀️"}}},{"name":"person_with_ball","key":"person_with_ball","names":["person_with_ball"],"emoji":"⛹️","category":"Smileys & People","variants":{"1F3FB":{"name":"person_with_ball","key":"person_with_ball-1F3FB","emoji":"⛹🏻"},"1F3FC":{"name":"person_with_ball","key":"person_with_ball-1F3FC","emoji":"⛹🏼"},"1F3FD":{"name":"person_with_ball","key":"person_with_ball-1F3FD","emoji":"⛹🏽"},"1F3FE":{"name":"person_with_ball","key":"person_with_ball-1F3FE","emoji":"⛹🏾"},"1F3FF":{"name":"person_with_ball","key":"person_with_ball-1F3FF","emoji":"⛹🏿"}}},{"name":"man-bouncing-ball","key":"man-bouncing-ball","names":["man-bouncing-ball"],"emoji":"⛹️‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-bouncing-ball","key":"man-bouncing-ball-1F3FB","emoji":"⛹🏻‍♂️"},"1F3FC":{"name":"man-bouncing-ball","key":"man-bouncing-ball-1F3FC","emoji":"⛹🏼‍♂️"},"1F3FD":{"name":"man-bouncing-ball","key":"man-bouncing-ball-1F3FD","emoji":"⛹🏽‍♂️"},"1F3FE":{"name":"man-bouncing-ball","key":"man-bouncing-ball-1F3FE","emoji":"⛹🏾‍♂️"},"1F3FF":{"name":"man-bouncing-ball","key":"man-bouncing-ball-1F3FF","emoji":"⛹🏿‍♂️"}}},{"name":"woman-bouncing-ball","key":"woman-bouncing-ball","names":["woman-bouncing-ball"],"emoji":"⛹️‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-bouncing-ball","key":"woman-bouncing-ball-1F3FB","emoji":"⛹🏻‍♀️"},"1F3FC":{"name":"woman-bouncing-ball","key":"woman-bouncing-ball-1F3FC","emoji":"⛹🏼‍♀️"},"1F3FD":{"name":"woman-bouncing-ball","key":"woman-bouncing-ball-1F3FD","emoji":"⛹🏽‍♀️"},"1F3FE":{"name":"woman-bouncing-ball","key":"woman-bouncing-ball-1F3FE","emoji":"⛹🏾‍♀️"},"1F3FF":{"name":"woman-bouncing-ball","key":"woman-bouncing-ball-1F3FF","emoji":"⛹🏿‍♀️"}}},{"name":"weight_lifter","key":"weight_lifter","names":["weight_lifter"],"emoji":"🏋️","category":"Smileys & People","variants":{"1F3FB":{"name":"weight_lifter","key":"weight_lifter-1F3FB","emoji":"🏋🏻"},"1F3FC":{"name":"weight_lifter","key":"weight_lifter-1F3FC","emoji":"🏋🏼"},"1F3FD":{"name":"weight_lifter","key":"weight_lifter-1F3FD","emoji":"🏋🏽"},"1F3FE":{"name":"weight_lifter","key":"weight_lifter-1F3FE","emoji":"🏋🏾"},"1F3FF":{"name":"weight_lifter","key":"weight_lifter-1F3FF","emoji":"🏋🏿"}}},{"name":"man-lifting-weights","key":"man-lifting-weights","names":["man-lifting-weights"],"emoji":"🏋️‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-lifting-weights","key":"man-lifting-weights-1F3FB","emoji":"🏋🏻‍♂️"},"1F3FC":{"name":"man-lifting-weights","key":"man-lifting-weights-1F3FC","emoji":"🏋🏼‍♂️"},"1F3FD":{"name":"man-lifting-weights","key":"man-lifting-weights-1F3FD","emoji":"🏋🏽‍♂️"},"1F3FE":{"name":"man-lifting-weights","key":"man-lifting-weights-1F3FE","emoji":"🏋🏾‍♂️"},"1F3FF":{"name":"man-lifting-weights","key":"man-lifting-weights-1F3FF","emoji":"🏋🏿‍♂️"}}},{"name":"woman-lifting-weights","key":"woman-lifting-weights","names":["woman-lifting-weights"],"emoji":"🏋️‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-lifting-weights","key":"woman-lifting-weights-1F3FB","emoji":"🏋🏻‍♀️"},"1F3FC":{"name":"woman-lifting-weights","key":"woman-lifting-weights-1F3FC","emoji":"🏋🏼‍♀️"},"1F3FD":{"name":"woman-lifting-weights","key":"woman-lifting-weights-1F3FD","emoji":"🏋🏽‍♀️"},"1F3FE":{"name":"woman-lifting-weights","key":"woman-lifting-weights-1F3FE","emoji":"🏋🏾‍♀️"},"1F3FF":{"name":"woman-lifting-weights","key":"woman-lifting-weights-1F3FF","emoji":"🏋🏿‍♀️"}}},{"name":"bicyclist","key":"bicyclist","names":["bicyclist"],"emoji":"🚴","category":"Smileys & People","variants":{"1F3FB":{"name":"bicyclist","key":"bicyclist-1F3FB","emoji":"🚴🏻"},"1F3FC":{"name":"bicyclist","key":"bicyclist-1F3FC","emoji":"🚴🏼"},"1F3FD":{"name":"bicyclist","key":"bicyclist-1F3FD","emoji":"🚴🏽"},"1F3FE":{"name":"bicyclist","key":"bicyclist-1F3FE","emoji":"🚴🏾"},"1F3FF":{"name":"bicyclist","key":"bicyclist-1F3FF","emoji":"🚴🏿"}}},{"name":"man-biking","key":"man-biking","names":["man-biking"],"emoji":"🚴‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-biking","key":"man-biking-1F3FB","emoji":"🚴🏻‍♂️"},"1F3FC":{"name":"man-biking","key":"man-biking-1F3FC","emoji":"🚴🏼‍♂️"},"1F3FD":{"name":"man-biking","key":"man-biking-1F3FD","emoji":"🚴🏽‍♂️"},"1F3FE":{"name":"man-biking","key":"man-biking-1F3FE","emoji":"🚴🏾‍♂️"},"1F3FF":{"name":"man-biking","key":"man-biking-1F3FF","emoji":"🚴🏿‍♂️"}}},{"name":"woman-biking","key":"woman-biking","names":["woman-biking"],"emoji":"🚴‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-biking","key":"woman-biking-1F3FB","emoji":"🚴🏻‍♀️"},"1F3FC":{"name":"woman-biking","key":"woman-biking-1F3FC","emoji":"🚴🏼‍♀️"},"1F3FD":{"name":"woman-biking","key":"woman-biking-1F3FD","emoji":"🚴🏽‍♀️"},"1F3FE":{"name":"woman-biking","key":"woman-biking-1F3FE","emoji":"🚴🏾‍♀️"},"1F3FF":{"name":"woman-biking","key":"woman-biking-1F3FF","emoji":"🚴🏿‍♀️"}}},{"name":"mountain_bicyclist","key":"mountain_bicyclist","names":["mountain_bicyclist"],"emoji":"🚵","category":"Smileys & People","variants":{"1F3FB":{"name":"mountain_bicyclist","key":"mountain_bicyclist-1F3FB","emoji":"🚵🏻"},"1F3FC":{"name":"mountain_bicyclist","key":"mountain_bicyclist-1F3FC","emoji":"🚵🏼"},"1F3FD":{"name":"mountain_bicyclist","key":"mountain_bicyclist-1F3FD","emoji":"🚵🏽"},"1F3FE":{"name":"mountain_bicyclist","key":"mountain_bicyclist-1F3FE","emoji":"🚵🏾"},"1F3FF":{"name":"mountain_bicyclist","key":"mountain_bicyclist-1F3FF","emoji":"🚵🏿"}}},{"name":"man-mountain-biking","key":"man-mountain-biking","names":["man-mountain-biking"],"emoji":"🚵‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-mountain-biking","key":"man-mountain-biking-1F3FB","emoji":"🚵🏻‍♂️"},"1F3FC":{"name":"man-mountain-biking","key":"man-mountain-biking-1F3FC","emoji":"🚵🏼‍♂️"},"1F3FD":{"name":"man-mountain-biking","key":"man-mountain-biking-1F3FD","emoji":"🚵🏽‍♂️"},"1F3FE":{"name":"man-mountain-biking","key":"man-mountain-biking-1F3FE","emoji":"🚵🏾‍♂️"},"1F3FF":{"name":"man-mountain-biking","key":"man-mountain-biking-1F3FF","emoji":"🚵🏿‍♂️"}}},{"name":"woman-mountain-biking","key":"woman-mountain-biking","names":["woman-mountain-biking"],"emoji":"🚵‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-mountain-biking","key":"woman-mountain-biking-1F3FB","emoji":"🚵🏻‍♀️"},"1F3FC":{"name":"woman-mountain-biking","key":"woman-mountain-biking-1F3FC","emoji":"🚵🏼‍♀️"},"1F3FD":{"name":"woman-mountain-biking","key":"woman-mountain-biking-1F3FD","emoji":"🚵🏽‍♀️"},"1F3FE":{"name":"woman-mountain-biking","key":"woman-mountain-biking-1F3FE","emoji":"🚵🏾‍♀️"},"1F3FF":{"name":"woman-mountain-biking","key":"woman-mountain-biking-1F3FF","emoji":"🚵🏿‍♀️"}}},{"name":"racing_car","key":"racing_car","names":["racing_car"],"emoji":"🏎️","category":"Smileys & People"},{"name":"racing_motorcycle","key":"racing_motorcycle","names":["racing_motorcycle"],"emoji":"🏍️","category":"Smileys & People"},{"name":"person_doing_cartwheel","key":"person_doing_cartwheel","names":["person_doing_cartwheel"],"emoji":"🤸","category":"Smileys & People","variants":{"1F3FB":{"name":"person_doing_cartwheel","key":"person_doing_cartwheel-1F3FB","emoji":"🤸🏻"},"1F3FC":{"name":"person_doing_cartwheel","key":"person_doing_cartwheel-1F3FC","emoji":"🤸🏼"},"1F3FD":{"name":"person_doing_cartwheel","key":"person_doing_cartwheel-1F3FD","emoji":"🤸🏽"},"1F3FE":{"name":"person_doing_cartwheel","key":"person_doing_cartwheel-1F3FE","emoji":"🤸🏾"},"1F3FF":{"name":"person_doing_cartwheel","key":"person_doing_cartwheel-1F3FF","emoji":"🤸🏿"}}},{"name":"man-cartwheeling","key":"man-cartwheeling","names":["man-cartwheeling"],"emoji":"🤸‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-cartwheeling","key":"man-cartwheeling-1F3FB","emoji":"🤸🏻‍♂️"},"1F3FC":{"name":"man-cartwheeling","key":"man-cartwheeling-1F3FC","emoji":"🤸🏼‍♂️"},"1F3FD":{"name":"man-cartwheeling","key":"man-cartwheeling-1F3FD","emoji":"🤸🏽‍♂️"},"1F3FE":{"name":"man-cartwheeling","key":"man-cartwheeling-1F3FE","emoji":"🤸🏾‍♂️"},"1F3FF":{"name":"man-cartwheeling","key":"man-cartwheeling-1F3FF","emoji":"🤸🏿‍♂️"}}},{"name":"woman-cartwheeling","key":"woman-cartwheeling","names":["woman-cartwheeling"],"emoji":"🤸‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-cartwheeling","key":"woman-cartwheeling-1F3FB","emoji":"🤸🏻‍♀️"},"1F3FC":{"name":"woman-cartwheeling","key":"woman-cartwheeling-1F3FC","emoji":"🤸🏼‍♀️"},"1F3FD":{"name":"woman-cartwheeling","key":"woman-cartwheeling-1F3FD","emoji":"🤸🏽‍♀️"},"1F3FE":{"name":"woman-cartwheeling","key":"woman-cartwheeling-1F3FE","emoji":"🤸🏾‍♀️"},"1F3FF":{"name":"woman-cartwheeling","key":"woman-cartwheeling-1F3FF","emoji":"🤸🏿‍♀️"}}},{"name":"wrestlers","key":"wrestlers","names":["wrestlers"],"emoji":"🤼","category":"Smileys & People"},{"name":"man-wrestling","key":"man-wrestling","names":["man-wrestling"],"emoji":"🤼‍♂️","category":"Smileys & People"},{"name":"woman-wrestling","key":"woman-wrestling","names":["woman-wrestling"],"emoji":"🤼‍♀️","category":"Smileys & People"},{"name":"water_polo","key":"water_polo","names":["water_polo"],"emoji":"🤽","category":"Smileys & People","variants":{"1F3FB":{"name":"water_polo","key":"water_polo-1F3FB","emoji":"🤽🏻"},"1F3FC":{"name":"water_polo","key":"water_polo-1F3FC","emoji":"🤽🏼"},"1F3FD":{"name":"water_polo","key":"water_polo-1F3FD","emoji":"🤽🏽"},"1F3FE":{"name":"water_polo","key":"water_polo-1F3FE","emoji":"🤽🏾"},"1F3FF":{"name":"water_polo","key":"water_polo-1F3FF","emoji":"🤽🏿"}}},{"name":"man-playing-water-polo","key":"man-playing-water-polo","names":["man-playing-water-polo"],"emoji":"🤽‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-playing-water-polo","key":"man-playing-water-polo-1F3FB","emoji":"🤽🏻‍♂️"},"1F3FC":{"name":"man-playing-water-polo","key":"man-playing-water-polo-1F3FC","emoji":"🤽🏼‍♂️"},"1F3FD":{"name":"man-playing-water-polo","key":"man-playing-water-polo-1F3FD","emoji":"🤽🏽‍♂️"},"1F3FE":{"name":"man-playing-water-polo","key":"man-playing-water-polo-1F3FE","emoji":"🤽🏾‍♂️"},"1F3FF":{"name":"man-playing-water-polo","key":"man-playing-water-polo-1F3FF","emoji":"🤽🏿‍♂️"}}},{"name":"woman-playing-water-polo","key":"woman-playing-water-polo","names":["woman-playing-water-polo"],"emoji":"🤽‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-playing-water-polo","key":"woman-playing-water-polo-1F3FB","emoji":"🤽🏻‍♀️"},"1F3FC":{"name":"woman-playing-water-polo","key":"woman-playing-water-polo-1F3FC","emoji":"🤽🏼‍♀️"},"1F3FD":{"name":"woman-playing-water-polo","key":"woman-playing-water-polo-1F3FD","emoji":"🤽🏽‍♀️"},"1F3FE":{"name":"woman-playing-water-polo","key":"woman-playing-water-polo-1F3FE","emoji":"🤽🏾‍♀️"},"1F3FF":{"name":"woman-playing-water-polo","key":"woman-playing-water-polo-1F3FF","emoji":"🤽🏿‍♀️"}}},{"name":"handball","key":"handball","names":["handball"],"emoji":"🤾","category":"Smileys & People","variants":{"1F3FB":{"name":"handball","key":"handball-1F3FB","emoji":"🤾🏻"},"1F3FC":{"name":"handball","key":"handball-1F3FC","emoji":"🤾🏼"},"1F3FD":{"name":"handball","key":"handball-1F3FD","emoji":"🤾🏽"},"1F3FE":{"name":"handball","key":"handball-1F3FE","emoji":"🤾🏾"},"1F3FF":{"name":"handball","key":"handball-1F3FF","emoji":"🤾🏿"}}},{"name":"man-playing-handball","key":"man-playing-handball","names":["man-playing-handball"],"emoji":"🤾‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-playing-handball","key":"man-playing-handball-1F3FB","emoji":"🤾🏻‍♂️"},"1F3FC":{"name":"man-playing-handball","key":"man-playing-handball-1F3FC","emoji":"🤾🏼‍♂️"},"1F3FD":{"name":"man-playing-handball","key":"man-playing-handball-1F3FD","emoji":"🤾🏽‍♂️"},"1F3FE":{"name":"man-playing-handball","key":"man-playing-handball-1F3FE","emoji":"🤾🏾‍♂️"},"1F3FF":{"name":"man-playing-handball","key":"man-playing-handball-1F3FF","emoji":"🤾🏿‍♂️"}}},{"name":"woman-playing-handball","key":"woman-playing-handball","names":["woman-playing-handball"],"emoji":"🤾‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-playing-handball","key":"woman-playing-handball-1F3FB","emoji":"🤾🏻‍♀️"},"1F3FC":{"name":"woman-playing-handball","key":"woman-playing-handball-1F3FC","emoji":"🤾🏼‍♀️"},"1F3FD":{"name":"woman-playing-handball","key":"woman-playing-handball-1F3FD","emoji":"🤾🏽‍♀️"},"1F3FE":{"name":"woman-playing-handball","key":"woman-playing-handball-1F3FE","emoji":"🤾🏾‍♀️"},"1F3FF":{"name":"woman-playing-handball","key":"woman-playing-handball-1F3FF","emoji":"🤾🏿‍♀️"}}},{"name":"juggling","key":"juggling","names":["juggling"],"emoji":"🤹","category":"Smileys & People","variants":{"1F3FB":{"name":"juggling","key":"juggling-1F3FB","emoji":"🤹🏻"},"1F3FC":{"name":"juggling","key":"juggling-1F3FC","emoji":"🤹🏼"},"1F3FD":{"name":"juggling","key":"juggling-1F3FD","emoji":"🤹🏽"},"1F3FE":{"name":"juggling","key":"juggling-1F3FE","emoji":"🤹🏾"},"1F3FF":{"name":"juggling","key":"juggling-1F3FF","emoji":"🤹🏿"}}},{"name":"man-juggling","key":"man-juggling","names":["man-juggling"],"emoji":"🤹‍♂️","category":"Smileys & People","variants":{"1F3FB":{"name":"man-juggling","key":"man-juggling-1F3FB","emoji":"🤹🏻‍♂️"},"1F3FC":{"name":"man-juggling","key":"man-juggling-1F3FC","emoji":"🤹🏼‍♂️"},"1F3FD":{"name":"man-juggling","key":"man-juggling-1F3FD","emoji":"🤹🏽‍♂️"},"1F3FE":{"name":"man-juggling","key":"man-juggling-1F3FE","emoji":"🤹🏾‍♂️"},"1F3FF":{"name":"man-juggling","key":"man-juggling-1F3FF","emoji":"🤹🏿‍♂️"}}},{"name":"woman-juggling","key":"woman-juggling","names":["woman-juggling"],"emoji":"🤹‍♀️","category":"Smileys & People","variants":{"1F3FB":{"name":"woman-juggling","key":"woman-juggling-1F3FB","emoji":"🤹🏻‍♀️"},"1F3FC":{"name":"woman-juggling","key":"woman-juggling-1F3FC","emoji":"🤹🏼‍♀️"},"1F3FD":{"name":"woman-juggling","key":"woman-juggling-1F3FD","emoji":"🤹🏽‍♀️"},"1F3FE":{"name":"woman-juggling","key":"woman-juggling-1F3FE","emoji":"🤹🏾‍♀️"},"1F3FF":{"name":"woman-juggling","key":"woman-juggling-1F3FF","emoji":"🤹🏿‍♀️"}}},{"name":"couple","key":"couple","names":["couple","man_and_woman_holding_hands"],"emoji":"👫","category":"Smileys & People"},{"name":"two_men_holding_hands","key":"two_men_holding_hands","names":["two_men_holding_hands"],"emoji":"👬","category":"Smileys & People"},{"name":"two_women_holding_hands","key":"two_women_holding_hands","names":["two_women_holding_hands"],"emoji":"👭","category":"Smileys & People"},{"name":"couplekiss","key":"couplekiss","names":["couplekiss"],"emoji":"💏","category":"Smileys & People"},{"name":"woman-kiss-man","key":"woman-kiss-man","names":["woman-kiss-man"],"emoji":"👩‍❤️‍💋‍👨","category":"Smileys & People"},{"name":"man-kiss-man","key":"man-kiss-man","names":["man-kiss-man"],"emoji":"👨‍❤️‍💋‍👨","category":"Smileys & People"},{"name":"woman-kiss-woman","key":"woman-kiss-woman","names":["woman-kiss-woman"],"emoji":"👩‍❤️‍💋‍👩","category":"Smileys & People"},{"name":"couple_with_heart","key":"couple_with_heart","names":["couple_with_heart"],"emoji":"💑","category":"Smileys & People"},{"name":"woman-heart-man","key":"woman-heart-man","names":["woman-heart-man"],"emoji":"👩‍❤️‍👨","category":"Smileys & People"},{"name":"man-heart-man","key":"man-heart-man","names":["man-heart-man"],"emoji":"👨‍❤️‍👨","category":"Smileys & People"},{"name":"woman-heart-woman","key":"woman-heart-woman","names":["woman-heart-woman"],"emoji":"👩‍❤️‍👩","category":"Smileys & People"},{"name":"family","key":"family","names":["family","man-woman-boy"],"emoji":"👪","category":"Smileys & People"},{"name":"man-woman-boy","key":"man-woman-boy","names":["man-woman-boy","family"],"emoji":"👨‍👩‍👦","category":"Smileys & People"},{"name":"man-woman-girl","key":"man-woman-girl","names":["man-woman-girl"],"emoji":"👨‍👩‍👧","category":"Smileys & People"},{"name":"man-woman-girl-boy","key":"man-woman-girl-boy","names":["man-woman-girl-boy"],"emoji":"👨‍👩‍👧‍👦","category":"Smileys & People"},{"name":"man-woman-boy-boy","key":"man-woman-boy-boy","names":["man-woman-boy-boy"],"emoji":"👨‍👩‍👦‍👦","category":"Smileys & People"},{"name":"man-woman-girl-girl","key":"man-woman-girl-girl","names":["man-woman-girl-girl"],"emoji":"👨‍👩‍👧‍👧","category":"Smileys & People"},{"name":"man-man-boy","key":"man-man-boy","names":["man-man-boy"],"emoji":"👨‍👨‍👦","category":"Smileys & People"},{"name":"man-man-girl","key":"man-man-girl","names":["man-man-girl"],"emoji":"👨‍👨‍👧","category":"Smileys & People"},{"name":"man-man-girl-boy","key":"man-man-girl-boy","names":["man-man-girl-boy"],"emoji":"👨‍👨‍👧‍👦","category":"Smileys & People"},{"name":"man-man-boy-boy","key":"man-man-boy-boy","names":["man-man-boy-boy"],"emoji":"👨‍👨‍👦‍👦","category":"Smileys & People"},{"name":"man-man-girl-girl","key":"man-man-girl-girl","names":["man-man-girl-girl"],"emoji":"👨‍👨‍👧‍👧","category":"Smileys & People"},{"name":"woman-woman-boy","key":"woman-woman-boy","names":["woman-woman-boy"],"emoji":"👩‍👩‍👦","category":"Smileys & People"},{"name":"woman-woman-girl","key":"woman-woman-girl","names":["woman-woman-girl"],"emoji":"👩‍👩‍👧","category":"Smileys & People"},{"name":"woman-woman-girl-boy","key":"woman-woman-girl-boy","names":["woman-woman-girl-boy"],"emoji":"👩‍👩‍👧‍👦","category":"Smileys & People"},{"name":"woman-woman-boy-boy","key":"woman-woman-boy-boy","names":["woman-woman-boy-boy"],"emoji":"👩‍👩‍👦‍👦","category":"Smileys & People"},{"name":"woman-woman-girl-girl","key":"woman-woman-girl-girl","names":["woman-woman-girl-girl"],"emoji":"👩‍👩‍👧‍👧","category":"Smileys & People"},{"name":"man-boy","key":"man-boy","names":["man-boy"],"emoji":"👨‍👦","category":"Smileys & People"},{"name":"man-boy-boy","key":"man-boy-boy","names":["man-boy-boy"],"emoji":"👨‍👦‍👦","category":"Smileys & People"},{"name":"man-girl","key":"man-girl","names":["man-girl"],"emoji":"👨‍👧","category":"Smileys & People"},{"name":"man-girl-boy","key":"man-girl-boy","names":["man-girl-boy"],"emoji":"👨‍👧‍👦","category":"Smileys & People"},{"name":"man-girl-girl","key":"man-girl-girl","names":["man-girl-girl"],"emoji":"👨‍👧‍👧","category":"Smileys & People"},{"name":"woman-boy","key":"woman-boy","names":["woman-boy"],"emoji":"👩‍👦","category":"Smileys & People"},{"name":"woman-boy-boy","key":"woman-boy-boy","names":["woman-boy-boy"],"emoji":"👩‍👦‍👦","category":"Smileys & People"},{"name":"woman-girl","key":"woman-girl","names":["woman-girl"],"emoji":"👩‍👧","category":"Smileys & People"},{"name":"woman-girl-boy","key":"woman-girl-boy","names":["woman-girl-boy"],"emoji":"👩‍👧‍👦","category":"Smileys & People"},{"name":"woman-girl-girl","key":"woman-girl-girl","names":["woman-girl-girl"],"emoji":"👩‍👧‍👧","category":"Smileys & People"},{"name":"selfie","key":"selfie","names":["selfie"],"emoji":"🤳","category":"Smileys & People","variants":{"1F3FB":{"name":"selfie","key":"selfie-1F3FB","emoji":"🤳🏻"},"1F3FC":{"name":"selfie","key":"selfie-1F3FC","emoji":"🤳🏼"},"1F3FD":{"name":"selfie","key":"selfie-1F3FD","emoji":"🤳🏽"},"1F3FE":{"name":"selfie","key":"selfie-1F3FE","emoji":"🤳🏾"},"1F3FF":{"name":"selfie","key":"selfie-1F3FF","emoji":"🤳🏿"}}},{"name":"muscle","key":"muscle","names":["muscle"],"emoji":"💪","category":"Smileys & People","variants":{"1F3FB":{"name":"muscle","key":"muscle-1F3FB","emoji":"💪🏻"},"1F3FC":{"name":"muscle","key":"muscle-1F3FC","emoji":"💪🏼"},"1F3FD":{"name":"muscle","key":"muscle-1F3FD","emoji":"💪🏽"},"1F3FE":{"name":"muscle","key":"muscle-1F3FE","emoji":"💪🏾"},"1F3FF":{"name":"muscle","key":"muscle-1F3FF","emoji":"💪🏿"}}},{"name":"point_left","key":"point_left","names":["point_left"],"emoji":"👈","category":"Smileys & People","variants":{"1F3FB":{"name":"point_left","key":"point_left-1F3FB","emoji":"👈🏻"},"1F3FC":{"name":"point_left","key":"point_left-1F3FC","emoji":"👈🏼"},"1F3FD":{"name":"point_left","key":"point_left-1F3FD","emoji":"👈🏽"},"1F3FE":{"name":"point_left","key":"point_left-1F3FE","emoji":"👈🏾"},"1F3FF":{"name":"point_left","key":"point_left-1F3FF","emoji":"👈🏿"}}},{"name":"point_right","key":"point_right","names":["point_right"],"emoji":"👉","category":"Smileys & People","variants":{"1F3FB":{"name":"point_right","key":"point_right-1F3FB","emoji":"👉🏻"},"1F3FC":{"name":"point_right","key":"point_right-1F3FC","emoji":"👉🏼"},"1F3FD":{"name":"point_right","key":"point_right-1F3FD","emoji":"👉🏽"},"1F3FE":{"name":"point_right","key":"point_right-1F3FE","emoji":"👉🏾"},"1F3FF":{"name":"point_right","key":"point_right-1F3FF","emoji":"👉🏿"}}},{"name":"point_up","key":"point_up","names":["point_up"],"emoji":"☝️","category":"Smileys & People","variants":{"1F3FB":{"name":"point_up","key":"point_up-1F3FB","emoji":"☝🏻"},"1F3FC":{"name":"point_up","key":"point_up-1F3FC","emoji":"☝🏼"},"1F3FD":{"name":"point_up","key":"point_up-1F3FD","emoji":"☝🏽"},"1F3FE":{"name":"point_up","key":"point_up-1F3FE","emoji":"☝🏾"},"1F3FF":{"name":"point_up","key":"point_up-1F3FF","emoji":"☝🏿"}}},{"name":"point_up_2","key":"point_up_2","names":["point_up_2"],"emoji":"👆","category":"Smileys & People","variants":{"1F3FB":{"name":"point_up_2","key":"point_up_2-1F3FB","emoji":"👆🏻"},"1F3FC":{"name":"point_up_2","key":"point_up_2-1F3FC","emoji":"👆🏼"},"1F3FD":{"name":"point_up_2","key":"point_up_2-1F3FD","emoji":"👆🏽"},"1F3FE":{"name":"point_up_2","key":"point_up_2-1F3FE","emoji":"👆🏾"},"1F3FF":{"name":"point_up_2","key":"point_up_2-1F3FF","emoji":"👆🏿"}}},{"name":"middle_finger","key":"middle_finger","names":["middle_finger","reversed_hand_with_middle_finger_extended"],"emoji":"🖕","category":"Smileys & People","variants":{"1F3FB":{"name":"middle_finger","key":"middle_finger-1F3FB","emoji":"🖕🏻"},"1F3FC":{"name":"middle_finger","key":"middle_finger-1F3FC","emoji":"🖕🏼"},"1F3FD":{"name":"middle_finger","key":"middle_finger-1F3FD","emoji":"🖕🏽"},"1F3FE":{"name":"middle_finger","key":"middle_finger-1F3FE","emoji":"🖕🏾"},"1F3FF":{"name":"middle_finger","key":"middle_finger-1F3FF","emoji":"🖕🏿"}}},{"name":"point_down","key":"point_down","names":["point_down"],"emoji":"👇","category":"Smileys & People","variants":{"1F3FB":{"name":"point_down","key":"point_down-1F3FB","emoji":"👇🏻"},"1F3FC":{"name":"point_down","key":"point_down-1F3FC","emoji":"👇🏼"},"1F3FD":{"name":"point_down","key":"point_down-1F3FD","emoji":"👇🏽"},"1F3FE":{"name":"point_down","key":"point_down-1F3FE","emoji":"👇🏾"},"1F3FF":{"name":"point_down","key":"point_down-1F3FF","emoji":"👇🏿"}}},{"name":"v","key":"v","names":["v"],"emoji":"✌️","category":"Smileys & People","variants":{"1F3FB":{"name":"v","key":"v-1F3FB","emoji":"✌🏻"},"1F3FC":{"name":"v","key":"v-1F3FC","emoji":"✌🏼"},"1F3FD":{"name":"v","key":"v-1F3FD","emoji":"✌🏽"},"1F3FE":{"name":"v","key":"v-1F3FE","emoji":"✌🏾"},"1F3FF":{"name":"v","key":"v-1F3FF","emoji":"✌🏿"}}},{"name":"crossed_fingers","key":"crossed_fingers","names":["crossed_fingers","hand_with_index_and_middle_fingers_crossed"],"emoji":"🤞","category":"Smileys & People","variants":{"1F3FB":{"name":"crossed_fingers","key":"crossed_fingers-1F3FB","emoji":"🤞🏻"},"1F3FC":{"name":"crossed_fingers","key":"crossed_fingers-1F3FC","emoji":"🤞🏼"},"1F3FD":{"name":"crossed_fingers","key":"crossed_fingers-1F3FD","emoji":"🤞🏽"},"1F3FE":{"name":"crossed_fingers","key":"crossed_fingers-1F3FE","emoji":"🤞🏾"},"1F3FF":{"name":"crossed_fingers","key":"crossed_fingers-1F3FF","emoji":"🤞🏿"}}},{"name":"spock-hand","key":"spock-hand","names":["spock-hand"],"emoji":"🖖","category":"Smileys & People","variants":{"1F3FB":{"name":"spock-hand","key":"spock-hand-1F3FB","emoji":"🖖🏻"},"1F3FC":{"name":"spock-hand","key":"spock-hand-1F3FC","emoji":"🖖🏼"},"1F3FD":{"name":"spock-hand","key":"spock-hand-1F3FD","emoji":"🖖🏽"},"1F3FE":{"name":"spock-hand","key":"spock-hand-1F3FE","emoji":"🖖🏾"},"1F3FF":{"name":"spock-hand","key":"spock-hand-1F3FF","emoji":"🖖🏿"}}},{"name":"the_horns","key":"the_horns","names":["the_horns","sign_of_the_horns"],"emoji":"🤘","category":"Smileys & People","variants":{"1F3FB":{"name":"the_horns","key":"the_horns-1F3FB","emoji":"🤘🏻"},"1F3FC":{"name":"the_horns","key":"the_horns-1F3FC","emoji":"🤘🏼"},"1F3FD":{"name":"the_horns","key":"the_horns-1F3FD","emoji":"🤘🏽"},"1F3FE":{"name":"the_horns","key":"the_horns-1F3FE","emoji":"🤘🏾"},"1F3FF":{"name":"the_horns","key":"the_horns-1F3FF","emoji":"🤘🏿"}}},{"name":"call_me_hand","key":"call_me_hand","names":["call_me_hand"],"emoji":"🤙","category":"Smileys & People","variants":{"1F3FB":{"name":"call_me_hand","key":"call_me_hand-1F3FB","emoji":"🤙🏻"},"1F3FC":{"name":"call_me_hand","key":"call_me_hand-1F3FC","emoji":"🤙🏼"},"1F3FD":{"name":"call_me_hand","key":"call_me_hand-1F3FD","emoji":"🤙🏽"},"1F3FE":{"name":"call_me_hand","key":"call_me_hand-1F3FE","emoji":"🤙🏾"},"1F3FF":{"name":"call_me_hand","key":"call_me_hand-1F3FF","emoji":"🤙🏿"}}},{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed","names":["raised_hand_with_fingers_splayed"],"emoji":"🖐️","category":"Smileys & People","variants":{"1F3FB":{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed-1F3FB","emoji":"🖐🏻"},"1F3FC":{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed-1F3FC","emoji":"🖐🏼"},"1F3FD":{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed-1F3FD","emoji":"🖐🏽"},"1F3FE":{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed-1F3FE","emoji":"🖐🏾"},"1F3FF":{"name":"raised_hand_with_fingers_splayed","key":"raised_hand_with_fingers_splayed-1F3FF","emoji":"🖐🏿"}}},{"name":"hand","key":"hand","names":["hand","raised_hand"],"emoji":"✋","category":"Smileys & People","variants":{"1F3FB":{"name":"hand","key":"hand-1F3FB","emoji":"✋🏻"},"1F3FC":{"name":"hand","key":"hand-1F3FC","emoji":"✋🏼"},"1F3FD":{"name":"hand","key":"hand-1F3FD","emoji":"✋🏽"},"1F3FE":{"name":"hand","key":"hand-1F3FE","emoji":"✋🏾"},"1F3FF":{"name":"hand","key":"hand-1F3FF","emoji":"✋🏿"}}},{"name":"ok_hand","key":"ok_hand","names":["ok_hand"],"emoji":"👌","category":"Smileys & People","variants":{"1F3FB":{"name":"ok_hand","key":"ok_hand-1F3FB","emoji":"👌🏻"},"1F3FC":{"name":"ok_hand","key":"ok_hand-1F3FC","emoji":"👌🏼"},"1F3FD":{"name":"ok_hand","key":"ok_hand-1F3FD","emoji":"👌🏽"},"1F3FE":{"name":"ok_hand","key":"ok_hand-1F3FE","emoji":"👌🏾"},"1F3FF":{"name":"ok_hand","key":"ok_hand-1F3FF","emoji":"👌🏿"}}},{"name":"+1","key":"+1","names":["+1","thumbsup"],"emoji":"👍","category":"Smileys & People","variants":{"1F3FB":{"name":"+1","key":"+1-1F3FB","emoji":"👍🏻"},"1F3FC":{"name":"+1","key":"+1-1F3FC","emoji":"👍🏼"},"1F3FD":{"name":"+1","key":"+1-1F3FD","emoji":"👍🏽"},"1F3FE":{"name":"+1","key":"+1-1F3FE","emoji":"👍🏾"},"1F3FF":{"name":"+1","key":"+1-1F3FF","emoji":"👍🏿"}}},{"name":"-1","key":"-1","names":["-1","thumbsdown"],"emoji":"👎","category":"Smileys & People","variants":{"1F3FB":{"name":"-1","key":"-1-1F3FB","emoji":"👎🏻"},"1F3FC":{"name":"-1","key":"-1-1F3FC","emoji":"👎🏼"},"1F3FD":{"name":"-1","key":"-1-1F3FD","emoji":"👎🏽"},"1F3FE":{"name":"-1","key":"-1-1F3FE","emoji":"👎🏾"},"1F3FF":{"name":"-1","key":"-1-1F3FF","emoji":"👎🏿"}}},{"name":"fist","key":"fist","names":["fist"],"emoji":"✊","category":"Smileys & People","variants":{"1F3FB":{"name":"fist","key":"fist-1F3FB","emoji":"✊🏻"},"1F3FC":{"name":"fist","key":"fist-1F3FC","emoji":"✊🏼"},"1F3FD":{"name":"fist","key":"fist-1F3FD","emoji":"✊🏽"},"1F3FE":{"name":"fist","key":"fist-1F3FE","emoji":"✊🏾"},"1F3FF":{"name":"fist","key":"fist-1F3FF","emoji":"✊🏿"}}},{"name":"facepunch","key":"facepunch","names":["facepunch","punch"],"emoji":"👊","category":"Smileys & People","variants":{"1F3FB":{"name":"facepunch","key":"facepunch-1F3FB","emoji":"👊🏻"},"1F3FC":{"name":"facepunch","key":"facepunch-1F3FC","emoji":"👊🏼"},"1F3FD":{"name":"facepunch","key":"facepunch-1F3FD","emoji":"👊🏽"},"1F3FE":{"name":"facepunch","key":"facepunch-1F3FE","emoji":"👊🏾"},"1F3FF":{"name":"facepunch","key":"facepunch-1F3FF","emoji":"👊🏿"}}},{"name":"left-facing_fist","key":"left-facing_fist","names":["left-facing_fist"],"emoji":"🤛","category":"Smileys & People","variants":{"1F3FB":{"name":"left-facing_fist","key":"left-facing_fist-1F3FB","emoji":"🤛🏻"},"1F3FC":{"name":"left-facing_fist","key":"left-facing_fist-1F3FC","emoji":"🤛🏼"},"1F3FD":{"name":"left-facing_fist","key":"left-facing_fist-1F3FD","emoji":"🤛🏽"},"1F3FE":{"name":"left-facing_fist","key":"left-facing_fist-1F3FE","emoji":"🤛🏾"},"1F3FF":{"name":"left-facing_fist","key":"left-facing_fist-1F3FF","emoji":"🤛🏿"}}},{"name":"right-facing_fist","key":"right-facing_fist","names":["right-facing_fist"],"emoji":"🤜","category":"Smileys & People","variants":{"1F3FB":{"name":"right-facing_fist","key":"right-facing_fist-1F3FB","emoji":"🤜🏻"},"1F3FC":{"name":"right-facing_fist","key":"right-facing_fist-1F3FC","emoji":"🤜🏼"},"1F3FD":{"name":"right-facing_fist","key":"right-facing_fist-1F3FD","emoji":"🤜🏽"},"1F3FE":{"name":"right-facing_fist","key":"right-facing_fist-1F3FE","emoji":"🤜🏾"},"1F3FF":{"name":"right-facing_fist","key":"right-facing_fist-1F3FF","emoji":"🤜🏿"}}},{"name":"raised_back_of_hand","key":"raised_back_of_hand","names":["raised_back_of_hand"],"emoji":"🤚","category":"Smileys & People","variants":{"1F3FB":{"name":"raised_back_of_hand","key":"raised_back_of_hand-1F3FB","emoji":"🤚🏻"},"1F3FC":{"name":"raised_back_of_hand","key":"raised_back_of_hand-1F3FC","emoji":"🤚🏼"},"1F3FD":{"name":"raised_back_of_hand","key":"raised_back_of_hand-1F3FD","emoji":"🤚🏽"},"1F3FE":{"name":"raised_back_of_hand","key":"raised_back_of_hand-1F3FE","emoji":"🤚🏾"},"1F3FF":{"name":"raised_back_of_hand","key":"raised_back_of_hand-1F3FF","emoji":"🤚🏿"}}},{"name":"wave","key":"wave","names":["wave"],"emoji":"👋","category":"Smileys & People","variants":{"1F3FB":{"name":"wave","key":"wave-1F3FB","emoji":"👋🏻"},"1F3FC":{"name":"wave","key":"wave-1F3FC","emoji":"👋🏼"},"1F3FD":{"name":"wave","key":"wave-1F3FD","emoji":"👋🏽"},"1F3FE":{"name":"wave","key":"wave-1F3FE","emoji":"👋🏾"},"1F3FF":{"name":"wave","key":"wave-1F3FF","emoji":"👋🏿"}}},{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign","names":["i_love_you_hand_sign"],"emoji":"🤟","category":"Smileys & People","variants":{"1F3FB":{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign-1F3FB","emoji":"🤟🏻"},"1F3FC":{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign-1F3FC","emoji":"🤟🏼"},"1F3FD":{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign-1F3FD","emoji":"🤟🏽"},"1F3FE":{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign-1F3FE","emoji":"🤟🏾"},"1F3FF":{"name":"i_love_you_hand_sign","key":"i_love_you_hand_sign-1F3FF","emoji":"🤟🏿"}}},{"name":"writing_hand","key":"writing_hand","names":["writing_hand"],"emoji":"✍️","category":"Smileys & People","variants":{"1F3FB":{"name":"writing_hand","key":"writing_hand-1F3FB","emoji":"✍🏻"},"1F3FC":{"name":"writing_hand","key":"writing_hand-1F3FC","emoji":"✍🏼"},"1F3FD":{"name":"writing_hand","key":"writing_hand-1F3FD","emoji":"✍🏽"},"1F3FE":{"name":"writing_hand","key":"writing_hand-1F3FE","emoji":"✍🏾"},"1F3FF":{"name":"writing_hand","key":"writing_hand-1F3FF","emoji":"✍🏿"}}},{"name":"clap","key":"clap","names":["clap"],"emoji":"👏","category":"Smileys & People","variants":{"1F3FB":{"name":"clap","key":"clap-1F3FB","emoji":"👏🏻"},"1F3FC":{"name":"clap","key":"clap-1F3FC","emoji":"👏🏼"},"1F3FD":{"name":"clap","key":"clap-1F3FD","emoji":"👏🏽"},"1F3FE":{"name":"clap","key":"clap-1F3FE","emoji":"👏🏾"},"1F3FF":{"name":"clap","key":"clap-1F3FF","emoji":"👏🏿"}}},{"name":"open_hands","key":"open_hands","names":["open_hands"],"emoji":"👐","category":"Smileys & People","variants":{"1F3FB":{"name":"open_hands","key":"open_hands-1F3FB","emoji":"👐🏻"},"1F3FC":{"name":"open_hands","key":"open_hands-1F3FC","emoji":"👐🏼"},"1F3FD":{"name":"open_hands","key":"open_hands-1F3FD","emoji":"👐🏽"},"1F3FE":{"name":"open_hands","key":"open_hands-1F3FE","emoji":"👐🏾"},"1F3FF":{"name":"open_hands","key":"open_hands-1F3FF","emoji":"👐🏿"}}},{"name":"raised_hands","key":"raised_hands","names":["raised_hands"],"emoji":"🙌","category":"Smileys & People","variants":{"1F3FB":{"name":"raised_hands","key":"raised_hands-1F3FB","emoji":"🙌🏻"},"1F3FC":{"name":"raised_hands","key":"raised_hands-1F3FC","emoji":"🙌🏼"},"1F3FD":{"name":"raised_hands","key":"raised_hands-1F3FD","emoji":"🙌🏽"},"1F3FE":{"name":"raised_hands","key":"raised_hands-1F3FE","emoji":"🙌🏾"},"1F3FF":{"name":"raised_hands","key":"raised_hands-1F3FF","emoji":"🙌🏿"}}},{"name":"palms_up_together","key":"palms_up_together","names":["palms_up_together"],"emoji":"🤲","category":"Smileys & People","variants":{"1F3FB":{"name":"palms_up_together","key":"palms_up_together-1F3FB","emoji":"🤲🏻"},"1F3FC":{"name":"palms_up_together","key":"palms_up_together-1F3FC","emoji":"🤲🏼"},"1F3FD":{"name":"palms_up_together","key":"palms_up_together-1F3FD","emoji":"🤲🏽"},"1F3FE":{"name":"palms_up_together","key":"palms_up_together-1F3FE","emoji":"🤲🏾"},"1F3FF":{"name":"palms_up_together","key":"palms_up_together-1F3FF","emoji":"🤲🏿"}}},{"name":"pray","key":"pray","names":["pray"],"emoji":"🙏","category":"Smileys & People","variants":{"1F3FB":{"name":"pray","key":"pray-1F3FB","emoji":"🙏🏻"},"1F3FC":{"name":"pray","key":"pray-1F3FC","emoji":"🙏🏼"},"1F3FD":{"name":"pray","key":"pray-1F3FD","emoji":"🙏🏽"},"1F3FE":{"name":"pray","key":"pray-1F3FE","emoji":"🙏🏾"},"1F3FF":{"name":"pray","key":"pray-1F3FF","emoji":"🙏🏿"}}},{"name":"handshake","key":"handshake","names":["handshake"],"emoji":"🤝","category":"Smileys & People"},{"name":"nail_care","key":"nail_care","names":["nail_care"],"emoji":"💅","category":"Smileys & People","variants":{"1F3FB":{"name":"nail_care","key":"nail_care-1F3FB","emoji":"💅🏻"},"1F3FC":{"name":"nail_care","key":"nail_care-1F3FC","emoji":"💅🏼"},"1F3FD":{"name":"nail_care","key":"nail_care-1F3FD","emoji":"💅🏽"},"1F3FE":{"name":"nail_care","key":"nail_care-1F3FE","emoji":"💅🏾"},"1F3FF":{"name":"nail_care","key":"nail_care-1F3FF","emoji":"💅🏿"}}},{"name":"ear","key":"ear","names":["ear"],"emoji":"👂","category":"Smileys & People","variants":{"1F3FB":{"name":"ear","key":"ear-1F3FB","emoji":"👂🏻"},"1F3FC":{"name":"ear","key":"ear-1F3FC","emoji":"👂🏼"},"1F3FD":{"name":"ear","key":"ear-1F3FD","emoji":"👂🏽"},"1F3FE":{"name":"ear","key":"ear-1F3FE","emoji":"👂🏾"},"1F3FF":{"name":"ear","key":"ear-1F3FF","emoji":"👂🏿"}}},{"name":"nose","key":"nose","names":["nose"],"emoji":"👃","category":"Smileys & People","variants":{"1F3FB":{"name":"nose","key":"nose-1F3FB","emoji":"👃🏻"},"1F3FC":{"name":"nose","key":"nose-1F3FC","emoji":"👃🏼"},"1F3FD":{"name":"nose","key":"nose-1F3FD","emoji":"👃🏽"},"1F3FE":{"name":"nose","key":"nose-1F3FE","emoji":"👃🏾"},"1F3FF":{"name":"nose","key":"nose-1F3FF","emoji":"👃🏿"}}},{"name":"footprints","key":"footprints","names":["footprints"],"emoji":"👣","category":"Smileys & People"},{"name":"eyes","key":"eyes","names":["eyes"],"emoji":"👀","category":"Smileys & People"},{"name":"eye","key":"eye","names":["eye"],"emoji":"👁️","category":"Smileys & People"},{"name":"eye-in-speech-bubble","key":"eye-in-speech-bubble","names":["eye-in-speech-bubble"],"emoji":"👁️‍🗨️","category":"Smileys & People"},{"name":"brain","key":"brain","names":["brain"],"emoji":"🧠","category":"Smileys & People"},{"name":"tongue","key":"tongue","names":["tongue"],"emoji":"👅","category":"Smileys & People"},{"name":"lips","key":"lips","names":["lips"],"emoji":"👄","category":"Smileys & People"},{"name":"kiss","key":"kiss","names":["kiss"],"emoji":"💋","category":"Smileys & People"},{"name":"cupid","key":"cupid","names":["cupid"],"emoji":"💘","category":"Smileys & People"},{"name":"heart","key":"heart","names":["heart"],"emoji":"❤️","category":"Smileys & People"},{"name":"heartbeat","key":"heartbeat","names":["heartbeat"],"emoji":"💓","category":"Smileys & People"},{"name":"broken_heart","key":"broken_heart","names":["broken_heart"],"emoji":"💔","category":"Smileys & People"},{"name":"two_hearts","key":"two_hearts","names":["two_hearts"],"emoji":"💕","category":"Smileys & People"},{"name":"sparkling_heart","key":"sparkling_heart","names":["sparkling_heart"],"emoji":"💖","category":"Smileys & People"},{"name":"heartpulse","key":"heartpulse","names":["heartpulse"],"emoji":"💗","category":"Smileys & People"},{"name":"blue_heart","key":"blue_heart","names":["blue_heart"],"emoji":"💙","category":"Smileys & People"},{"name":"green_heart","key":"green_heart","names":["green_heart"],"emoji":"💚","category":"Smileys & People"},{"name":"yellow_heart","key":"yellow_heart","names":["yellow_heart"],"emoji":"💛","category":"Smileys & People"},{"name":"orange_heart","key":"orange_heart","names":["orange_heart"],"emoji":"🧡","category":"Smileys & People"},{"name":"purple_heart","key":"purple_heart","names":["purple_heart"],"emoji":"💜","category":"Smileys & People"},{"name":"black_heart","key":"black_heart","names":["black_heart"],"emoji":"🖤","category":"Smileys & People"},{"name":"gift_heart","key":"gift_heart","names":["gift_heart"],"emoji":"💝","category":"Smileys & People"},{"name":"revolving_hearts","key":"revolving_hearts","names":["revolving_hearts"],"emoji":"💞","category":"Smileys & People"},{"name":"heart_decoration","key":"heart_decoration","names":["heart_decoration"],"emoji":"💟","category":"Smileys & People"},{"name":"heavy_heart_exclamation_mark_ornament","key":"heavy_heart_exclamation_mark_ornament","names":["heavy_heart_exclamation_mark_ornament"],"emoji":"❣️","category":"Smileys & People"},{"name":"love_letter","key":"love_letter","names":["love_letter"],"emoji":"💌","category":"Smileys & People"},{"name":"zzz","key":"zzz","names":["zzz"],"emoji":"💤","category":"Smileys & People"},{"name":"anger","key":"anger","names":["anger"],"emoji":"💢","category":"Smileys & People"},{"name":"bomb","key":"bomb","names":["bomb"],"emoji":"💣","category":"Smileys & People"},{"name":"boom","key":"boom","names":["boom","collision"],"emoji":"💥","category":"Smileys & People"},{"name":"sweat_drops","key":"sweat_drops","names":["sweat_drops"],"emoji":"💦","category":"Smileys & People"},{"name":"dash","key":"dash","names":["dash"],"emoji":"💨","category":"Smileys & People"},{"name":"dizzy","key":"dizzy","names":["dizzy"],"emoji":"💫","category":"Smileys & People"},{"name":"speech_balloon","key":"speech_balloon","names":["speech_balloon"],"emoji":"💬","category":"Smileys & People"},{"name":"left_speech_bubble","key":"left_speech_bubble","names":["left_speech_bubble"],"emoji":"🗨️","category":"Smileys & People"},{"name":"right_anger_bubble","key":"right_anger_bubble","names":["right_anger_bubble"],"emoji":"🗯️","category":"Smileys & People"},{"name":"thought_balloon","key":"thought_balloon","names":["thought_balloon"],"emoji":"💭","category":"Smileys & People"},{"name":"hole","key":"hole","names":["hole"],"emoji":"🕳️","category":"Smileys & People"},{"name":"eyeglasses","key":"eyeglasses","names":["eyeglasses"],"emoji":"👓","category":"Smileys & People"},{"name":"dark_sunglasses","key":"dark_sunglasses","names":["dark_sunglasses"],"emoji":"🕶️","category":"Smileys & People"},{"name":"necktie","key":"necktie","names":["necktie"],"emoji":"👔","category":"Smileys & People"},{"name":"shirt","key":"shirt","names":["shirt","tshirt"],"emoji":"👕","category":"Smileys & People"},{"name":"jeans","key":"jeans","names":["jeans"],"emoji":"👖","category":"Smileys & People"},{"name":"scarf","key":"scarf","names":["scarf"],"emoji":"🧣","category":"Smileys & People"},{"name":"gloves","key":"gloves","names":["gloves"],"emoji":"🧤","category":"Smileys & People"},{"name":"coat","key":"coat","names":["coat"],"emoji":"🧥","category":"Smileys & People"},{"name":"socks","key":"socks","names":["socks"],"emoji":"🧦","category":"Smileys & People"},{"name":"dress","key":"dress","names":["dress"],"emoji":"👗","category":"Smileys & People"},{"name":"kimono","key":"kimono","names":["kimono"],"emoji":"👘","category":"Smileys & People"},{"name":"bikini","key":"bikini","names":["bikini"],"emoji":"👙","category":"Smileys & People"},{"name":"womans_clothes","key":"womans_clothes","names":["womans_clothes"],"emoji":"👚","category":"Smileys & People"},{"name":"purse","key":"purse","names":["purse"],"emoji":"👛","category":"Smileys & People"},{"name":"handbag","key":"handbag","names":["handbag"],"emoji":"👜","category":"Smileys & People"},{"name":"pouch","key":"pouch","names":["pouch"],"emoji":"👝","category":"Smileys & People"},{"name":"shopping_bags","key":"shopping_bags","names":["shopping_bags"],"emoji":"🛍️","category":"Smileys & People"},{"name":"school_satchel","key":"school_satchel","names":["school_satchel"],"emoji":"🎒","category":"Smileys & People"},{"name":"mans_shoe","key":"mans_shoe","names":["mans_shoe","shoe"],"emoji":"👞","category":"Smileys & People"},{"name":"athletic_shoe","key":"athletic_shoe","names":["athletic_shoe"],"emoji":"👟","category":"Smileys & People"},{"name":"high_heel","key":"high_heel","names":["high_heel"],"emoji":"👠","category":"Smileys & People"},{"name":"sandal","key":"sandal","names":["sandal"],"emoji":"👡","category":"Smileys & People"},{"name":"boot","key":"boot","names":["boot"],"emoji":"👢","category":"Smileys & People"},{"name":"crown","key":"crown","names":["crown"],"emoji":"👑","category":"Smileys & People"},{"name":"womans_hat","key":"womans_hat","names":["womans_hat"],"emoji":"👒","category":"Smileys & People"},{"name":"tophat","key":"tophat","names":["tophat"],"emoji":"🎩","category":"Smileys & People"},{"name":"mortar_board","key":"mortar_board","names":["mortar_board"],"emoji":"🎓","category":"Smileys & People"},{"name":"billed_cap","key":"billed_cap","names":["billed_cap"],"emoji":"🧢","category":"Smileys & People"},{"name":"helmet_with_white_cross","key":"helmet_with_white_cross","names":["helmet_with_white_cross"],"emoji":"⛑️","category":"Smileys & People"},{"name":"prayer_beads","key":"prayer_beads","names":["prayer_beads"],"emoji":"📿","category":"Smileys & People"},{"name":"lipstick","key":"lipstick","names":["lipstick"],"emoji":"💄","category":"Smileys & People"},{"name":"ring","key":"ring","names":["ring"],"emoji":"💍","category":"Smileys & People"},{"name":"gem","key":"gem","names":["gem"],"emoji":"💎","category":"Smileys & People"}];

/* src/EmojiSearchResults.svelte generated by Svelte v3.8.1 */

function add_css$8() {
	var style = element("style");
	style.id = 'svelte-hnogl1-style';
	style.textContent = ".svelte-emoji-picker__search-results.svelte-hnogl1{padding:0.25em;height:15rem}.svelte-emoji-picker__search-results.svelte-hnogl1 h3.svelte-hnogl1{margin:0;font-size:0.9em;margin:0 auto;color:#999999}.svelte-emoji-picker__no-results.svelte-hnogl1{height:15rem;display:flex;flex-direction:column;justify-content:center}.svelte-emoji-picker__no-results.svelte-hnogl1 .icon.svelte-hnogl1{margin:0 auto;font-size:3em;color:#999999}";
	append(document.head, style);
}

// (54:2) {:else}
function create_else_block$2(ctx) {
	var div1, div0, t, h3, current, dispose;

	var icon = new Icon({ props: { icon: faFrown } });

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			icon.$$.fragment.c();
			t = space();
			h3 = element("h3");
			h3.textContent = "No emojis found.";
			attr(div0, "class", "icon svelte-hnogl1");
			attr(h3, "class", "svelte-hnogl1");
			attr(div1, "class", "svelte-emoji-picker__no-results svelte-hnogl1");
			dispose = listen(div1, "mouseover", ctx.onMouseOver);
		},

		m(target, anchor) {
			insert(target, div1, anchor);
			append(div1, div0);
			mount_component(icon, div0, null);
			append(div1, t);
			append(div1, h3);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.faFrown) icon_changes.icon = faFrown;
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div1);
			}

			destroy_component(icon);

			dispose();
		}
	};
}

// (52:2) {#if searchResults.length}
function create_if_block$3(ctx) {
	var current;

	var emojilist = new EmojiList({
		props: {
		emojis: ctx.searchResults,
		withTabs: false
	}
	});
	emojilist.$on("emojihover", ctx.emojihover_handler);
	emojilist.$on("emojiclick", ctx.emojiclick_handler);

	return {
		c() {
			emojilist.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(emojilist, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emojilist_changes = {};
			if (changed.searchResults) emojilist_changes.emojis = ctx.searchResults;
			emojilist.$set(emojilist_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emojilist.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emojilist.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emojilist, detaching);
		}
	};
}

function create_fragment$a(ctx) {
	var div, current_block_type_index, if_block, current;

	var if_block_creators = [
		create_if_block$3,
		create_else_block$2
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (ctx.searchResults.length) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			div = element("div");
			if_block.c();
			attr(div, "class", "svelte-emoji-picker__search-results svelte-hnogl1");
		},

		m(target, anchor) {
			insert(target, div, anchor);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},

		p(changed, ctx) {
			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block = if_blocks[current_block_type_index];
				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				}
				transition_in(if_block, 1);
				if_block.m(div, null);
			}
		},

		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},

		o(local) {
			transition_out(if_block);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			if_blocks[current_block_type_index].d();
		}
	};
}

function instance$a($$self, $$props, $$invalidate) {
	

  let { searchText = '' } = $$props;

  const dispatch = createEventDispatcher();

  function onMouseOver() {
    dispatch('emojihover', null);
  }

	function emojihover_handler(event) {
		bubble($$self, event);
	}

	function emojiclick_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ('searchText' in $$props) $$invalidate('searchText', searchText = $$props.searchText);
	};

	let searchResults;

	$$self.$$.update = ($$dirty = { searchText: 1 }) => {
		if ($$dirty.searchText) { $$invalidate('searchResults', searchResults = emojiData.filter(emoji => (
        emoji.names.find(name => name.indexOf(searchText) >= 0)
      ))); }
	};

	return {
		searchText,
		onMouseOver,
		searchResults,
		emojihover_handler,
		emojiclick_handler
	};
}

class EmojiSearchResults extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-hnogl1-style")) add_css$8();
		init(this, options, instance$a, create_fragment$a, safe_not_equal, ["searchText"]);
	}
}

/* src/VariantPopup.svelte generated by Svelte v3.8.1 */

function add_css$9() {
	var style = element("style");
	style.id = 'svelte-owno9f-style';
	style.textContent = ".svelte-emoji-picker__variants-container.svelte-owno9f{position:absolute;top:0;left:0;background:rgba(0, 0, 0, 0.5);width:23rem;height:21rem;display:flex;flex-direction:column;justify-content:center}.svelte-emoji-picker__variants.svelte-owno9f{background:#FFFFFF;margin:0.5em;padding:0.5em;text-align:center}.svelte-emoji-picker__variants.svelte-owno9f .close-button.svelte-owno9f{position:absolute;font-size:1em;right:0.75em;top:calc(50% - 0.5em);cursor:pointer}";
	append(document.head, style);
}

function get_each_context$1(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.variant = list[i];
	return child_ctx;
}

// (53:4) {#each Object.keys(variants) as variant}
function create_each_block$1(ctx) {
	var current;

	var emoji = new Emoji({ props: { emoji: ctx.variants[ctx.variant] } });
	emoji.$on("emojiclick", ctx.emojiclick_handler);

	return {
		c() {
			emoji.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(emoji, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emoji_changes = {};
			if (changed.variants) emoji_changes.emoji = ctx.variants[ctx.variant];
			emoji.$set(emoji_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emoji.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emoji.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emoji, detaching);
		}
	};
}

function create_fragment$b(ctx) {
	var div2, div1, t, div0, current, dispose;

	var each_value = Object.keys(ctx.variants);

	var each_blocks = [];

	for (var i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	var icon = new Icon({ props: { icon: faTimes } });

	return {
		c() {
			div2 = element("div");
			div1 = element("div");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t = space();
			div0 = element("div");
			icon.$$.fragment.c();
			attr(div0, "class", "close-button svelte-owno9f");
			attr(div0, "role", "button");
			attr(div1, "class", "svelte-emoji-picker__variants svelte-owno9f");
			attr(div2, "class", "svelte-emoji-picker__variants-container svelte-owno9f");

			dispose = [
				listen(div0, "click", ctx.onClickClose),
				listen(div2, "click", ctx.onClickContainer)
			];
		},

		m(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div1, null);
			}

			append(div1, t);
			append(div1, div0);
			mount_component(icon, div0, null);
			current = true;
		},

		p(changed, ctx) {
			if (changed.variants) {
				each_value = Object.keys(ctx.variants);

				for (var i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$1(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$1(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div1, t);
					}
				}

				group_outros();
				for (i = each_value.length; i < each_blocks.length; i += 1) out(i);
				check_outros();
			}

			var icon_changes = {};
			if (changed.faTimes) icon_changes.icon = faTimes;
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			each_blocks = each_blocks.filter(Boolean);
			for (let i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div2);
			}

			destroy_each(each_blocks, detaching);

			destroy_component(icon);

			run_all(dispose);
		}
	};
}

function instance$b($$self, $$props, $$invalidate) {
	

  let { variants } = $$props;

  const dispatch = createEventDispatcher();

  function onClickClose() {
    dispatch('close');
  }
  
  function onClickContainer(event) {
    dispatch('close');
  }

	function emojiclick_handler(event) {
		bubble($$self, event);
	}

	$$self.$set = $$props => {
		if ('variants' in $$props) $$invalidate('variants', variants = $$props.variants);
	};

	return {
		variants,
		onClickClose,
		onClickContainer,
		emojiclick_handler
	};
}

class VariantPopup extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-owno9f-style")) add_css$9();
		init(this, options, instance$b, create_fragment$b, safe_not_equal, ["variants"]);
	}
}

/* src/index.svelte generated by Svelte v3.8.1 */

function add_css$a() {
	var style = element("style");
	style.id = 'svelte-d48g0m-style';
	style.textContent = ".svelte-emoji-picker.svelte-d48g0m{background:#FFFFFF;border:1px solid #CCCCCC;border-radius:5px;width:23rem;height:21rem;margin:0 0.5em;box-shadow:0px 0px 3px 1px #CCCCCC}.svelte-emoji-picker__trigger.svelte-d48g0m{cursor:pointer;padding:2rem 2rem 2rem 2rem}.svelte-emoji-picker__emoji-tabs.svelte-d48g0m{padding:0.25em;height:15rem}.svelte-emoji-picker__emoji-tabs .svelte-tabs ul.svelte-tabs__tab-list{display:flex}.svelte-emoji-picker__emoji-tabs .svelte-tabs li.svelte-tabs__tab{flex-grow:1}";
	append(document.head, style);
}

function get_each_context$2(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.category = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = Object.create(ctx);
	child_ctx.category = list[i];
	return child_ctx;
}

// (177:0) {#if pickerVisible}
function create_if_block$4(ctx) {
	var current;

	var clickoutside = new Index({
		props: {
		exclude: [ctx.triggerButtonEl],
		$$slots: { default: [create_default_slot] },
		$$scope: { ctx }
	}
	});
	clickoutside.$on("clickoutside", ctx.hidePicker);

	return {
		c() {
			clickoutside.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(clickoutside, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var clickoutside_changes = {};
			if (changed.triggerButtonEl) clickoutside_changes.exclude = [ctx.triggerButtonEl];
			if (changed.$$scope || changed.pickerEl || changed.currentEmoji || changed.variantsVisible || changed.variants || changed.searchText || changed.emojiCategories || changed.recentEmojis) clickoutside_changes.$$scope = { changed, ctx };
			clickoutside.$set(clickoutside_changes);
		},

		i(local) {
			if (current) return;
			transition_in(clickoutside.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(clickoutside.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(clickoutside, detaching);
		}
	};
}

// (183:6) {:else}
function create_else_block$3(ctx) {
	var div, current;

	var tabs = new Tabs({
		props: {
		initialSelectedIndex: 1,
		$$slots: { default: [create_default_slot_1] },
		$$scope: { ctx }
	}
	});

	return {
		c() {
			div = element("div");
			tabs.$$.fragment.c();
			attr(div, "class", "svelte-emoji-picker__emoji-tabs svelte-d48g0m");
		},

		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(tabs, div, null);
			current = true;
		},

		p(changed, ctx) {
			var tabs_changes = {};
			if (changed.$$scope || changed.emojiCategories || changed.recentEmojis) tabs_changes.$$scope = { changed, ctx };
			tabs.$set(tabs_changes);
		},

		i(local) {
			if (current) return;
			transition_in(tabs.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(tabs.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			destroy_component(tabs);
		}
	};
}

// (181:6) {#if searchText}
function create_if_block_2(ctx) {
	var current;

	var emojisearchresults = new EmojiSearchResults({ props: { searchText: ctx.searchText } });
	emojisearchresults.$on("emojihover", ctx.showEmojiDetails);
	emojisearchresults.$on("emojiclick", ctx.onEmojiClick);

	return {
		c() {
			emojisearchresults.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(emojisearchresults, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emojisearchresults_changes = {};
			if (changed.searchText) emojisearchresults_changes.searchText = ctx.searchText;
			emojisearchresults.$set(emojisearchresults_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emojisearchresults.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emojisearchresults.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emojisearchresults, detaching);
		}
	};
}

// (187:14) <Tab>
function create_default_slot_6(ctx) {
	var current;

	var icon = new Icon({ props: { icon: faHistory } });

	return {
		c() {
			icon.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.faHistory) icon_changes.icon = faHistory;
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

// (189:16) <Tab>
function create_default_slot_5(ctx) {
	var current;

	var icon = new Icon({ props: { icon: ctx.categoryIcons[ctx.category] } });

	return {
		c() {
			icon.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.categoryIcons || changed.categoryOrder) icon_changes.icon = ctx.categoryIcons[ctx.category];
			icon.$set(icon_changes);
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

// (188:14) {#each categoryOrder as category}
function create_each_block_1(ctx) {
	var current;

	var tab = new Tab({
		props: {
		$$slots: { default: [create_default_slot_5] },
		$$scope: { ctx }
	}
	});

	return {
		c() {
			tab.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(tab, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var tab_changes = {};
			if (changed.$$scope) tab_changes.$$scope = { changed, ctx };
			tab.$set(tab_changes);
		},

		i(local) {
			if (current) return;
			transition_in(tab.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(tab.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(tab, detaching);
		}
	};
}

// (186:12) <TabList>
function create_default_slot_4(ctx) {
	var t, each_1_anchor, current;

	var tab = new Tab({
		props: {
		$$slots: { default: [create_default_slot_6] },
		$$scope: { ctx }
	}
	});

	var each_value_1 = ctx.categoryOrder;

	var each_blocks = [];

	for (var i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	return {
		c() {
			tab.$$.fragment.c();
			t = space();

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},

		m(target, anchor) {
			mount_component(tab, target, anchor);
			insert(target, t, anchor);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
			current = true;
		},

		p(changed, ctx) {
			var tab_changes = {};
			if (changed.$$scope) tab_changes.$$scope = { changed, ctx };
			tab.$set(tab_changes);

			if (changed.categoryIcons || changed.categoryOrder) {
				each_value_1 = ctx.categoryOrder;

				for (var i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();
				for (i = each_value_1.length; i < each_blocks.length; i += 1) out(i);
				check_outros();
			}
		},

		i(local) {
			if (current) return;
			transition_in(tab.$$.fragment, local);

			for (var i = 0; i < each_value_1.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o(local) {
			transition_out(tab.$$.fragment, local);

			each_blocks = each_blocks.filter(Boolean);
			for (let i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d(detaching) {
			destroy_component(tab, detaching);

			if (detaching) {
				detach(t);
			}

			destroy_each(each_blocks, detaching);

			if (detaching) {
				detach(each_1_anchor);
			}
		}
	};
}

// (193:12) <TabPanel>
function create_default_slot_3(ctx) {
	var current;

	var emojilist = new EmojiList({
		props: {
		name: "Recently Used",
		emojis: ctx.recentEmojis
	}
	});
	emojilist.$on("emojihover", ctx.showEmojiDetails);
	emojilist.$on("emojiclick", ctx.onEmojiClick);

	return {
		c() {
			emojilist.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(emojilist, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emojilist_changes = {};
			if (changed.recentEmojis) emojilist_changes.emojis = ctx.recentEmojis;
			emojilist.$set(emojilist_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emojilist.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emojilist.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emojilist, detaching);
		}
	};
}

// (198:14) <TabPanel>
function create_default_slot_2(ctx) {
	var t, current;

	var emojilist = new EmojiList({
		props: {
		name: ctx.category,
		emojis: ctx.emojiCategories[ctx.category]
	}
	});
	emojilist.$on("emojihover", ctx.showEmojiDetails);
	emojilist.$on("emojiclick", ctx.onEmojiClick);

	return {
		c() {
			emojilist.$$.fragment.c();
			t = space();
		},

		m(target, anchor) {
			mount_component(emojilist, target, anchor);
			insert(target, t, anchor);
			current = true;
		},

		p(changed, ctx) {
			var emojilist_changes = {};
			if (changed.categoryOrder) emojilist_changes.name = ctx.category;
			if (changed.emojiCategories || changed.categoryOrder) emojilist_changes.emojis = ctx.emojiCategories[ctx.category];
			emojilist.$set(emojilist_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emojilist.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emojilist.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(emojilist, detaching);

			if (detaching) {
				detach(t);
			}
		}
	};
}

// (197:12) {#each categoryOrder as category}
function create_each_block$2(ctx) {
	var current;

	var tabpanel = new TabPanel({
		props: {
		$$slots: { default: [create_default_slot_2] },
		$$scope: { ctx }
	}
	});

	return {
		c() {
			tabpanel.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(tabpanel, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var tabpanel_changes = {};
			if (changed.$$scope || changed.emojiCategories) tabpanel_changes.$$scope = { changed, ctx };
			tabpanel.$set(tabpanel_changes);
		},

		i(local) {
			if (current) return;
			transition_in(tabpanel.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(tabpanel.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(tabpanel, detaching);
		}
	};
}

// (185:10) <Tabs initialSelectedIndex={1}>
function create_default_slot_1(ctx) {
	var t0, t1, each_1_anchor, current;

	var tablist = new TabList({
		props: {
		$$slots: { default: [create_default_slot_4] },
		$$scope: { ctx }
	}
	});

	var tabpanel = new TabPanel({
		props: {
		$$slots: { default: [create_default_slot_3] },
		$$scope: { ctx }
	}
	});

	var each_value = ctx.categoryOrder;

	var each_blocks = [];

	for (var i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	return {
		c() {
			tablist.$$.fragment.c();
			t0 = space();
			tabpanel.$$.fragment.c();
			t1 = space();

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},

		m(target, anchor) {
			mount_component(tablist, target, anchor);
			insert(target, t0, anchor);
			mount_component(tabpanel, target, anchor);
			insert(target, t1, anchor);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
			current = true;
		},

		p(changed, ctx) {
			var tablist_changes = {};
			if (changed.$$scope) tablist_changes.$$scope = { changed, ctx };
			tablist.$set(tablist_changes);

			var tabpanel_changes = {};
			if (changed.$$scope || changed.recentEmojis) tabpanel_changes.$$scope = { changed, ctx };
			tabpanel.$set(tabpanel_changes);

			if (changed.categoryOrder || changed.emojiCategories) {
				each_value = ctx.categoryOrder;

				for (var i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$2(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(changed, child_ctx);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$2(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();
				for (i = each_value.length; i < each_blocks.length; i += 1) out(i);
				check_outros();
			}
		},

		i(local) {
			if (current) return;
			transition_in(tablist.$$.fragment, local);

			transition_in(tabpanel.$$.fragment, local);

			for (var i = 0; i < each_value.length; i += 1) transition_in(each_blocks[i]);

			current = true;
		},

		o(local) {
			transition_out(tablist.$$.fragment, local);
			transition_out(tabpanel.$$.fragment, local);

			each_blocks = each_blocks.filter(Boolean);
			for (let i = 0; i < each_blocks.length; i += 1) transition_out(each_blocks[i]);

			current = false;
		},

		d(detaching) {
			destroy_component(tablist, detaching);

			if (detaching) {
				detach(t0);
			}

			destroy_component(tabpanel, detaching);

			if (detaching) {
				detach(t1);
			}

			destroy_each(each_blocks, detaching);

			if (detaching) {
				detach(each_1_anchor);
			}
		}
	};
}

// (206:6) {#if variantsVisible}
function create_if_block_1(ctx) {
	var current;

	var variantpopup = new VariantPopup({ props: { variants: ctx.variants } });
	variantpopup.$on("emojiclick", ctx.onVariantClick);
	variantpopup.$on("close", ctx.hideVariants);

	return {
		c() {
			variantpopup.$$.fragment.c();
		},

		m(target, anchor) {
			mount_component(variantpopup, target, anchor);
			current = true;
		},

		p(changed, ctx) {
			var variantpopup_changes = {};
			if (changed.variants) variantpopup_changes.variants = ctx.variants;
			variantpopup.$set(variantpopup_changes);
		},

		i(local) {
			if (current) return;
			transition_in(variantpopup.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(variantpopup.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			destroy_component(variantpopup, detaching);
		}
	};
}

// (178:2) <ClickOutside on:clickoutside={hidePicker} exclude={[triggerButtonEl]}>
function create_default_slot(ctx) {
	var div, updating_searchText, t0, current_block_type_index, if_block0, t1, t2, current, dispose;

	function emojisearch_searchText_binding(value) {
		ctx.emojisearch_searchText_binding.call(null, value);
		updating_searchText = true;
		add_flush_callback(() => updating_searchText = false);
	}

	let emojisearch_props = {};
	if (ctx.searchText !== void 0) {
		emojisearch_props.searchText = ctx.searchText;
	}
	var emojisearch = new EmojiSearch({ props: emojisearch_props });

	binding_callbacks.push(() => bind(emojisearch, 'searchText', emojisearch_searchText_binding));

	var if_block_creators = [
		create_if_block_2,
		create_else_block$3
	];

	var if_blocks = [];

	function select_block_type(ctx) {
		if (ctx.searchText) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	var if_block1 = (ctx.variantsVisible) && create_if_block_1(ctx);

	var emojidetail = new EmojiDetail({ props: { emoji: ctx.currentEmoji } });

	return {
		c() {
			div = element("div");
			emojisearch.$$.fragment.c();
			t0 = space();
			if_block0.c();
			t1 = space();
			if (if_block1) if_block1.c();
			t2 = space();
			emojidetail.$$.fragment.c();
			attr(div, "class", "svelte-emoji-picker svelte-d48g0m");
			dispose = listen(div, "keydown", ctx.onKeyDown);
		},

		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(emojisearch, div, null);
			append(div, t0);
			if_blocks[current_block_type_index].m(div, null);
			append(div, t1);
			if (if_block1) if_block1.m(div, null);
			append(div, t2);
			mount_component(emojidetail, div, null);
			ctx.div_binding(div);
			current = true;
		},

		p(changed, ctx) {
			var emojisearch_changes = {};
			if (!updating_searchText && changed.searchText) {
				emojisearch_changes.searchText = ctx.searchText;
			}
			emojisearch.$set(emojisearch_changes);

			var previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);
			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(changed, ctx);
			} else {
				group_outros();
				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});
				check_outros();

				if_block0 = if_blocks[current_block_type_index];
				if (!if_block0) {
					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block0.c();
				}
				transition_in(if_block0, 1);
				if_block0.m(div, t1);
			}

			if (ctx.variantsVisible) {
				if (if_block1) {
					if_block1.p(changed, ctx);
					transition_in(if_block1, 1);
				} else {
					if_block1 = create_if_block_1(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div, t2);
				}
			} else if (if_block1) {
				group_outros();
				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});
				check_outros();
			}

			var emojidetail_changes = {};
			if (changed.currentEmoji) emojidetail_changes.emoji = ctx.currentEmoji;
			emojidetail.$set(emojidetail_changes);
		},

		i(local) {
			if (current) return;
			transition_in(emojisearch.$$.fragment, local);

			transition_in(if_block0);
			transition_in(if_block1);

			transition_in(emojidetail.$$.fragment, local);

			current = true;
		},

		o(local) {
			transition_out(emojisearch.$$.fragment, local);
			transition_out(if_block0);
			transition_out(if_block1);
			transition_out(emojidetail.$$.fragment, local);
			current = false;
		},

		d(detaching) {
			if (detaching) {
				detach(div);
			}

			destroy_component(emojisearch);

			if_blocks[current_block_type_index].d();
			if (if_block1) if_block1.d();

			destroy_component(emojidetail);

			ctx.div_binding(null);
			dispose();
		}
	};
}

function create_fragment$c(ctx) {
	var t0, button, t1, if_block_anchor, current, dispose;

	document.body.addEventListener("keydown", ctx.onKeyDown);

	var icon = new Icon({ props: { icon: ctx.smileIcon } });

	var if_block = (ctx.pickerVisible) && create_if_block$4(ctx);

	return {
		c() {
			t0 = space();
			button = element("button");
			icon.$$.fragment.c();
			t1 = space();
			if (if_block) if_block.c();
			if_block_anchor = empty();
			attr(button, "class", "svelte-emoji-picker__trigger svelte-d48g0m");
			dispose = listen(button, "click", ctx.togglePicker);
		},

		m(target, anchor) {
			insert(target, t0, anchor);
			insert(target, button, anchor);
			mount_component(icon, button, null);
			ctx.button_binding(button);
			insert(target, t1, anchor);
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},

		p(changed, ctx) {
			var icon_changes = {};
			if (changed.smileIcon) icon_changes.icon = ctx.smileIcon;
			icon.$set(icon_changes);

			if (ctx.pickerVisible) {
				if (if_block) {
					if_block.p(changed, ctx);
					transition_in(if_block, 1);
				} else {
					if_block = create_if_block$4(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();
				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});
				check_outros();
			}
		},

		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);

			transition_in(if_block);
			current = true;
		},

		o(local) {
			transition_out(icon.$$.fragment, local);
			transition_out(if_block);
			current = false;
		},

		d(detaching) {
			document.body.removeEventListener("keydown", ctx.onKeyDown);

			if (detaching) {
				detach(t0);
				detach(button);
			}

			destroy_component(icon);

			ctx.button_binding(null);

			if (detaching) {
				detach(t1);
			}

			if (if_block) if_block.d(detaching);

			if (detaching) {
				detach(if_block_anchor);
			}

			dispose();
		}
	};
}

function instance$c($$self, $$props, $$invalidate) {
	

  const smileIcon = faSmile;

  let { maxRecents = 50, autoClose = true } = $$props;

  let triggerButtonEl;
  let pickerEl;
  let popper;

  let variantsVisible = false;
  let pickerVisible = false;

  let variants;
  let currentEmoji;
  let searchText;
  let recentEmojis = JSON.parse(localStorage.getItem('svelte-emoji-picker-recent')) || [];

  const dispatch = createEventDispatcher();

  const emojiCategories = {};
  emojiData.forEach(emoji => {
    let categoryList = emojiCategories[emoji.category];
    if (!categoryList) {
      categoryList = emojiCategories[emoji.category] = []; $$invalidate('emojiCategories', emojiCategories);
    }

    categoryList.push(emoji);
  });

  const categoryOrder = [
    'Smileys & People',
    'Animals & Nature',
    'Food & Drink',
    'Activities',
    'Travel & Places',
    'Objects',
    'Symbols',
    'Flags'
  ];

  const categoryIcons = {
    'Smileys & People': faSmile,
    'Animals & Nature': faCat,
    'Food & Drink': faCoffee,
    'Activities': faFutbol,
    'Travel & Places': faBuilding,
    'Objects': faLightbulb,
    'Symbols': faMusic,
    'Flags': faFlag
  };

  function hidePicker(event) {
    $$invalidate('pickerVisible', pickerVisible = false);
    $$invalidate('searchText', searchText = '');
    popper.destroy();
  }

  async function togglePicker() {
    $$invalidate('pickerVisible', pickerVisible = !pickerVisible);

    if (pickerVisible) {
      await tick();
      popper = new Popper(triggerButtonEl, pickerEl, {
        placement: 'right'
      });
    } else {
      $$invalidate('searchText', searchText = '');
      popper.destroy();
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      hidePicker();
    }
  }

  function showEmojiDetails(event) {
    $$invalidate('currentEmoji', currentEmoji = event.detail);
  }

  function onEmojiClick(event) {
    if (event.detail.variants) {
      $$invalidate('variants', variants = event.detail.variants);
      $$invalidate('variantsVisible', variantsVisible = true);
    } else {
      dispatch('emoji', event.detail.emoji);
      saveRecent(event.detail);

      if (autoClose) {
        hidePicker();
      }
    }
  }

  function onVariantClick(event) {
    dispatch('emoji', event.detail.emoji);
    saveRecent(event.detail);
    hideVariants();

    if (autoClose) {
      hidePicker();
    }
  }

  function saveRecent(emoji) {
    $$invalidate('recentEmojis', recentEmojis = [emoji, ...recentEmojis.filter(recent => recent.key !== emoji.key)].slice(0, maxRecents));
    localStorage.setItem('svelte-emoji-picker-recent', JSON.stringify(recentEmojis));
  }

  function hideVariants() {
    // We have to defer the removal of the variants popup.
    // Otherwise, it gets removed before the click event on the body
    // happens, and the target will have a `null` parent, which
    // means it will not be excluded and the clickoutside event will fire.
    setTimeout(() => {
      $$invalidate('variantsVisible', variantsVisible = false);
    });
  }

	function button_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('triggerButtonEl', triggerButtonEl = $$value);
		});
	}

	function emojisearch_searchText_binding(value) {
		searchText = value;
		$$invalidate('searchText', searchText);
	}

	function div_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			$$invalidate('pickerEl', pickerEl = $$value);
		});
	}

	$$self.$set = $$props => {
		if ('maxRecents' in $$props) $$invalidate('maxRecents', maxRecents = $$props.maxRecents);
		if ('autoClose' in $$props) $$invalidate('autoClose', autoClose = $$props.autoClose);
	};

	return {
		smileIcon,
		maxRecents,
		autoClose,
		triggerButtonEl,
		pickerEl,
		variantsVisible,
		pickerVisible,
		variants,
		currentEmoji,
		searchText,
		recentEmojis,
		emojiCategories,
		categoryOrder,
		categoryIcons,
		hidePicker,
		togglePicker,
		onKeyDown,
		showEmojiDetails,
		onEmojiClick,
		onVariantClick,
		hideVariants,
		button_binding,
		emojisearch_searchText_binding,
		div_binding
	};
}

class Index$1 extends SvelteComponent {
	constructor(options) {
		super();
		if (!document.getElementById("svelte-d48g0m-style")) add_css$a();
		init(this, options, instance$c, create_fragment$c, safe_not_equal, ["maxRecents", "autoClose"]);
	}
}

export default Index$1;
