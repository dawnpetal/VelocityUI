const DataTreeStudioProperties = (() => {
  const HIDDEN_TAGS = new Set(['Hidden', 'Deprecated', 'NotBrowsable']);
  const SERIALIZED_ALIASES = {
    Color: ['Color', 'Color3', 'Color3uint8'],
    MaterialVariant: ['MaterialVariant', 'MaterialVariantSerialized'],
    Shape: ['Shape', 'shape'],
    Size: ['Size', 'size'],
  };
  const CATEGORY_ORDER = [
    'Appearance',
    'Data',
    'Transform',
    'Collision',
    'Part',
    'Behavior',
    'Pivot',
    'Surface',
    'Assembly',
  ];

  let classMap = new Map();
  let enumMap = new Map();
  let membersByClass = new Map();

  function build(raw = {}) {
    classMap = new Map((raw.Classes || []).map((item) => [item.Name, item]));
    enumMap = new Map(
      (raw.Enums || []).map((item) => [
        item.Name,
        new Map((item.Items || []).map((entry) => [String(entry.Value), entry.Name])),
      ]),
    );
    membersByClass = new Map();
  }

  function ready() {
    return classMap.size > 0;
  }

  function _visible(member) {
    return !member.Tags?.some((tag) => HIDDEN_TAGS.has(tag));
  }

  function membersFor(className = '') {
    if (membersByClass.has(className)) return membersByClass.get(className);
    const chain = [];
    const seenClasses = new Set();
    let cursor = className;
    while (cursor && !seenClasses.has(cursor)) {
      seenClasses.add(cursor);
      const cls = classMap.get(cursor);
      if (!cls) break;
      chain.push(cls);
      cursor = cls.Superclass;
    }
    chain.reverse();

    const out = [];
    const seenMembers = new Set();
    for (const cls of chain) {
      for (const member of cls.Members || []) {
        if (member.MemberType !== 'Property' || seenMembers.has(member.Name) || !_visible(member)) {
          continue;
        }
        seenMembers.add(member.Name);
        out.push(member);
      }
    }
    membersByClass.set(className, out);
    return out;
  }

  function _serializedEntries(node) {
    return Object.entries(node?.properties || {});
  }

  function _serializedValue(node, propertyName) {
    const entries = _serializedEntries(node);
    const candidates = SERIALIZED_ALIASES[propertyName] || [propertyName];
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(node?.properties || {}, candidate)) {
        return { key: candidate, value: node.properties[candidate] };
      }
    }
    const lowerCandidates = new Set(candidates.map((item) => item.toLowerCase()));
    for (const [key, value] of entries) {
      if (lowerCandidates.has(key.toLowerCase())) return { key, value };
    }
    return null;
  }

  function _decodePackedColor(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const packed = num >>> 0;
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
  }

  function _enumName(enumName, value) {
    return enumMap.get(enumName)?.get(String(value)) || '';
  }

  function _present(member, source) {
    const sourceKey = source.key;
    const rawValue = source.value;
    if (member.Name === 'Color' && sourceKey === 'Color3uint8') {
      const rgb = _decodePackedColor(rawValue);
      if (rgb) return { value: `[${rgb.join(', ')}]`, rawValue, sourceKey };
    }
    if (member.ValueType?.Category === 'Enum') {
      const enumName = _enumName(member.ValueType.Name, rawValue);
      if (enumName) return { value: enumName, rawValue, sourceKey };
    }
    return { value: rawValue, rawValue, sourceKey };
  }

  function groupsFor(node, query = '') {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const groups = new Map();
    for (const member of membersFor(node?.className)) {
      const source = _serializedValue(node, member.Name);
      if (!source) continue;
      const entry = {
        name: member.Name,
        category: member.Category || 'Other',
        valueType: member.ValueType || null,
        xmlType: node?.propertyTypes?.[source.key] || '',
        ..._present(member, source),
      };
      const haystack = `${entry.category} ${entry.name} ${String(entry.value)}`.toLowerCase();
      if (q && !haystack.includes(q)) continue;
      if (!groups.has(entry.category)) groups.set(entry.category, []);
      groups.get(entry.category).push(entry);
    }
    return [...groups.entries()]
      .map(([title, entries]) => ({ title, entries }))
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.title);
        const bi = CATEGORY_ORDER.indexOf(b.title);
        if (ai !== bi) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
        return a.title.localeCompare(b.title);
      });
  }

  return { build, groupsFor, membersFor, ready };
})();
