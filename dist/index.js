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
  title: (t) => create({ ...s, title: t }),
  describe: (d) => create({ ...s, description: d }),
  default: (v) => create({ ...s, default: v }),
  meta: (m) => create({ ...s, ...m }),
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
  step: (v) => create({ ...s, multipleOf: v })
});
var methods = {
  union: (schemas) => create({ anyOf: schemas.map((s) => s.schema) }),
  enum: (vals) => create({ type: typeof vals[0], enum: vals }),
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
      required.push(k);
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
  })
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
function validate(val, schema, opts) {
  const onError = typeof opts === "function" ? opts : opts?.onError;
  const fullScan = typeof opts === "object" ? opts?.fullScan : false;
  const path = [];
  const err = (msg) => {
    if (onError)
      onError(path.join(".") || "root", msg);
    return false;
  };
  const walk = (v, s2) => {
    if (s2.anyOf) {
      for (const sub of s2.anyOf) {
        if (validate(v, sub))
          return true;
      }
      return err("Union mismatch");
    }
    if (v === null || v === undefined) {
      return Array.isArray(s2.type) && s2.type.includes("null") || err("Expected value");
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
    if (typeof v === "number") {
      if (s2.minimum !== undefined && v < s2.minimum)
        return err("Value < min");
      if (s2.maximum !== undefined && v > s2.maximum)
        return err("Value > max");
      if (s2.multipleOf !== undefined && v % s2.multipleOf !== 0)
        return err("Value not step");
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
    if (t === "object") {
      if (s2.minProperties !== undefined) {
        let c = 0;
        for (const k in v)
          if (Object.prototype.hasOwnProperty.call(v, k))
            c++;
        if (c < s2.minProperties)
          return err("Too few props");
      }
      if (s2.required) {
        for (const k of s2.required)
          if (!(k in v))
            return err(`Missing ${k}`);
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
        let i = 0;
        for (const k in v) {
          if (s2.properties && k in s2.properties)
            continue;
          if (!fullScan) {
            i++;
            if (i % STRIDE !== 0)
              continue;
          }
          path.push(k);
          const ok = walk(v[k], s2.additionalProperties);
          path.pop();
          if (!ok)
            return false;
        }
      }
      return true;
    }
    if (t === "array" && s2.items) {
      const len = v.length;
      if (s2.minItems !== undefined && len < s2.minItems)
        return err("Array too short");
      if (s2.maxItems !== undefined && len > s2.maxItems)
        return err("Array too long");
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
