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
  inferSchema: () => inferSchema,
  getPredicateEvaluator: () => getPredicateEvaluator,
  filter: () => filter,
  diff: () => diff,
  createM: () => createM,
  checkExamples: () => checkExamples,
  agentContract: () => agentContract,
  TimeoutError: () => TimeoutError,
  SchemaError: () => SchemaError,
  M: () => M,
  KEYWORD_SHAPES: () => KEYWORD_SHAPES,
  ENFORCED_KEYWORDS: () => ENFORCED_KEYWORDS,
  ENFORCED_FORMATS: () => ENFORCED_FORMATS,
  CONSTRAINT_DOMAINS: () => CONSTRAINT_DOMAINS
});
module.exports = __toCommonJS(exports_tosijs_schema);

// src/formats.ts
var RX_EMOJI_ATOM = "\\p{Extended_Pictographic}";
var FORMAT_VALIDATORS = {
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
var ENFORCED_FORMATS = new Set(Object.keys(FORMAT_VALIDATORS));

// src/schema.ts
var create = (s, optional = false) => ({
  schema: s,
  _type: null,
  _optional: optional,
  validate: (data, opts) => validate(data, s, opts),
  get optional() {
    const out = { ...s };
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      out.type = types.includes("null") ? types : [...types, "null"];
    }
    if (out.const !== undefined) {
      const constType = out.const === null ? "null" : typeof out.const;
      out.enum = [out.const, null];
      delete out.const;
      if (out.type === undefined && constType !== "null") {
        out.type = [constType, "null"];
      }
    }
    if (Array.isArray(out.enum) && !out.enum.includes(null)) {
      out.enum = [...out.enum, null];
    }
    if (out.type === undefined && out.enum === undefined && Array.isArray(out.anyOf) && !out.anyOf.some((branch) => branch === true || branch?.type === "null" || Array.isArray(branch?.type) && branch.type.includes("null"))) {
      out.anyOf = [...out.anyOf, { type: "null" }];
    }
    return create(out, true);
  },
  get open() {
    return create({ ...s, additionalProperties: true }, optional);
  },
  title: (t) => create({ ...s, title: t }, optional),
  describe: (d) => create({ ...s, description: d }, optional),
  default: (v) => create({ ...s, default: v }, optional),
  meta: (m) => create({ ...m, ...s, ...m }, optional),
  min: (v) => {
    const key = s.type === "string" ? "minLength" : s.type === "array" ? "minItems" : s.type === "object" ? "minProperties" : "minimum";
    return create({ ...s, [key]: v }, optional);
  },
  max: (v) => {
    const key = s.type === "string" ? "maxLength" : s.type === "array" ? "maxItems" : s.type === "object" ? "maxProperties" : "maximum";
    return create({ ...s, [key]: v }, optional);
  },
  pattern: (r) => create({ ...s, pattern: typeof r === "string" ? r : r.source }, optional),
  get email() {
    return create({ ...s, format: "email" }, optional);
  },
  get uuid() {
    return create({ ...s, format: "uuid" }, optional);
  },
  get ipv4() {
    return create({ ...s, format: "ipv4" }, optional);
  },
  get url() {
    return create({ ...s, format: "uri" }, optional);
  },
  get datetime() {
    return create({ ...s, format: "date-time" }, optional);
  },
  get emoji() {
    return create({ ...s, pattern: `^${RX_EMOJI_ATOM}+$`, format: "emoji" }, optional);
  },
  get int() {
    return create({ ...s, type: "integer" }, optional);
  },
  step: (v) => create({ ...s, multipleOf: v }, optional)
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
  object: (props, options) => {
    const properties = {};
    const required = [];
    for (const k in props) {
      properties[k] = props[k].schema;
      const p = properties[k];
      if (props[k]._optional !== true && (!Array.isArray(p.type) || !p.type.includes("null"))) {
        required.push(k);
      }
    }
    return create({
      type: "object",
      properties,
      required,
      additionalProperties: options?.additionalProperties === true
    });
  },
  record: (value) => {
    if (value == null) {
      throw new Error("s.record(valueSchema) requires a value schema — use s.record(s.any) for unconstrained values");
    }
    return create({
      type: "object",
      additionalProperties: value.schema
    });
  },
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
var hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var setKey = (o, k, v) => {
  if (k === "__proto__") {
    Object.defineProperty(o, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true
    });
  } else {
    o[k] = v;
  }
};
var STRIDE = 97;
var ENFORCED_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "const",
  "anyOf",
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "additionalProperties",
  "$predicate",
  "x-tjs-undefined"
]);
var objectKeywordsPresent = (s2) => s2.properties !== undefined || s2.required !== undefined || s2.additionalProperties !== undefined || s2.minProperties !== undefined || s2.maxProperties !== undefined;
var arrayKeywordsPresent = (s2) => s2.items !== undefined || s2.minItems !== undefined || s2.maxItems !== undefined;
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
    if (s2 === true)
      return true;
    if (s2 === false)
      return err("Schema forbids value");
    if (Array.isArray(s2.anyOf)) {
      let matched = false;
      for (const sub of s2.anyOf) {
        if (validate(v, sub, { strict: fullScan })) {
          matched = true;
          break;
        }
      }
      if (!matched)
        return err("Union mismatch");
    }
    if (s2.const !== undefined) {
      if (v !== s2.const)
        return err("Const mismatch");
    }
    if (Array.isArray(s2.enum) && v !== undefined && !s2.enum.includes(v)) {
      return err("Enum mismatch");
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
    const typeMatches = (ty) => ty === "integer" ? typeof v === "number" && Number.isInteger(v) : ty === "array" ? Array.isArray(v) : ty === "object" ? typeof v === "object" && !Array.isArray(v) : ty === "number" ? typeof v === "number" : typeof v === ty;
    const listed = Array.isArray(s2.type) ? s2.type.filter((e) => typeof e === "string" && e !== "null") : typeof s2.type === "string" ? [s2.type] : [];
    let t;
    if (listed.length > 0) {
      t = listed.find(typeMatches);
      if (t === undefined)
        return err(`Expected ${listed.join(" | ")}`);
    } else if (Array.isArray(s2.type) ? s2.type.includes("null") : s2.type === "null") {
      return err("Expected null");
    }
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
      if (s2.pattern) {
        try {
          if (!new RegExp(s2.pattern, s2.format === "emoji" ? "u" : "").test(v))
            return err("Pattern mismatch");
        } catch {
          return err("Invalid pattern");
        }
      }
      if (s2.format && FORMAT_VALIDATORS[s2.format] && !FORMAT_VALIDATORS[s2.format](v))
        return err("Format invalid");
    }
    if (t === "object" || !t && typeof v === "object" && !Array.isArray(v) && objectKeywordsPresent(s2)) {
      const checkMin = s2.minProperties !== undefined;
      const checkMax = fullScan && s2.maxProperties !== undefined;
      if (checkMin || checkMax) {
        let c = 0;
        for (const k in v)
          if (hasOwn(v, k))
            c++;
        if (checkMin && c < s2.minProperties)
          return err("Too few props");
        if (checkMax && c > s2.maxProperties)
          return err("Too many props");
      }
      if (s2.required) {
        for (const k of s2.required)
          if (!hasOwn(v, k))
            return err(`Missing ${k}`);
      }
      if (s2.additionalProperties === false) {
        for (const k in v) {
          if (!hasOwn(v, k))
            continue;
          if (s2.properties && hasOwn(s2.properties, k))
            continue;
          return err(`Unexpected ${k}`);
        }
      }
      if (s2.properties) {
        for (const k in s2.properties) {
          if (hasOwn(v, k)) {
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
          if (!hasOwn(v, k))
            continue;
          if (s2.properties && hasOwn(s2.properties, k))
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
    if (t === "array" || !t && Array.isArray(v) && arrayKeywordsPresent(s2)) {
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
  const filtered = filterData(data, schema, fullScan);
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
    let valid;
    try {
      valid = validate(filtered, schema, { onError: captureError, fullScan });
    } catch (e) {
      return new Error(`internal validation error: ${e.message}`);
    }
    if (!valid) {
      return new Error(`${errorPath}: ${errorMsg}`);
    }
  }
  return filtered;
}
function filterData(data, schema, fullScan = false) {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf) {
      const candidate = filterData(data, sub, fullScan);
      try {
        if (validate(candidate, sub, { strict: fullScan }))
          return candidate;
      } catch {}
    }
    return data;
  }
  const t = schema.type;
  const asObject = (t === "object" || !t && objectKeywordsPresent(schema)) && typeof data === "object" && !Array.isArray(data);
  const asArray = (t === "array" || !t && arrayKeywordsPresent(schema)) && Array.isArray(data);
  if (asObject && !schema.properties && schema.additionalProperties === false) {
    return {};
  }
  const apSchema = schema.additionalProperties && typeof schema.additionalProperties === "object" ? schema.additionalProperties : schema.additionalProperties === true ? {} : null;
  if (asObject && (schema.properties || apSchema)) {
    const result = {};
    if (schema.properties) {
      for (const key of Object.keys(schema.properties)) {
        if (hasOwn(data, key)) {
          setKey(result, key, filterData(data[key], schema.properties[key], fullScan));
        }
      }
    }
    if (apSchema) {
      for (const key of Object.keys(data)) {
        if (schema.properties && hasOwn(schema.properties, key))
          continue;
        setKey(result, key, filterData(data[key], apSchema, fullScan));
      }
    }
    return result;
  }
  if (asArray) {
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        return data.slice(0, schema.items.length).map((item, i) => filterData(item, schema.items[i], fullScan));
      } else {
        return data.map((item) => filterData(item, schema.items, fullScan));
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
var ANNOTATION_KEYWORDS = new Set([
  "title",
  "description",
  "default",
  "examples",
  "$counterexamples",
  "$inferred",
  "$schema",
  "$id",
  "$comment",
  "deprecated",
  "readOnly",
  "writeOnly"
]);
var enforcedChildren = (s2) => {
  const kids = [];
  if (s2.properties && typeof s2.properties === "object") {
    for (const k of Object.keys(s2.properties)) {
      kids.push([`properties.${k}`, s2.properties[k]]);
    }
  }
  if (s2.items !== undefined) {
    if (Array.isArray(s2.items)) {
      s2.items.forEach((item, i) => kids.push([`items.${i}`, item]));
    } else {
      kids.push(["items", s2.items]);
    }
  }
  if (s2.additionalProperties !== undefined && typeof s2.additionalProperties === "object") {
    kids.push(["additionalProperties", s2.additionalProperties]);
  }
  if (Array.isArray(s2.anyOf)) {
    s2.anyOf.forEach((sub, i) => kids.push([`anyOf.${i}`, sub]));
  }
  return kids;
};
var isNonPrimitive = (x) => x !== null && typeof x === "object";
var KEYWORD_SHAPES = [
  [
    "type",
    (v) => typeof v === "string" || Array.isArray(v) && v.every((x) => typeof x === "string"),
    "a string or array of strings"
  ],
  ["anyOf", Array.isArray, "an array"],
  [
    "required",
    (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
    "an array of strings"
  ],
  ["enum", Array.isArray, "an array"],
  [
    "properties",
    (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    "an object"
  ],
  ["items", (v) => v !== null && typeof v === "object", "a schema or array"],
  [
    "additionalProperties",
    (v) => typeof v === "boolean" || v !== null && typeof v === "object",
    "a boolean or schema"
  ],
  ["pattern", (v) => typeof v === "string", "a string"],
  ["format", (v) => typeof v === "string", "a string"],
  ["$predicate", (v) => typeof v === "string", "a string"],
  ...[
    "minimum",
    "maximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties"
  ].map((key) => [
    key,
    (v) => typeof v === "number",
    "a number"
  ])
];
var CONSTRAINT_DOMAINS = [
  ["minLength", ["string"]],
  ["maxLength", ["string"]],
  ["pattern", ["string"]],
  ["format", ["string"]],
  ["minimum", ["number", "integer"]],
  ["maximum", ["number", "integer"]],
  ["multipleOf", ["number", "integer"]],
  ["items", ["array"]],
  ["minItems", ["array"]],
  ["maxItems", ["array"]],
  ["properties", ["object"]],
  ["required", ["object"]],
  ["additionalProperties", ["object"]],
  ["minProperties", ["object"]],
  ["maxProperties", ["object"]]
];
var TYPE_DEPENDENT_KEYWORDS = [
  ...CONSTRAINT_DOMAINS.map(([key]) => key),
  "enum",
  "$predicate"
];
var unenforced = (s2, at = "root") => {
  if (s2 === true || s2 === false)
    return [];
  if (s2 == null || typeof s2 !== "object" || Array.isArray(s2)) {
    return [`${at} (not a schema)`];
  }
  const found = [];
  for (const key of Object.keys(s2)) {
    if (!ENFORCED_KEYWORDS.has(key) && !ANNOTATION_KEYWORDS.has(key) && !key.startsWith("x-")) {
      found.push(`${at}.${key}`);
    }
  }
  for (const [key, wellFormed, expected] of KEYWORD_SHAPES) {
    if (s2[key] !== undefined && !wellFormed(s2[key])) {
      found.push(`${at}.${key} (must be ${expected})`);
    }
  }
  if (s2.type === undefined && s2.const === undefined && s2.anyOf === undefined) {
    const dark = TYPE_DEPENDENT_KEYWORDS.filter((key) => s2[key] !== undefined);
    if (dark.length > 0) {
      found.push(`${at} (constraints without a type — null/undefined and mismatched ` + `primitives bypass ${dark.join("/")}; add an explicit type)`);
    }
  }
  const declaredTypes = typeof s2.type === "string" ? [s2.type] : Array.isArray(s2.type) && s2.type.every((x) => typeof x === "string") ? s2.type : null;
  if (declaredTypes) {
    for (const [key, domain] of CONSTRAINT_DOMAINS) {
      if (s2[key] !== undefined && !declaredTypes.some((entry) => domain.includes(entry))) {
        found.push(`${at}.${key} (never applies to type ${JSON.stringify(s2.type)})`);
      }
    }
  }
  if (typeof s2.format === "string" && !ENFORCED_FORMATS.has(s2.format)) {
    found.push(`${at}.format:'${s2.format}'`);
  }
  if (typeof s2.pattern === "string") {
    try {
      new RegExp(s2.pattern, s2.format === "emoji" ? "u" : "");
    } catch {
      found.push(`${at}.pattern (invalid regex)`);
    }
  }
  if (Array.isArray(s2.items) && s2.maxItems !== s2.items.length) {
    found.push(`${at}.items (tuple without maxItems: ${s2.items.length})`);
  }
  if (isNonPrimitive(s2.const)) {
    found.push(`${at}.const (non-primitive; === comparison never matches)`);
  }
  if (Array.isArray(s2.enum) && s2.enum.some(isNonPrimitive)) {
    found.push(`${at}.enum (non-primitive member never matches)`);
  }
  for (const [segment, kid] of enforcedChildren(s2)) {
    found.push(...unenforced(kid, `${at}.${segment}`));
  }
  return found;
};
var agentContract = (schemas, options) => {
  const strict = options?.strict ?? true;
  const plain = Object.create(null);
  const predicated = Object.create(null);
  for (const [root, schema] of Object.entries(schemas)) {
    const copy = structuredClone(toPlain(schema));
    const dead = unenforced(copy);
    if (dead.length > 0) {
      throw new Error(`agentContract('${root}'): schema uses keyword(s) validate does not enforce — ` + `${dead.join(", ")} — a gate must not fail open. Remove them, or express ` + `the constraint via $predicate.`);
    }
    plain[root] = copy;
    predicated[root] = hasPredicate(copy);
  }
  const roots = Object.keys(plain);
  const extendsPath = (child, parent) => child.startsWith(parent + ".") || child.startsWith(parent + "[") || parent === "";
  for (const a of roots) {
    for (const b of roots) {
      if (a !== b && extendsPath(a, b)) {
        throw new Error(`agentContract: root '${a}' is nested under root '${b}' — which ` + `root judges a deep write would be ambiguous; contract the outer root only`);
      }
    }
  }
  const affectedRoots = (path) => {
    const at = roots.find((root) => path === root || extendsPath(path, root));
    return at != null ? [at] : roots.filter((root) => extendsPath(root, path));
  };
  return {
    check(path, _value, proposal) {
      const at = path || "''";
      const affected = affectedRoots(path);
      if (affected.length === 0)
        return true;
      if (proposal == null) {
        return new Error(`contract breach at ${at} — write affecting contracted root ` + `'${affected[0]}' arrived without a proposal`);
      }
      const uncovered = affected.filter((root) => root !== proposal.root);
      if (uncovered.length > 0) {
        return new Error(`contract breach at ${at} — proposal root '${proposal.root}' ` + `does not cover contracted root(s) ` + uncovered.map((root) => `'${root}'`).join(", ") + (affected.length > 1 ? "; decompose the write below the shared ancestor" : ""));
      }
      const schema = plain[proposal.root];
      if (predicated[proposal.root] && getPredicateEvaluator() == null) {
        return new Error(`contract breach at ${at} — contracted root '${proposal.root}' carries ` + `a $predicate but no evaluator is registered; the gate would fail open`);
      }
      const reasons = [];
      let ok;
      try {
        ok = validate(proposal.proposed, schema, {
          strict,
          onError: (errAt, msg) => void reasons.push(`${errAt}: ${msg}`)
        });
      } catch (e) {
        return new Error(`contract violation at ${at} — internal validation error: ${e.message}`);
      }
      return ok ? true : new Error(`contract violation at ${at} — ${reasons.join("; ")}`);
    },
    describe: () => {
      const out = {};
      for (const root of roots) {
        Object.defineProperty(out, root, {
          value: structuredClone(plain[root]),
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      return out;
    }
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
        let ok;
        try {
          ok = validate(example, s2, {
            strict: true,
            onError: (p, m) => void reasons.push(`${p}: ${m}`)
          });
        } catch (e) {
          ok = false;
          reasons.push(`internal validation error: ${e.message}`);
        }
        if (!ok) {
          findings.push({
            schemaPath: at,
            kind: "example",
            index,
            problem: "rejected",
            reasons
          });
        } else if (getPredicateEvaluator() == null && hasPredicate(s2)) {
          findings.push({
            schemaPath: at,
            kind: "example",
            index,
            problem: "unverifiable"
          });
        }
      });
    }
    if (Array.isArray(s2.$counterexamples)) {
      s2.$counterexamples.forEach((counter, index) => {
        let passes;
        try {
          passes = validate(counter, s2, { strict: true });
        } catch {
          passes = false;
        }
        if (passes) {
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
// src/infer.ts
var ENUM_DEFAULTS = { maxDistinct: 12, minCoverage: 0.5 };
var SNIFF_FORMATS = ["date-time", "email", "uri"];
var scalarType = (v) => {
  if (v === null)
    return "null";
  if (typeof v === "number")
    return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
};
var uniqSorted = (xs) => Array.from(new Set(xs)).sort();
function unify(values, opts, path) {
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const hasNull = nonNull.length < values.length;
  if (nonNull.length === 0) {
    return values.some((v) => v === undefined) || values.length === 0 ? {} : { type: "null" };
  }
  const objects = nonNull.filter((v) => typeof v === "object" && v !== null && !Array.isArray(v));
  const arrays = nonNull.filter(Array.isArray);
  const scalars = nonNull.filter((v) => typeof v !== "object" || v === null);
  const kinds = [];
  if (objects.length)
    kinds.push(unifyObjects(objects, opts, path));
  if (arrays.length)
    kinds.push(unifyArrayValues(arrays, opts, path));
  if (scalars.length)
    kinds.push(scalarSchema(scalars, opts));
  if (kinds.length === 1)
    return withNull(kinds[0], hasNull);
  const branches = hasNull ? [...kinds, { type: "null" }] : kinds;
  return { anyOf: branches };
}
function scalarSchema(scalars, opts) {
  const types = uniqSorted(scalars.map(scalarType));
  const schema = {};
  if (types.length === 1)
    schema.type = types[0];
  else if (types.length > 1)
    schema.type = types;
  const enumValues = enumFor(scalars, types, opts);
  if (enumValues)
    schema.enum = enumValues;
  else
    applyFormat(schema, scalars, types, opts);
  return schema;
}
function withNull(schema, hasNull) {
  if (!hasNull)
    return schema;
  if (schema.type !== undefined) {
    const arr = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!arr.includes("null"))
      schema.type = uniqSorted([...arr, "null"]);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) {
    schema.enum = [...schema.enum, null];
  }
  return schema;
}
function unifyObjects(objs, opts, path) {
  const keys = uniqSorted(objs.flatMap((o) => Object.keys(o)));
  const properties = {};
  const required = [];
  for (const k of keys) {
    const present = objs.filter((o) => Object.prototype.hasOwnProperty.call(o, k));
    properties[k] = unify(present.map((o) => o[k]), opts, path ? `${path}.${k}` : k);
    if (present.length === objs.length)
      required.push(k);
  }
  return { type: "object", properties, required, additionalProperties: true };
}
function unifyArrayValues(arrays, opts, path) {
  let items = arrays.flat();
  const total = items.length;
  if (opts.sampleSize !== undefined && total > opts.sampleSize) {
    items = items.slice(0, opts.sampleSize);
    opts.onTruncate?.({ path: path || "(root)", sampled: items.length, total });
  }
  if (items.length === 0)
    return { type: "array" };
  return { type: "array", items: unify(items, opts, `${path}[]`) };
}
function enumFor(nonNull, types, opts) {
  if (!opts.enums || nonNull.length === 0)
    return null;
  const numeric = types.length > 0 && types.every((t) => t === "integer" || t === "number");
  const stringy = types.length === 1 && types[0] === "string";
  if (!numeric && !stringy)
    return null;
  const cfg = opts.enums === true ? ENUM_DEFAULTS : { ...ENUM_DEFAULTS, ...opts.enums };
  const distinct = Array.from(new Set(nonNull));
  const coverage = 1 - distinct.length / nonNull.length;
  if (distinct.length > cfg.maxDistinct || coverage < cfg.minCoverage)
    return null;
  return numeric ? distinct.slice().sort((a, b) => a - b) : distinct.slice().sort();
}
function applyFormat(schema, nonNull, types, opts) {
  if (!opts.formats || !(types.length === 1 && types[0] === "string"))
    return;
  const strings = nonNull;
  if (strings.length === 0)
    return;
  for (const fmt of SNIFF_FORMATS) {
    const test = FORMAT_VALIDATORS[fmt];
    if (strings.every(test)) {
      schema.format = fmt;
      return;
    }
  }
}
function inferSchema(sample, opts = {}) {
  const schema = unify([sample], opts, "");
  if (opts.marker !== false)
    schema.$inferred = true;
  return schema;
}
