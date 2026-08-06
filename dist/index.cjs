var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// index.ts
var exports_tosijs_schema = {};
__export(exports_tosijs_schema, {
  validate: () => validate,
  setPredicateEvaluator: () => setPredicateEvaluator,
  s: () => s,
  getPredicateEvaluator: () => getPredicateEvaluator,
  filter: () => filter,
  diff: () => diff,
  createM: () => createM,
  checkExamples: () => checkExamples,
  agentContract: () => agentContract,
  TimeoutError: () => TimeoutError,
  SchemaError: () => SchemaError,
  M: () => M,
  ENFORCED_FORMATS: () => ENFORCED_FORMATS
});
module.exports = __toCommonJS(exports_tosijs_schema);

// src/schema.ts
var RX_EMOJI_ATOM = "\\p{Extended_Pictographic}";
var create = (s) => ({
  schema: s,
  _type: null,
  validate: (data, opts) => validate(data, s, opts),
  get optional() {
    return create({
      ...s,
      type: Array.isArray(s.type) ? [...s.type, "null"] : [s.type, "null"]
    });
  },
  title: (t) => create({ ...s, title: t }),
  describe: (d) => create({ ...s, description: d }),
  default: (v) => create({ ...s, default: v }),
  meta: (m) => create({ ...m, ...s, ...m }),
  min: (v) => {
    const key = s.type === "string" ? "minLength" : s.type === "array" ? "minItems" : s.type === "object" ? "minProperties" : "minimum";
    return create({ ...s, [key]: v });
  },
  max: (v) => {
    const key = s.type === "string" ? "maxLength" : s.type === "array" ? "maxItems" : s.type === "object" ? "maxProperties" : "maximum";
    return create({ ...s, [key]: v });
  },
  pattern: (r) => create({ ...s, pattern: typeof r === "string" ? r : r.source }),
  get email() {
    return create({ ...s, format: "email" });
  },
  get uuid() {
    return create({ ...s, format: "uuid" });
  },
  get ipv4() {
    return create({ ...s, format: "ipv4" });
  },
  get url() {
    return create({ ...s, format: "uri" });
  },
  get datetime() {
    return create({ ...s, format: "date-time" });
  },
  get emoji() {
    return create({ ...s, pattern: `^${RX_EMOJI_ATOM}+$`, format: "emoji" });
  },
  get int() {
    return create({ ...s, type: "integer" });
  },
  step: (v) => create({ ...s, multipleOf: v })
});
var predicateEvaluator = null;
function setPredicateEvaluator(fn) {
  const prev = predicateEvaluator;
  predicateEvaluator = fn;
  return prev;
}
function getPredicateEvaluator() {
  return predicateEvaluator;
}
var methods = {
  get email() {
    return create({ type: "string", format: "email" });
  },
  get uuid() {
    return create({ type: "string", format: "uuid" });
  },
  get ipv4() {
    return create({ type: "string", format: "ipv4" });
  },
  get url() {
    return create({ type: "string", format: "uri" });
  },
  get datetime() {
    return create({ type: "string", format: "date-time" });
  },
  get emoji() {
    return create({
      type: "string",
      pattern: `^${RX_EMOJI_ATOM}+$`,
      format: "emoji"
    });
  },
  get null() {
    return create({ type: "null" });
  },
  get undefined() {
    return create({ type: "null", "x-tjs-undefined": true });
  },
  get any() {
    return create({});
  },
  pattern: (r) => create({
    type: "string",
    pattern: typeof r === "string" ? r : r.source
  }),
  union: (schemas) => create({ anyOf: schemas.map((s) => s.schema) }),
  enum: (vals) => create({ type: typeof vals[0], enum: vals }),
  const: (val) => create({ const: val }),
  array: (items) => create({ type: "array", items: items.schema }),
  tuple: (items) => create({
    type: "array",
    items: items.map((s) => s.schema),
    minItems: items.length,
    maxItems: items.length
  }),
  object: (props) => {
    const properties = {};
    const required = [];
    for (const k in props) {
      properties[k] = props[k].schema;
      if (!Array.isArray(properties[k].type) || !properties[k].type.includes("null")) {
        required.push(k);
      }
    }
    return create({
      type: "object",
      properties,
      required,
      additionalProperties: false
    });
  },
  record: (value) => create({
    type: "object",
    additionalProperties: value.schema
  }),
  infer: (value) => {
    if (value === null)
      return create({ type: "null" });
    if (value === undefined)
      return create({ type: "null", "x-tjs-undefined": true });
    const t = typeof value;
    if (t === "string")
      return create({ type: "string" });
    if (t === "number")
      return create({ type: Number.isInteger(value) ? "integer" : "number" });
    if (t === "boolean")
      return create({ type: "boolean" });
    if (Array.isArray(value)) {
      if (value.length === 0)
        return create({ type: "array" });
      return create({ type: "array", items: methods.infer(value[0]).schema });
    }
    if (t === "object") {
      const properties = {};
      const required = [];
      for (const k in value) {
        properties[k] = methods.infer(value[k]).schema;
        required.push(k);
      }
      return create({ type: "object", properties, required, additionalProperties: false });
    }
    return create({});
  }
};
var s = new Proxy(methods, {
  get(target, prop) {
    if (prop in target)
      return target[prop];
    if (prop === "string" || prop === "number" || prop === "boolean" || prop === "integer") {
      const schema = create({ type: prop });
      target[prop] = schema;
      return schema;
    }
    return;
  }
});
var STRIDE = 97;
var FMT = {
  email: (v) => /^\S+@\S+\.\S+$/.test(v),
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  ipv4: (v) => /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v),
  "date-time": (v) => !isNaN(Date.parse(v)),
  emoji: (v) => new RegExp(RX_EMOJI_ATOM, "u").test(v)
};
var ENFORCED_FORMATS = new Set(Object.keys(FMT));
function validate(val, builderOrSchema, opts) {
  const schema = builderOrSchema?.schema || builderOrSchema;
  const onError = typeof opts === "function" ? opts : opts?.onError;
  const fullScan = typeof opts === "object" ? opts?.strict ?? opts?.fullScan ?? false : false;
  const path = [];
  const err = (msg) => {
    if (onError)
      onError(path.join(".") || "root", msg);
    return false;
  };
  const walk = (v, s2) => {
    if (s2.anyOf) {
      for (const sub of s2.anyOf) {
        if (validate(v, sub, { strict: fullScan }))
          return true;
      }
      return err("Union mismatch");
    }
    if (s2.const !== undefined) {
      return v === s2.const || err("Const mismatch");
    }
    if (v === null) {
      const expectsNull = s2.type === "null" && !s2["x-tjs-undefined"];
      const typeIncludesNull = Array.isArray(s2.type) && s2.type.includes("null");
      return expectsNull || typeIncludesNull || !s2.type || err("Expected value, got null");
    }
    if (v === undefined) {
      const expectsUndefined = s2.type === "null" && s2["x-tjs-undefined"];
      const typeIncludesNull = Array.isArray(s2.type) && s2.type.includes("null");
      return expectsUndefined || typeIncludesNull || !s2.type || err("Expected value, got undefined");
    }
    const t = Array.isArray(s2.type) ? s2.type[0] : s2.type;
    if (s2.enum && !s2.enum.includes(v))
      return err("Enum mismatch");
    if (t === "integer") {
      if (typeof v !== "number" || !Number.isInteger(v))
        return err("Expected integer");
    } else if (t === "array") {
      if (!Array.isArray(v))
        return err("Expected array");
    } else if (t === "object") {
      if (typeof v !== "object" || Array.isArray(v))
        return err("Expected object");
    } else if (t && typeof v !== t)
      return err(`Expected ${t}`);
    if (s2.$predicate && predicateEvaluator) {
      if (!predicateEvaluator(s2.$predicate, v))
        return err("Predicate mismatch");
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        return err("Expected finite number");
      if (s2.minimum !== undefined && v < s2.minimum)
        return err("Value < min");
      if (s2.maximum !== undefined && v > s2.maximum)
        return err("Value > max");
      if (s2.multipleOf !== undefined) {
        const remainder = Math.abs(v % s2.multipleOf);
        const tolerance = 0.0000000001;
        if (remainder > tolerance && Math.abs(remainder - Math.abs(s2.multipleOf)) > tolerance)
          return err("Value not step");
      }
    }
    if (typeof v === "string") {
      if (s2.minLength !== undefined && v.length < s2.minLength)
        return err("Len < min");
      if (s2.maxLength !== undefined && v.length > s2.maxLength)
        return err("Len > max");
      if (s2.pattern && !new RegExp(s2.pattern, s2.format === "emoji" ? "u" : "").test(v))
        return err("Pattern mismatch");
      if (s2.format && FMT[s2.format] && !FMT[s2.format](v))
        return err("Format invalid");
    }
    const isPlainObject = typeof v === "object" && !Array.isArray(v);
    const objectKeywords = s2.properties !== undefined || s2.required !== undefined || s2.additionalProperties !== undefined || s2.minProperties !== undefined || s2.maxProperties !== undefined;
    if (t === "object" || !t && isPlainObject && objectKeywords) {
      const checkMin = s2.minProperties !== undefined;
      const checkMax = fullScan && s2.maxProperties !== undefined;
      if (checkMin || checkMax) {
        let c = 0;
        for (const k in v)
          if (Object.prototype.hasOwnProperty.call(v, k))
            c++;
        if (checkMin && c < s2.minProperties)
          return err("Too few props");
        if (checkMax && c > s2.maxProperties)
          return err("Too many props");
      }
      if (s2.required) {
        for (const k of s2.required)
          if (!(k in v))
            return err(`Missing ${k}`);
      }
      if (s2.additionalProperties === false) {
        for (const k in v) {
          if (!Object.prototype.hasOwnProperty.call(v, k))
            continue;
          if (s2.properties && k in s2.properties)
            continue;
          return err(`Unexpected ${k}`);
        }
      }
      if (s2.properties) {
        for (const k in s2.properties) {
          if (k in v) {
            path.push(k);
            const ok = walk(v[k], s2.properties[k]);
            path.pop();
            if (!ok)
              return false;
          }
        }
      }
      if (s2.additionalProperties) {
        const keys = [];
        for (const k in v) {
          if (s2.properties && k in s2.properties)
            continue;
          keys.push(k);
        }
        const len = keys.length;
        const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE);
        for (let i = 0;i < len; i += step) {
          const idx = step > 1 && i > len - 1 - step ? len - 1 : i;
          const k = keys[idx];
          path.push(k);
          const ok = walk(v[k], s2.additionalProperties);
          path.pop();
          if (!ok)
            return false;
          if (idx === len - 1)
            break;
        }
      }
      return true;
    }
    const arrayKeywords = s2.items !== undefined || s2.minItems !== undefined || s2.maxItems !== undefined;
    if (t === "array" || !t && Array.isArray(v) && arrayKeywords) {
      const len = v.length;
      if (s2.minItems !== undefined && len < s2.minItems)
        return err("Array too short");
      if (s2.maxItems !== undefined && len > s2.maxItems)
        return err("Array too long");
      if (s2.items === undefined)
        return true;
      if (Array.isArray(s2.items)) {
        for (let i = 0;i < s2.items.length; i++) {
          path.push(String(i));
          if (!walk(v[i], s2.items[i])) {
            path.pop();
            return false;
          }
          path.pop();
        }
        return true;
      }
      const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE);
      for (let i = 0;i < len; i += step) {
        const idx = step > 1 && i > len - 1 - step ? len - 1 : i;
        path.push(String(idx));
        const ok = walk(v[idx], s2.items);
        path.pop();
        if (!ok)
          return false;
        if (idx === len - 1)
          break;
      }
      return true;
    }
    return true;
  };
  return walk(val, schema);
}
function filter(data, builderOrSchema, opts) {
  const schema = builderOrSchema?.schema || builderOrSchema;
  const onError = typeof opts === "function" ? opts : opts?.onError;
  const fullScan = typeof opts === "object" ? opts?.strict ?? opts?.fullScan ?? false : false;
  const skipValidation = typeof opts === "object" ? opts?.skipValidation : false;
  const filtered = filterData(data, schema);
  if (!skipValidation) {
    let errorPath = "";
    let errorMsg = "";
    const captureError = (path, msg) => {
      if (!errorPath) {
        errorPath = path;
        errorMsg = msg;
      }
      if (onError)
        onError(path, msg);
    };
    const valid = validate(filtered, schema, { onError: captureError, fullScan });
    if (!valid) {
      return new Error(`${errorPath}: ${errorMsg}`);
    }
  }
  return filtered;
}
function filterData(data, schema) {
  if (data === null || data === undefined) {
    return data;
  }
  if (schema.anyOf) {
    for (const sub of schema.anyOf) {
      const candidate = filterData(data, sub);
      if (validate(candidate, sub))
        return candidate;
    }
    return data;
  }
  const t = schema.type;
  if (t === "object" && schema.properties && typeof data === "object" && !Array.isArray(data)) {
    const result = {};
    for (const key of Object.keys(schema.properties)) {
      if (key in data) {
        result[key] = filterData(data[key], schema.properties[key]);
      }
    }
    return result;
  }
  if (t === "array" && Array.isArray(data)) {
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        return data.slice(0, schema.items.length).map((item, i) => filterData(item, schema.items[i]));
      } else {
        return data.map((item) => filterData(item, schema.items));
      }
    }
    return data;
  }
  return data;
}
function diff(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b))
    return null;
  if (a.anyOf || b.anyOf) {
    if (JSON.stringify(a.anyOf) !== JSON.stringify(b.anyOf))
      return { error: "Union mismatch", from: a.anyOf, to: b.anyOf };
    return null;
  }
  if (a.type !== b.type)
    return { error: `Type mismatch: ${a.type} vs ${b.type}` };
  if (a.type === "object") {
    const d2 = {};
    const keys = new Set([
      ...Object.keys(a.properties || {}),
      ...Object.keys(b.properties || {})
    ]);
    let has2 = false;
    keys.forEach((k) => {
      const pA = a.properties?.[k], pB = b.properties?.[k];
      if (!pA) {
        d2[k] = { error: "Added in B" };
        has2 = true;
      } else if (!pB) {
        d2[k] = { error: "Removed in B" };
        has2 = true;
      } else {
        const sub = diff(pA, pB);
        if (sub) {
          d2[k] = sub;
          has2 = true;
        }
      }
    });
    ["minProperties", "maxProperties"].forEach((k) => {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        d2[k] = { from: a[k], to: b[k] };
        has2 = true;
      }
    });
    return has2 ? d2 : null;
  }
  if (a.type === "array") {
    if (Array.isArray(a.items) && Array.isArray(b.items)) {
      if (a.items.length !== b.items.length)
        return { error: "Tuple length mismatch" };
      const d2 = {};
      let has2 = false;
      for (let i = 0;i < a.items.length; i++) {
        const sub = diff(a.items[i], b.items[i]);
        if (sub) {
          d2[i] = sub;
          has2 = true;
        }
      }
      return has2 ? { items: d2 } : null;
    }
    if (!Array.isArray(a.items) && !Array.isArray(b.items)) {
      const d2 = diff(a.items, b.items);
      return d2 ? { items: d2 } : null;
    }
    return { error: "Array type mismatch (Tuple vs List)" };
  }
  const d = {};
  let has = false;
  [
    "minimum",
    "maximum",
    "minLength",
    "pattern",
    "format",
    "enum",
    "const",
    "title",
    "description",
    "default"
  ].forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      d[k] = { from: a[k], to: b[k] };
      has = true;
    }
  });
  return has ? d : null;
}
// src/monad.ts
class SchemaError extends Error {
  kind;
  functionName;
  violations;
  constructor(kind, functionName, violations = []) {
    super(`${kind} validation failed for '${functionName}'`);
    this.kind = kind;
    this.functionName = functionName;
    this.violations = violations;
    this.name = "SchemaError";
  }
}

