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

// src/infer.ts
var exports_infer = {};
__export(exports_infer, {
  inferSchema: () => inferSchema
});
module.exports = __toCommonJS(exports_infer);

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
