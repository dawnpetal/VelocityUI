const DataTreeMaterials = (() => {
  const numericNames = {
    256: 'plastic',
    272: 'smoothplastic',
    288: 'neon',
    512: 'wood',
    528: 'woodplanks',
    784: 'marble',
    788: 'basalt',
    800: 'slate',
    804: 'crackedlava',
    816: 'concrete',
    820: 'limestone',
    832: 'granite',
    836: 'pavement',
    848: 'brick',
    864: 'pebble',
    880: 'cobblestone',
    896: 'rock',
    912: 'sandstone',
    1040: 'corrodedmetal',
    1056: 'diamondplate',
    1072: 'foil',
    1088: 'metal',
    1280: 'grass',
    1284: 'leafygrass',
    1296: 'sand',
    1312: 'fabric',
    1328: 'snow',
    1344: 'mud',
    1360: 'ground',
    1376: 'asphalt',
    1392: 'salt',
    1536: 'ice',
    1552: 'glacier',
    1568: 'glass',
    1584: 'forcefield',
    1792: 'air',
    2048: 'water',
    2304: 'cardboard',
    2305: 'carpet',
    2306: 'ceramictiles',
    2307: 'clay rooftiles',
    2308: 'roofshingles',
    2309: 'leather',
    2310: 'plaster',
    2311: 'rubber',
  };

  const tints = {
    asphalt: [82, 86, 86],
    basalt: [72, 75, 78],
    brick: [150, 80, 62],
    carpet: [120, 76, 72],
    cashmere: [177, 160, 143],
    cobblestone: [124, 119, 110],
    concrete: [142, 140, 132],
    corrodedmetal: [118, 92, 70],
    crackedlava: [148, 69, 39],
    diamondplate: [148, 152, 153],
    dryrot: [94, 67, 45],
    fabric: [138, 112, 104],
    foil: [170, 174, 172],
    grass: [86, 126, 69],
    ground: [122, 94, 67],
    ice: [175, 210, 225],
    leafygrass: [75, 134, 67],
    limestone: [164, 158, 140],
    marble: [184, 180, 170],
    metal: [136, 140, 142],
    mud: [105, 76, 55],
    pavement: [116, 111, 106],
    pebble: [118, 112, 101],
    plastic: [163, 162, 165],
    rock: [104, 100, 93],
    rustymetal: [127, 86, 57],
    sand: [189, 166, 116],
    sandstone: [178, 148, 102],
    slate: [103, 104, 103],
    smoothplastic: [163, 162, 165],
    snow: [218, 222, 219],
    wood: [133, 86, 48],
    woodalt: [116, 74, 43],
    woodplanks: [139, 92, 54],
    woodplanksalt: [128, 82, 49],
  };

  function variantKey(value = '') {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function key(material = '') {
    const text = String(material || '').toLowerCase();
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numericNames[numeric] || text : text;
  }

  function tint(name = '') {
    return tints[variantKey(name)] || tints[key(name)] || null;
  }

  function id(matKey) {
    const k = String(matKey || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (k === 'wood' || k === 'woodplanks') return 1;
    if (k === 'metal' || k === 'corrodedmetal') return 2;
    if (k === 'concrete' || k === 'slate') return 3;
    if (k === 'brick') return 4;
    if (k === 'cobblestone' || k === 'pebble') return 5;
    if (k === 'granite' || k === 'basalt' || k === 'rock') return 6;
    if (k === 'fabric' || k === 'carpet' || k === 'leather') return 7;
    if (k === 'diamondplate' || k === 'foil') return 8;
    if (k === 'limestone' || k === 'marble') return 9;
    if (k === 'asphalt' || k === 'pavement' || k === 'ground') return 10;
    if (k === 'plaster' || k === 'ceramictiles') return 11;
    return 0;
  }

  function alpha(alphaValue, material = '') {
    const materialKey = key(material);
    if (materialKey.includes('glass') || materialKey.includes('forcefield'))
      return Math.min(alphaValue, 0.62);
    return alphaValue;
  }

  function previewUrl(manifest, name) {
    const lookup = variantKey(name);
    if (!lookup) return '';
    const direct = manifest?.materials?.find((item) => item.key === lookup);
    if (direct?.preview) return direct.preview;
    const fallbackKey = variantKey(key(name));
    const fallback = manifest?.materials?.find((item) => item.key === fallbackKey);
    return fallback?.preview || '';
  }

  return { alpha, id, key, previewUrl, tint, variantKey };
})();
