/**
 * Alan dönüştürme motoru — request (field_rules) ve response (response_rules) için ortak
 */

/**
 * Nested path'ten değer oku: "HEADER.VBELN" → obj.HEADER.VBELN
 */
function getNestedValue(obj, path) {
  const cleanPath = path.replace(/\[\]/g, '.0');
  const parts = cleanPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Nested path'e değer yaz: "order_number" → obj.order_number
 */
function setNestedValue(obj, path, value) {
  const cleanPath = path.replace(/\[\]/g, '');
  const parts = cleanPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Transform uygula
 */
function applyTransform(value, transform) {
  if (value === undefined) return undefined;
  switch (transform) {
    case 'DIRECT':
      return value;
    case 'SAP_DATE':
      if (typeof value === 'string' && value.length === 8) {
        return value.substring(0, 4) + '-' + value.substring(4, 6) + '-' + value.substring(6, 8);
      }
      return value;
    case 'TO_NUMBER': {
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    }
    case 'TO_STRING':
      return value == null ? '' : String(value);
    case 'LOOKUP':
      return value;
    default:
      if (typeof transform === 'string' && transform.startsWith('PREFIX:')) {
        return transform.substring(7) + value;
      }
      return value;
  }
}

/**
 * Field rules uygula (SAP → 3PL request dönüşümü)
 * @param {Object} input - Kaynak JSON
 * @param {Array} rules - [{ sap_field, threepl_field, transform }]
 * @returns {Object} Dönüştürülmüş JSON
 */
function applyFieldRules(input, rules) {
  const validRules = rules.filter(r => r.sap_field && r.threepl_field);
  if (validRules.length === 0) {
    return JSON.parse(JSON.stringify(input));
  }

  const output = {};
  validRules.forEach(rule => {
    const value = getNestedValue(input, rule.sap_field);
    if (value === undefined) return;
    const transformed = applyTransform(value, rule.transform);
    setNestedValue(output, rule.threepl_field, transformed);
  });

  return output;
}

/**
 * Response rules uygula (3PL response → eşlenmiş yanıt dönüşümü)
 * @param {Object} responseBody - 3PL'den dönen yanıt JSON
 * @param {Array} rules - [{ source_field, target_field, transform }]
 * @returns {Object} Dönüştürülmüş yanıt JSON
 */
function applyResponseRules(responseBody, rules) {
  const validRules = rules.filter(r => r.source_field && r.target_field);
  if (validRules.length === 0) {
    return JSON.parse(JSON.stringify(responseBody));
  }

  const output = {};
  validRules.forEach(rule => {
    const value = getNestedValue(responseBody, rule.source_field);
    if (value === undefined) return;
    const transformed = applyTransform(value, rule.transform);
    setNestedValue(output, rule.target_field, transformed);
  });

  return output;
}

module.exports = { applyFieldRules, applyResponseRules, getNestedValue, setNestedValue, applyTransform };
