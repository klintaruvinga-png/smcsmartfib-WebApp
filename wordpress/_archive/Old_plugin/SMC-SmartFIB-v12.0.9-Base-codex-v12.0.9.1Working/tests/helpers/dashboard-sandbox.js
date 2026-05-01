'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function createStorage(initial) {
  const store = Object.assign({}, initial || {});
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? String(store[key]) : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    dump() {
      return Object.assign({}, store);
    }
  };
}

function createNode(id) {
  return {
    id: id || null,
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    hidden: false,
    disabled: false,
    className: '',
    children: [],
    attributes: {},
    classList: {
      add() {},
      remove() {},
      toggle() { return false; },
      contains() { return false; }
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {}
  };
}

function createFixedDate(isoString) {
  const RealDate = Date;
  const fixed = new RealDate(isoString);

  function FixedDate(...args) {
    if (!(this instanceof FixedDate)) {
      return new RealDate(...args).toString();
    }
    if (!args.length) {
      return new RealDate(fixed.getTime());
    }
    return new RealDate(...args);
  }

  FixedDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(FixedDate, RealDate);
  FixedDate.now = () => fixed.getTime();
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;

  return FixedDate;
}

function createDocument(nodes) {
  return {
    hidden: false,
    visibilityState: 'visible',
    body: createNode('body'),
    getElementById(id) {
      if (!nodes[id]) nodes[id] = createNode(id);
      return nodes[id];
    },
    createElement(tag) {
      return createNode(tag);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {}
  };
}

function createDashboardSandbox(options) {
  const opts = options || {};
  const nodes = {};
  const localStorage = createStorage(opts.localStorage);
  const sessionStorage = createStorage(opts.sessionStorage);
  const fetchCalls = [];
  const fetchImpl = typeof opts.fetch === 'function'
    ? opts.fetch
    : async function(url, init) {
        fetchCalls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => ''
        };
      };

  const sandbox = {
    console,
    Math,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Promise,
    Intl,
    URL,
    URLSearchParams,
    parseFloat,
    parseInt,
    isFinite,
    NaN,
    Date: createFixedDate(opts.fixedDate || '2024-06-04T13:30:00Z'),
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    performance: { now: () => 0 },
    navigator: { userAgent: 'node-test' },
    localStorage,
    sessionStorage,
    fetch: fetchImpl,
    XLSX: { utils: { sheet_to_json() { return []; } } },
    SNIPER: Object.assign({
      rest_url: 'https://example.test/wp-json/sniper/v1/',
      nonce: 'nonce',
      wp_base: 'https://example.test',
      user: { id: 1 },
      fib_timeframe: 'Weekly'
    }, opts.SNIPER || {}),
    wpApiSettings: { nonce: 'nonce' },
    location: { hash: '', href: 'https://example.test/dashboard' },
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
    __fetchCalls: fetchCalls
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = createDocument(nodes);

  const context = vm.createContext(sandbox);

  function loadScript(relativePath) {
    const scriptPath = path.resolve(REPO_ROOT, relativePath);
    const source = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(source, context, { filename: scriptPath });
    return context;
  }

  return {
    context,
    sandbox,
    nodes,
    fetchCalls,
    loadScript
  };
}

function bootstrapDataEngine(options) {
  const harness = createDashboardSandbox(options);
  harness.loadScript('sniper-dashboard-data.js');
  return harness;
}

function bootstrapCore(options) {
  const harness = bootstrapDataEngine(options);
  harness.loadScript('assets/js/sniper-dashboard-core.js');
  return harness;
}

function bootstrapPlanner(options) {
  const harness = createDashboardSandbox(options);
  harness.loadScript('assets/js/sniper-dashboard-planner.js');
  return harness;
}

module.exports = {
  bootstrapCore,
  bootstrapDataEngine,
  bootstrapPlanner,
  createDashboardSandbox
};