class TimeoutError extends Error {
  functionName;
  ms;
  constructor(functionName, ms) {
    super(`Function '${functionName}' timed out after ${ms}ms`);
    this.functionName = functionName;
    this.ms = ms;
    this.name = "TimeoutError";
  }
}

class M {
  registry;
  constructor(registry) {
    this.registry = registry;
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target.registry) {
          return (input) => target.start(prop, input);
        }
        return;
      }
    });
  }
  static func(inputSchema, outputSchema, impl, timeoutMs = 5000) {
    const wrapper = async (data) => {
      const validIn = validate(data, inputSchema.schema, { fullScan: true });
      if (!validIn) {
        throw new SchemaError("Input", "Anonymous", ["Input schema mismatch"]);
      }
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError("Anonymous", timeoutMs));
        }, timeoutMs);
      });
      let result;
      try {
        result = await Promise.race([
          Promise.resolve().then(() => impl(data)),
          timeoutPromise
        ]);
      } finally {
        clearTimeout(timer);
      }
      const validOut = validate(result, outputSchema.schema, { fullScan: true });
      if (!validOut) {
        throw new SchemaError("Output", "Anonymous", ["Output schema mismatch"]);
      }
      return result;
    };
    wrapper.input = inputSchema;
    wrapper.output = outputSchema;
    wrapper.impl = impl;
    wrapper._isGuarded = true;
    return wrapper;
  }
  start(fnName, input) {
    const fn = this.registry[fnName];
    const promise = (async () => {
      if (!fn) {
        throw new Error(`Function '${fnName}' not found in registry`);
      }
      try {
        return await fn(input);
      } catch (err) {
        this.enrichError(err, fnName);
        throw err;
      }
    })();
    return this.createChain(promise, this.registry);
  }
  createChain(currentPromise, registry) {
    const chainHandler = {
      get: (_, prop) => {
        if (prop === "result") {
          return () => currentPromise;
        }
        if (prop in registry) {
          return () => {
            const nextPromise = currentPromise.then(async (currentVal) => {
              const fn = registry[prop];
              if (!fn) {
                throw new Error(`Function '${prop}' not found in registry`);
              }
              try {
                return await fn(currentVal);
              } catch (err) {
                this.enrichError(err, prop);
                throw err;
              }
            });
            return this.createChain(nextPromise, registry);
          };
        }
        return;
      }
    };
    return new Proxy({}, chainHandler);
  }
  enrichError(err, fnName) {
    if (err instanceof SchemaError && err.functionName === "Anonymous") {
      err.functionName = fnName;
      err.message = `${err.kind} validation failed for '${fnName}'`;
    }
    if (err instanceof TimeoutError && err.functionName === "Anonymous") {
      err.functionName = fnName;
      err.message = `Function '${fnName}' timed out after ${err.ms}ms`;
    }
  }
}
var createM = (r) => {
  return new M(r);
};
// src/contract.ts
var toPlain = (schema) => schema?.schema ?? schema;
var UNENFORCED_KEYWORDS = [
  "allOf",
  "oneOf",
  "not",
  "$ref",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "patternProperties",
  "propertyNames",
  "unevaluatedProperties",
  "unevaluatedItems",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "prefixItems"
];
var unenforced = (s2, at = "root") => {
  if (s2 == null || typeof s2 !== "object")
    return [];
  const found = [];
  for (const key of UNENFORCED_KEYWORDS) {
    if (s2[key] !== undefined)
      found.push(`${at}.${key}`);
  }
  if (typeof s2.format === "string" && !ENFORCED_FORMATS.has(s2.format)) {
    found.push(`${at}.format:'${s2.format}'`);
  }
  for (const [segment, kid] of subschemas(s2)) {
    found.push(...unenforced(kid, `${at}.${segment}`));
  }
  return found;
};
var agentContract = (schemas, options) => {
  const strict = options?.strict ?? true;
  const plain = {};
  for (const [root, schema] of Object.entries(schemas)) {
    const copy = structuredClone(toPlain(schema));
    const dead = unenforced(copy);
    if (dead.length > 0) {
      throw new Error(`agentContract('${root}'): schema uses keyword(s) validate does not enforce — ` + `${dead.join(", ")} — a gate must not fail open. Remove them, or express ` + `the constraint via $predicate.`);
    }
    plain[root] = copy;
  }
  const roots = Object.keys(plain);
  const contractedRoot = (path) => roots.find((root) => path === root || path.startsWith(root + ".") || path.startsWith(root + "["));
  const ancestorOfContracted = (path) => roots.find((root) => root.startsWith(path + ".") || root.startsWith(path + "["));
  return {
    check(path, _value, proposal) {
      const rootOfPath = contractedRoot(path);
      if (proposal == null) {
        const breached = rootOfPath ?? ancestorOfContracted(path);
        return breached == null ? true : new Error(`contract breach at ${path} — write affecting contracted root ` + `'${breached}' arrived without a proposal`);
      }
      if (rootOfPath != null && proposal.root !== rootOfPath) {
        return new Error(`contract breach at ${path} — proposal root '${proposal.root}' does ` + `not match contracted root '${rootOfPath}'`);
      }
      const schema = plain[proposal.root];
      if (schema == null) {
        const breached = rootOfPath ?? ancestorOfContracted(path);
        return breached == null ? true : new Error(`contract breach at ${path} — proposal root '${proposal.root}' is ` + `not contracted, but the write affects contracted root '${breached}'`);
      }
      const reasons = [];
      const ok = validate(proposal.proposed, schema, {
        strict,
        onError: (at, msg) => void reasons.push(`${at}: ${msg}`)
      });
      return ok ? true : new Error(`contract violation at ${path} — ${reasons.join("; ")}`);
    },
    describe: () => structuredClone(plain)
  };
};
var subschemas = (s2) => {
  if (s2 == null || typeof s2 !== "object")
    return [];
  const kids = [];
  if (s2.properties) {
    for (const k of Object.keys(s2.properties)) {
      kids.push([`properties.${k}`, s2.properties[k]]);
    }
  }
  if (s2.items) {
    if (Array.isArray(s2.items)) {
      s2.items.forEach((item, i) => kids.push([`items.${i}`, item]));
    } else {
      kids.push(["items", s2.items]);
    }
  }
  if (Array.isArray(s2.prefixItems)) {
    s2.prefixItems.forEach((item, i) => kids.push([`prefixItems.${i}`, item]));
  }
  if (s2.additionalProperties && typeof s2.additionalProperties === "object") {
    kids.push(["additionalProperties", s2.additionalProperties]);
  }
  for (const key of ["anyOf", "allOf", "oneOf"]) {
    if (Array.isArray(s2[key])) {
      s2[key].forEach((sub, i) => kids.push([`${key}.${i}`, sub]));
    }
  }
  if (s2.not)
    kids.push(["not", s2.not]);
  if (s2.$defs) {
    for (const k of Object.keys(s2.$defs)) {
      kids.push([`$defs.${k}`, s2.$defs[k]]);
    }
  }
  return kids;
};
var hasPredicate = (s2) => s2 != null && typeof s2 === "object" && (typeof s2.$predicate === "string" || subschemas(s2).some(([, kid]) => hasPredicate(kid)));
function checkExamples(schemaOrBuilder) {
  const findings = [];
  const visit = (s2, at) => {
    if (s2 == null || typeof s2 !== "object")
      return;
    if (Array.isArray(s2.examples)) {
      s2.examples.forEach((example, index) => {
        const reasons = [];
        const ok = validate(example, s2, {
          strict: true,
          onError: (p, m) => void reasons.push(`${p}: ${m}`)
        });
        if (!ok) {
          findings.push({
            schemaPath: at,
            kind: "example",
            index,
            problem: "rejected",
            reasons
          });
        }
      });
    }
    if (Array.isArray(s2.$counterexamples)) {
      s2.$counterexamples.forEach((counter, index) => {
        if (validate(counter, s2, { strict: true })) {
          const unverifiable = getPredicateEvaluator() == null && hasPredicate(s2);
          findings.push({
            schemaPath: at,
            kind: "counterexample",
            index,
            problem: unverifiable ? "unverifiable" : "accepted"
          });
        }
      });
    }
    for (const [segment, kid] of subschemas(s2)) {
      visit(kid, `${at}.${segment}`);
    }
  };
  visit(toPlain(schemaOrBuilder), "root");
  return findings;
}
