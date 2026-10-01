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
  AMBIGUOUS: () => AMBIGUOUS,
  AMBIGUOUS_MESSAGE: () => AMBIGUOUS_MESSAGE,
  BUILDER: () => BUILDER,
  CONSTRAINT_DOMAINS: () => CONSTRAINT_DOMAINS,
  ENFORCED_FORMATS: () => ENFORCED_FORMATS,
  ENFORCED_KEYWORDS: () => ENFORCED_KEYWORDS,
  KEYWORD_SHAPES: () => KEYWORD_SHAPES,
  M: () => M,
  SchemaError: () => SchemaError,
  TimeoutError: () => TimeoutError,
  agentContract: () => agentContract,
  checkExamples: () => checkExamples,
  createM: () => createM,
  diff: () => diff,
  enforcedSubschemas: () => enforcedSubschemas,
  filter: () => filter,
  getPredicateEvaluator: () => getPredicateEvaluator,
  inferSchema: () => inferSchema,
  isBuilder: () => isBuilder,
  s: () => s,
  setPredicateEvaluator: () => setPredicateEvaluator,
  setWarnings: () => setWarnings,
  unenforcedKeywords: () => unenforcedKeywords,
  unwrap: () => unwrap,
  validate: () => validate,
  validateResolved: () => validateResolved
});
module.exports = __toCommonJS(exports_tosijs_schema);

// src/formats.ts
var RX_EMOJI_ATOM = "\\p{Extended_Pictographic}";
var RX_FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var isFullDate = (v) => {
  const m = RX_FULL_DATE.exec(v);
  if (!m)
    return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1)
    return false;
  const max = mo === 2 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : DAYS_IN_MONTH[mo - 1];
  return d <= max;
};
var RX_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
var FORMAT_VALIDATORS = {
  email: (v) => {
    if (/\s/.test(v))
      return false;
    const at = v.indexOf("@", 1);
    if (at === -1)
      return false;
    const dot = v.indexOf(".", at + 2);
    return dot !== -1 && dot < v.length - 1;
  },
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
  date: isFullDate,
  "date-time": (v) => {
    const m = RX_DATE_TIME.exec(v);
    if (!m || !isFullDate(m[1]))
      return false;
    const hh = +m[2], mm = +m[3], ss = +m[4];
    if (hh > 23 || mm > 59)
      return false;
    return ss <= 59 || ss === 60 && hh === 23 && mm === 59;
  },
  emoji: (v) => new RegExp(RX_EMOJI_ATOM, "u").test(v)
};
var ENFORCED_FORMATS = new Set(Object.keys(FORMAT_VALIDATORS));
var PATTERN_CACHE = new Map;
var PATTERN_CACHE_MAX = 500;
var compilePattern = (pattern, emoji) => {
  const flags = emoji ? "u" : "";
  const key = flags + "\x00" + pattern;
  let re = PATTERN_CACHE.get(key);
  if (re === undefined) {
    re = new RegExp(pattern, flags);
    if (PATTERN_CACHE.size >= PATTERN_CACHE_MAX)
      PATTERN_CACHE.clear();
    PATTERN_CACHE.set(key, re);
  }
  return re;
};

