// Phase 16 — a small, hand-rolled JSON-Schema-subset validator. No schema
// library exists anywhere in this repo's dependencies (audited first), and
// the three schemas this app needs are simple enough that adding one would
// be exactly the "unnecessary dependency" the deadline-execution directive
// warns against. Supports just what domain/ai's schemas actually use: type,
// properties, required, items, minItems/maxItems, maxLength, enum,
// additionalProperties — never trust provider JSON blindly (Part 47).

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

/** @returns {{ valid: boolean, errors: string[] }} */
export function validateStructuredOutput(value, schema, path = '$') {
  const errors = []
  validateNode(value, schema, path, errors)
  return { valid: errors.length === 0, errors }
}

function validateNode(value, schema, path, errors) {
  if (schema.type && typeOf(value) !== schema.type) {
    errors.push(`${path}: expected type '${schema.type}', got '${typeOf(value)}'`)
    return
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value '${value}' is not one of ${JSON.stringify(schema.enum)}`)
  }

  if (schema.type === 'string' && schema.maxLength != null && value.length > schema.maxLength) {
    errors.push(`${path}: string length ${value.length} exceeds maxLength ${schema.maxLength}`)
  }

  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}: missing required field '${key}'`)
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`${path}: unexpected field '${key}'`)
      }
    }
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      if (key in value) validateNode(value[key], propSchema, `${path}.${key}`, errors)
    }
  }

  if (schema.type === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${path}: array length ${value.length} below minItems ${schema.minItems}`)
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      errors.push(`${path}: array length ${value.length} exceeds maxItems ${schema.maxItems}`)
    }
    if (schema.items) {
      value.forEach((item, i) => validateNode(item, schema.items, `${path}[${i}]`, errors))
    }
  }
}
