// src/schema.ts
var RX_EMOJI_ATOM = "\\p{Extended_Pictographic}";
var create = (s) => ({
  schema: s,
  _type: null,
  get optional() {
    return create({
      ...s,
      type: Array.isArray(s.type) ? [...s.type, "null"] : [s.type, "null"]
    });
  },
  min: (v) => {
    const key = s.type === "string" ? "minLength" : s.type === "array" ? "minItems" : "minimum";
    return create({ ...s, [key]: v });
  },
  max: (v) => {
    const key = s.type === "string" ? "maxLength" : s.type === "array" ? "maxItems" : "maximum";
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
    return create({
      ...s,
      pattern: `^${RX_EMOJI_ATOM}+$`,
      format: "emoji"
    });
  },
  get int() {
    return create({ ...s, type: "integer" });
  },
  step: (v) => create({ ...s, multipleOf: v })
});
var methods = {
  union: (schemas) => create({ anyOf: schemas.map((s) => s.schema) }),
  enum: (vals) => create({ type: typeof vals[0], enum: vals }),
  array: (items) => create({ type: "array", items: items.schema }),
  object: (props) => {
    const properties = {};
    const required = [];
    for (const k in props) {
      properties[k] = props[k].schema;
      required.push(k);
    }
    return create({
      type: "object",
      properties,
      required,
      additionalProperties: false
    });
  }
};
var s = new Proxy(methods, {
  get(target, prop) {
    if (prop in target)
      return target[prop];
    if (prop === "string" || prop === "number" || prop === "boolean") {
      const schema = create({ type: prop });
      target[prop] = schema;
      return schema;
    }
    return;
  }
});
var ARR_THR = 100;
var PRIME = 37;
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
function validate(val, schema) {
  if (schema.anyOf) {
    for (const sub of schema.anyOf)
      if (validate(val, sub))
        return true;
    return false;
  }
  if (val === null || val === undefined) {
    return Array.isArray(schema.type) && schema.type.includes("null");
  }
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (schema.enum && !schema.enum.includes(val))
    return false;
  if (t === "integer") {
    if (typeof val !== "number" || !Number.isInteger(val))
      return false;
  } else if (t === "array") {
    if (!Array.isArray(val))
      return false;
  } else if (t === "object") {
    if (typeof val !== "object" || Array.isArray(val))
      return false;
  } else if (t && typeof val !== t)
    return false;
  if (typeof val === "number") {
    if (schema.minimum !== undefined && val < schema.minimum)
      return false;
    if (schema.maximum !== undefined && val > schema.maximum)
      return false;
    if (schema.multipleOf !== undefined && val % schema.multipleOf !== 0)
      return false;
  }
  if (typeof val === "string") {
    if (schema.minLength !== undefined && val.length < schema.minLength)
      return false;
    if (schema.maxLength !== undefined && val.length > schema.maxLength)
      return false;
    if (schema.pattern && !new RegExp(schema.pattern, schema.format === "emoji" ? "u" : "").test(val))
      return false;
    if (schema.format && FMT[schema.format] && !FMT[schema.format](val))
      return false;
  }
  if (t === "object" && schema.properties) {
    if (schema.required) {
      for (const k of schema.required)
        if (!(k in val))
          return false;
    }
    for (const k in schema.properties) {
      if (k in val && !validate(val[k], schema.properties[k]))
        return false;
    }
  }
  if (t === "array" && schema.items) {
    const len = val.length;
    if (schema.minItems !== undefined && len < schema.minItems)
      return false;
    if (schema.maxItems !== undefined && len > schema.maxItems)
      return false;
    if (len <= ARR_THR) {
      for (let i = 0;i < len; i++)
        if (!validate(val[i], schema.items))
          return false;
    } else {
      const stride = Math.floor(len / PRIME) || 1;
      for (let i = 0;i < len; i += stride)
        if (!validate(val[i], schema.items))
          return false;
    }
  }
  return true;
}
function diff(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b))
    return null;
  if (a.anyOf || b.anyOf) {
    if (JSON.stringify(a.anyOf) !== JSON.stringify(b.anyOf)) {
      return { error: "Union mismatch", from: a.anyOf, to: b.anyOf };
    }
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
    return has2 ? d2 : null;
  }
  if (a.type === "array") {
    const d2 = diff(a.items, b.items);
    return d2 ? { items: d2 } : null;
  }
  const d = {};
  let has = false;
  ["minimum", "maximum", "minLength", "pattern", "format", "enum"].forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      d[k] = { from: a[k], to: b[k] };
      has = true;
    }
  });
  return has ? d : null;
}
export {
  validate,
  s,
  diff
};