// src/schema.ts
var BUILDER = Symbol.for("tosijs-schema.builder");
var isBuilder = (x) => x != null && typeof x === "object" && (x[BUILDER] === true || typeof x.validate === "function") && ("schema" in x);
var create = (s, optional = false) => ({
  [BUILDER]: true,
  schema: s,
  _type: null,
  _optional: optional,
  validate: (data, opts) => validateResolved(data, s, opts),
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
  get date() {
    return create({ ...s, format: "date" }, optional);
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
var isArray = (x) => {
  try {
    return Array.isArray(x);
  } catch {
    return false;
  }
};
var assertBuilder = (x, where) => {
  let ok = false;
  let got = "a plain schema";
  try {
    ok = isBuilder(x);
    if (!ok)
      got = Array.isArray(x) ? "an array" : typeof x === "object" && x ? got : String(x);
  } catch {}
  if (!ok)
    throw new TypeError(`${where}: expected a builder like s.string, not ${got}`);
};
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
  get date() {
    return create({ type: "string", format: "date" });
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
  union: (schemas) => {
    if (!isArray(schemas))
      throw new TypeError("s.union expects an array of builders: s.union([s.string, s.number])");
    schemas.forEach((b, i) => assertBuilder(b, `s.union: schemas[${i}]`));
    return create({ anyOf: schemas.map((s) => s.schema) });
  },
  enum: (vals) => create({ type: typeof vals[0], enum: vals }),
  const: (val) => create({ const: val }),
  array: (items) => {
    assertBuilder(items, "s.array(items)");
    return create({ type: "array", items: items.schema });
  },
  tuple: (items) => {
    if (!isArray(items))
      throw new TypeError("s.tuple expects an array of builders: s.tuple([s.string, s.number])");
    items.forEach((b, i) => assertBuilder(b, `s.tuple: items[${i}]`));
    return create({
      type: "array",
      items: items.map((s) => s.schema),
      minItems: items.length,
      maxItems: items.length
    });
  },
  object: (props, options) => {
    const properties = {};
    const required = [];
    for (const k in props) {
      assertBuilder(props[k], `s.object: property ${JSON.stringify(k)}`);
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
    assertBuilder(value, "s.record(valueSchema)");
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
var ownKeys = (o) => Object.getOwnPropertyNames(o);
var UNREADABLE = Symbol("unreadable");
var readProp = (o, k) => {
  try {
    return o[k];
  } catch {
    return UNREADABLE;
  }
};
var AMBIGUOUS = Symbol("tosijs-schema.ambiguous");
var AMBIGUOUS_MESSAGE = "ambiguous: has a `schema` key but is not a builder — pass the schema itself (e.g. envelope.schema)";
var unwrap = (x) => {
  if (x == null || typeof x !== "object")
    return x;
  try {
    if (isBuilder(x))
      return x.schema;
    return "schema" in x ? AMBIGUOUS : x;
  } catch {
    return AMBIGUOUS;
  }
};
var hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var warningsEnabled = true;
var warnedOneOfCost = false;
function setWarnings(on) {
  warningsEnabled = on;
  if (on)
    warnedOneOfCost = false;
}
var warnExpensive = () => {
  if (!warningsEnabled || warnedOneOfCost)
    return;
  warnedOneOfCost = true;
  console.warn("[tosijs-schema] `oneOf` is validated by trying every branch (no short-circuit, unlike `anyOf`) — for a discriminated union, `anyOf` is cheaper. Silence with setWarnings(false). This warns once per process.");
};
var matchesType = (v, ty) => ty === "integer" ? typeof v === "number" && Number.isInteger(v) : ty === "array" ? Array.isArray(v) : ty === "object" ? typeof v === "object" && !Array.isArray(v) : ty === "number" ? typeof v === "number" : typeof v === ty;
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
  "oneOf",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
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
var enforcedSubschemas = (s) => {
  const kids = [];
  if (s == null || typeof s !== "object")
    return kids;
  if (s.properties && typeof s.properties === "object") {
    for (const k of Object.keys(s.properties))
      kids.push([`properties.${k}`, s.properties[k]]);
  }
  if (s.items !== undefined) {
    if (Array.isArray(s.items))
      s.items.forEach((item, i) => kids.push([`items.${i}`, item]));
    else
      kids.push(["items", s.items]);
  }
  if (s.additionalProperties !== undefined && typeof s.additionalProperties === "object") {
    kids.push(["additionalProperties", s.additionalProperties]);
  }
  for (const key of ["anyOf", "oneOf"]) {
    if (Array.isArray(s[key]))
      s[key].forEach((sub, i) => kids.push([`${key}.${i}`, sub]));
  }
  return kids;
};
var objectKeywordsPresent = (s) => s.properties !== undefined || s.required !== undefined || s.additionalProperties !== undefined || s.minProperties !== undefined || s.maxProperties !== undefined;
var arrayKeywordsPresent = (s) => s.items !== undefined || s.minItems !== undefined || s.maxItems !== undefined;
function validate(val, builderOrSchema, opts) {
  const schema = unwrap(builderOrSchema);
  if (schema === AMBIGUOUS) {
    const onError = typeof opts === "function" ? opts : opts?.onError;
    if (onError)
      onError("root", AMBIGUOUS_MESSAGE);
    return false;
  }
  return validateResolved(val, schema, opts);
}
function validateResolved(val, schema, opts) {
  const onError = typeof opts === "function" ? opts : opts?.onError;
  const fullScan = typeof opts === "object" ? opts?.strict ?? opts?.fullScan ?? false : false;
  const path = [];
  const err = (msg) => {
    if (onError)
      onError(path.join(".") || "root", msg);
    return false;
  };
  const walk = (v, s) => {
    if (s === true)
      return true;
    if (s === false)
      return err("Schema forbids value");
    if (Array.isArray(s.anyOf)) {
      let matched = false;
      for (const sub of s.anyOf) {
        if (validateResolved(v, sub, { strict: fullScan })) {
          matched = true;
          break;
        }
      }
      if (!matched)
        return err("Union mismatch");
    }
    if (Array.isArray(s.oneOf)) {
      warnExpensive();
      let matches = 0;
      for (const sub of s.oneOf) {
        if (validateResolved(v, sub, { strict: fullScan })) {
          matches++;
          if (matches > 1)
            break;
        }
      }
      if (matches !== 1)
        return err(`oneOf: matched ${matches} branches, need exactly 1`);
    }
    if (s.const !== undefined) {
      if (v !== s.const)
        return err("Const mismatch");
    }
    if (Array.isArray(s.enum) && v !== undefined && !s.enum.includes(v)) {
      return err("Enum mismatch");
    }
    if (v === null) {
      const expectsNull = s.type === "null" && !s["x-tjs-undefined"];
      const typeIncludesNull = Array.isArray(s.type) && s.type.includes("null");
      return expectsNull || typeIncludesNull || !s.type || err("Expected value, got null");
    }
    if (v === undefined) {
      const expectsUndefined = s.type === "null" && s["x-tjs-undefined"];
      const typeIncludesNull = Array.isArray(s.type) && s.type.includes("null");
      return expectsUndefined || typeIncludesNull || !s.type || err("Expected value, got undefined");
    }
    let t;
    if (typeof s.type === "string") {
      if (s.type === "null")
        return err("Expected null");
      if (!matchesType(v, s.type))
        return err(`Expected ${s.type}`);
      t = s.type;
    } else if (Array.isArray(s.type)) {
      let hasNonNull = false;
      for (const ty of s.type) {
        if (typeof ty !== "string" || ty === "null")
          continue;
        hasNonNull = true;
        if (matchesType(v, ty)) {
          t = ty;
          break;
        }
      }
      if (hasNonNull && t === undefined) {
        return err(`Expected ${s.type.filter((e) => typeof e === "string" && e !== "null").join(" | ")}`);
      }
      if (!hasNonNull && s.type.includes("null"))
        return err("Expected null");
    }
    if (s.$predicate && predicateEvaluator) {
      if (!predicateEvaluator(s.$predicate, v))
        return err("Predicate mismatch");
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v))
        return err("Expected finite number");
      if (s.minimum !== undefined && v < s.minimum)
        return err("Value < min");
      if (s.maximum !== undefined && v > s.maximum)
        return err("Value > max");
      if (s.exclusiveMinimum !== undefined && v <= s.exclusiveMinimum)
        return err("Value <= exclusive min");
      if (s.exclusiveMaximum !== undefined && v >= s.exclusiveMaximum)
        return err("Value >= exclusive max");
      if (s.multipleOf !== undefined) {
        const remainder = Math.abs(v % s.multipleOf);
        const tolerance = 0.0000000001;
        if (remainder > tolerance && Math.abs(remainder - Math.abs(s.multipleOf)) > tolerance)
          return err("Value not step");
      }
    }
    if (typeof v === "string") {
      if (s.minLength !== undefined && v.length < s.minLength)
        return err("Len < min");
      if (s.maxLength !== undefined && v.length > s.maxLength)
        return err("Len > max");
      if (s.pattern) {
        try {
          if (!compilePattern(s.pattern, s.format === "emoji").test(v))
            return err("Pattern mismatch");
        } catch {
          return err("Invalid pattern");
        }
      }
      if (s.format && FORMAT_VALIDATORS[s.format] && !FORMAT_VALIDATORS[s.format](v))
        return err("Format invalid");
    }
    if (t === "object" || !t && typeof v === "object" && !Array.isArray(v) && objectKeywordsPresent(s)) {
      const min = s.minProperties;
      const max = s.maxProperties;
      if (min !== undefined || max !== undefined) {
        const c = ownKeys(v).length;
        if (max !== undefined && c > max)
          return err("Too many props");
        if (min !== undefined && c < min)
          return err("Too few props");
      }
      if (s.required) {
        for (const k of s.required)
          if (!hasOwn(v, k))
            return err(`Missing ${k}`);
      }
      if (s.additionalProperties === false) {
        for (const k of ownKeys(v)) {
          if (s.properties && hasOwn(s.properties, k))
            continue;
          return err(`Unexpected ${k}`);
        }
      }
      if (s.properties) {
        for (const k in s.properties) {
          if (hasOwn(v, k)) {
            path.push(k);
            const val = readProp(v, k);
            if (val === UNREADABLE)
              return err(`Unreadable ${k}`);
            const ok = walk(val, s.properties[k]);
            path.pop();
            if (!ok)
              return false;
          }
        }
      }
      if (s.additionalProperties) {
        const keys = [];
        for (const k of ownKeys(v)) {
          if (s.properties && hasOwn(s.properties, k))
            continue;
          keys.push(k);
        }
        const len = keys.length;
        const step = fullScan || len <= STRIDE ? 1 : Math.floor(len / STRIDE);
        for (let i = 0;i < len; i += step) {
          const idx = step > 1 && i > len - 1 - step ? len - 1 : i;
          const k = keys[idx];
          path.push(k);
          const val = readProp(v, k);
          if (val === UNREADABLE)
            return err(`Unreadable ${k}`);
          const ok = walk(val, s.additionalProperties);
          path.pop();
          if (!ok)
            return false;
          if (idx === len - 1)
            break;
        }
      }
      return true;
    }
    if (t === "array" || !t && Array.isArray(v) && arrayKeywordsPresent(s)) {
      const len = v.length;
      if (s.minItems !== undefined && len < s.minItems)
        return err("Array too short");
      if (s.maxItems !== undefined && len > s.maxItems)
        return err("Array too long");
      if (s.items === undefined)
        return true;
      if (Array.isArray(s.items)) {
        for (let i = 0;i < s.items.length; i++) {
          path.push(String(i));
          if (!walk(v[i], s.items[i])) {
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
        const ok = walk(v[idx], s.items);
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
  const schema = unwrap(builderOrSchema);
  const onError = typeof opts === "function" ? opts : opts?.onError;
  const fullScan = typeof opts === "object" ? opts?.strict ?? opts?.fullScan ?? false : false;
  const skipValidation = typeof opts === "object" ? opts?.skipValidation : false;
  if (schema === AMBIGUOUS) {
    if (onError)
      onError("root", AMBIGUOUS_MESSAGE);
    return new Error(`root: ${AMBIGUOUS_MESSAGE}`);
  }
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
      valid = validateResolved(filtered, schema, { onError: captureError, fullScan });
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
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const { anyOf, oneOf, ...rest } = schema;
    let out = data;
    if (Array.isArray(anyOf))
      out = filterAnyOf(out, anyOf, rest, fullScan);
    if (Array.isArray(oneOf))
      out = filterOneOf(out, oneOf, rest, fullScan);
    return out;
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
function stripSchema(rest, branch) {
  if (branch === true || branch == null || typeof branch !== "object")
    return rest;
  const out = { ...rest, ...branch };
  if (rest.properties || branch.properties) {
    const props = { ...rest.properties, ...branch.properties };
    for (const side of [rest, branch]) {
      if (side.additionalProperties !== false)
        continue;
      for (const k of Object.keys(props))
        if (!side.properties || !hasOwn(side.properties, k))
          delete props[k];
    }
    out.properties = props;
  }
  out.additionalProperties = rest.additionalProperties === false || branch.additionalProperties === false ? false : branch.additionalProperties ?? rest.additionalProperties;
  if (out.additionalProperties === undefined)
    delete out.additionalProperties;
  return out;
}
var fitsBoth = (v, rest, branch, fullScan) => {
  try {
    return validateResolved(v, branch, { strict: fullScan }) && validateResolved(v, rest, { strict: fullScan });
  } catch {
    return false;
  }
};
function filterAnyOf(data, branches, rest, fullScan) {
  for (const sub of branches) {
    const candidate = filterData(data, stripSchema(rest, sub), fullScan);
    if (fitsBoth(candidate, rest, sub, fullScan))
      return candidate;
  }
  return data;
}
function filterOneOf(data, branches, rest, fullScan) {
  const origMatches = [];
  for (const sub of branches) {
    if (fitsBoth(data, rest, sub, fullScan))
      origMatches.push(sub);
    if (origMatches.length > 1)
      break;
  }
  if (origMatches.length === 1)
    return filterData(data, stripSchema(rest, origMatches[0]), fullScan);
  if (origMatches.length > 1)
    return data;
  const size = (x) => {
    if (x === null || typeof x !== "object")
      return 0;
    let n = 0;
    for (const k in x)
      if (hasOwn(x, k))
        n += 1 + size(x[k]);
    return n;
  };
  let best = null;
  let bestScore = -1;
  let tie = false;
  for (const sub of branches) {
    const candidate = filterData(data, stripSchema(rest, sub), fullScan);
    if (!fitsBoth(candidate, rest, sub, fullScan))
      continue;
    const score = size(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return best !== null && !tie ? best : data;
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
    const d = {};
    const keys = new Set([
      ...Object.keys(a.properties || {}),
      ...Object.keys(b.properties || {})
    ]);
    let has = false;
    keys.forEach((k) => {
      const pA = a.properties?.[k], pB = b.properties?.[k];
      if (!pA) {
        d[k] = { error: "Added in B" };
        has = true;
      } else if (!pB) {
        d[k] = { error: "Removed in B" };
        has = true;
      } else {
        const sub = diff(pA, pB);
        if (sub) {
          d[k] = sub;
          has = true;
        }
      }
    });
    ["minProperties", "maxProperties"].forEach((k) => {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        d[k] = { from: a[k], to: b[k] };
        has = true;
      }
    });
    return has ? d : null;
  }
  if (a.type === "array") {
    if (Array.isArray(a.items) && Array.isArray(b.items)) {
      if (a.items.length !== b.items.length)
        return { error: "Tuple length mismatch" };
      const d = {};
      let has = false;
      for (let i = 0;i < a.items.length; i++) {
        const sub = diff(a.items[i], b.items[i]);
        if (sub) {
          d[i] = sub;
          has = true;
        }
      }
      return has ? { items: d } : null;
    }
    if (!Array.isArray(a.items) && !Array.isArray(b.items)) {
      const d = diff(a.items, b.items);
      return d ? { items: d } : null;
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
    if (unwrap(inputSchema) === AMBIGUOUS)
      throw new TypeError(`M.func input: ${AMBIGUOUS_MESSAGE}`);
    if (unwrap(outputSchema) === AMBIGUOUS)
      throw new TypeError(`M.func output: ${AMBIGUOUS_MESSAGE}`);
    const wrapper = async (data) => {
      const validIn = validateResolved(data, unwrap(inputSchema), { fullScan: true });
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
      const validOut = validateResolved(result, unwrap(outputSchema), { fullScan: true });
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
var toPlain = (schema) => isBuilder(schema) ? schema.schema : schema;
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
var isNonPrimitive = (x) => x !== null && typeof x === "object";
var KEYWORD_SHAPES = [
  [
    "type",
    (v) => typeof v === "string" || Array.isArray(v) && v.every((x) => typeof x === "string"),
    "a string or array of strings"
  ],
  ["anyOf", Array.isArray, "an array"],
  ["oneOf", Array.isArray, "an array"],
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
    "exclusiveMinimum",
    "exclusiveMaximum",
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
  ["exclusiveMinimum", ["number", "integer"]],
  ["exclusiveMaximum", ["number", "integer"]],
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
var unenforced = (s, at = "root") => {
  if (s === true || s === false)
    return [];
  if (s == null || typeof s !== "object" || Array.isArray(s)) {
    return [`${at} (not a schema)`];
  }
  const found = [];
  for (const key of Object.keys(s)) {
    if (!ENFORCED_KEYWORDS.has(key) && !ANNOTATION_KEYWORDS.has(key) && !key.startsWith("x-")) {
      found.push(`${at}.${key}`);
    }
  }
  for (const [key, wellFormed, expected] of KEYWORD_SHAPES) {
    if (s[key] !== undefined && !wellFormed(s[key])) {
      found.push(`${at}.${key} (must be ${expected})`);
    }
  }
  if (s.type === undefined && s.const === undefined && s.anyOf === undefined && s.oneOf === undefined) {
    const dark = TYPE_DEPENDENT_KEYWORDS.filter((key) => s[key] !== undefined);
    if (dark.length > 0) {
      found.push(`${at} (constraints without a type — null/undefined and mismatched ` + `primitives bypass ${dark.join("/")}; add an explicit type)`);
    }
  }
  const declaredTypes = typeof s.type === "string" ? [s.type] : Array.isArray(s.type) && s.type.every((x) => typeof x === "string") ? s.type : null;
  if (declaredTypes) {
    for (const [key, domain] of CONSTRAINT_DOMAINS) {
      if (s[key] !== undefined && !declaredTypes.some((entry) => domain.includes(entry))) {
        found.push(`${at}.${key} (never applies to type ${JSON.stringify(s.type)})`);
      }
    }
  }
  if (typeof s.format === "string" && !ENFORCED_FORMATS.has(s.format)) {
    found.push(`${at}.format:'${s.format}'`);
  }
  if (typeof s.pattern === "string") {
    try {
      compilePattern(s.pattern, s.format === "emoji");
    } catch {
      found.push(`${at}.pattern (invalid regex)`);
    }
  }
  if (Array.isArray(s.items) && s.maxItems !== s.items.length) {
    found.push(`${at}.items (tuple without maxItems: ${s.items.length})`);
  }
  if (isNonPrimitive(s.const)) {
    found.push(`${at}.const (non-primitive; === comparison never matches)`);
  }
  if (Array.isArray(s.enum) && s.enum.some(isNonPrimitive)) {
    found.push(`${at}.enum (non-primitive member never matches)`);
  }
  for (const [segment, kid] of enforcedSubschemas(s)) {
    found.push(...unenforced(kid, `${at}.${segment}`));
  }
  return found;
};
function unenforcedKeywords(schema) {
  const s = toPlain(schema);
  if (s === true || s === false)
    return [];
  return unenforced(s);
}
var agentContract = (schemas, options) => {
  const rawStrict = options?.strict;
  if (rawStrict !== undefined && typeof rawStrict !== "boolean") {
    throw new Error(`agentContract: strict must be a boolean, got ${JSON.stringify(rawStrict)} — ` + `a non-boolean would coerce this gate into sampling, which is the fail-open ` + `a gate must not have`);
  }
  const strict = rawStrict ?? true;
  const rawUnknownPath = options?.unknownPath;
  if (rawUnknownPath !== undefined && rawUnknownPath !== "allow" && rawUnknownPath !== "refuse") {
    throw new Error(`agentContract: unknownPath must be 'allow' or 'refuse', got ` + `${JSON.stringify(options?.unknownPath)} — an unrecognized value would ` + `fall back to 'allow' and fail open, which is what this option exists to prevent`);
  }
  const unknownPath = rawUnknownPath ?? "allow";
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
    if (typeof path !== "string") {
      throw new TypeError(`affectedRoots(path): path must be a string, got ${path === null ? "null" : typeof path} — cannot locate a write that has no path`);
    }
    const at = roots.find((root) => path === root || extendsPath(path, root));
    return at != null ? [at] : roots.filter((root) => extendsPath(root, path));
  };
  return {
    affectedRoots,
    check(path, _value, proposal) {
      if (typeof path !== "string") {
        return new Error(`contract breach — path must be a string, got ${path === null ? "null" : typeof path}; the gate cannot judge a write it cannot locate`);
      }
      const at = path || "''";
      const affected = affectedRoots(path);
      if (affected.length === 0) {
        if (unknownPath === "refuse") {
          return new Error(`contract breach at ${at} — path touches no contracted root and ` + `the gate is { unknownPath: 'refuse' }; contract this root or ` + `route the write around the gate deliberately`);
        }
        return true;
      }
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
        ok = validateResolved(proposal.proposed, schema, {
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
var subschemas = (s) => {
  if (s == null || typeof s !== "object")
    return [];
  const kids = enforcedSubschemas(s);
  if (Array.isArray(s.prefixItems)) {
    s.prefixItems.forEach((item, i) => kids.push([`prefixItems.${i}`, item]));
  }
  if (Array.isArray(s.allOf))
    s.allOf.forEach((sub, i) => kids.push([`allOf.${i}`, sub]));
  if (s.not !== undefined)
    kids.push(["not", s.not]);
  if (s.$defs && typeof s.$defs === "object") {
    for (const k of Object.keys(s.$defs))
      kids.push([`$defs.${k}`, s.$defs[k]]);
  }
  return kids;
};
var hasPredicate = (s) => s != null && typeof s === "object" && (typeof s.$predicate === "string" || enforcedSubschemas(s).some(([, kid]) => hasPredicate(kid)));
function checkExamples(schemaOrBuilder) {
  const findings = [];
  const visit = (s, at) => {
    if (s == null || typeof s !== "object")
      return;
    let predicateMemo;
    const nodeHasPredicate = () => predicateMemo ??= hasPredicate(s);
    if (Array.isArray(s.examples)) {
      s.examples.forEach((example, index) => {
        const reasons = [];
        let ok;
        try {
          ok = validateResolved(example, s, {
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
        } else if (getPredicateEvaluator() == null && nodeHasPredicate()) {
          findings.push({
            schemaPath: at,
            kind: "example",
            index,
            problem: "unverifiable"
          });
        }
      });
    }
    if (Array.isArray(s.$counterexamples)) {
      s.$counterexamples.forEach((counter, index) => {
        let passes;
        try {
          passes = validateResolved(counter, s, { strict: true });
        } catch {
          passes = false;
        }
        if (passes) {
          const unverifiable = getPredicateEvaluator() == null && nodeHasPredicate();
          findings.push({
            schemaPath: at,
            kind: "counterexample",
            index,
            problem: unverifiable ? "unverifiable" : "accepted"
          });
        }
      });
    }
    for (const [segment, kid] of subschemas(s)) {
      visit(kid, `${at}.${segment}`);
    }
  };
  visit(toPlain(schemaOrBuilder), "root");
  return findings;
}
// src/infer.ts
var ENUM_DEFAULTS = { maxDistinct: 12, minCoverage: 0.5 };
var SNIFF_FORMATS = ["date", "date-time", "email", "uri"];
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
  const total = arrays.reduce((n, a) => n + a.length, 0);
  let items;
  if (opts.sampleSize !== undefined && total > opts.sampleSize) {
    items = [];
    for (const a of arrays) {
      for (const el of a) {
        items.push(el);
        if (items.length >= opts.sampleSize)
          break;
      }
      if (items.length >= opts.sampleSize)
        break;
    }
    opts.onTruncate?.({ path: path || "(root)", sampled: items.length, total });
  } else {
    items = arrays.flat();
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
