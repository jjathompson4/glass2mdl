/**
 * RAL Classic shades that turn up on spandrel and back-pan finishes: the
 * greys, whites, blacks, and bronzes. RAL publishes no sRGB values; these are
 * the commonly circulated approximations, close enough to start from and
 * meant to be adjusted against a real sample. Entered by number ("7024",
 * "RAL 7024") or a fragment of the name.
 */
export interface RalColor {
  code: string;
  name: string;
  hex: string;
}

export const RAL_COLORS: RalColor[] = [
  { code: "7000", name: "Squirrel grey", hex: "#78858b" },
  { code: "7001", name: "Silver grey", hex: "#8f999f" },
  { code: "7004", name: "Signal grey", hex: "#9c9c9c" },
  { code: "7005", name: "Mouse grey", hex: "#6c6e6b" },
  { code: "7006", name: "Beige grey", hex: "#766a5e" },
  { code: "7009", name: "Green grey", hex: "#4d5645" },
  { code: "7010", name: "Tarpaulin grey", hex: "#4c514a" },
  { code: "7011", name: "Iron grey", hex: "#434b4d" },
  { code: "7012", name: "Basalt grey", hex: "#4e5754" },
  { code: "7015", name: "Slate grey", hex: "#434750" },
  { code: "7016", name: "Anthracite grey", hex: "#383e42" },
  { code: "7021", name: "Black grey", hex: "#2f3234" },
  { code: "7022", name: "Umbra grey", hex: "#4b4d46" },
  { code: "7023", name: "Concrete grey", hex: "#686c5e" },
  { code: "7024", name: "Graphite grey", hex: "#45494e" },
  { code: "7026", name: "Granite grey", hex: "#2f3d44" },
  { code: "7030", name: "Stone grey", hex: "#8b8c7a" },
  { code: "7031", name: "Blue grey", hex: "#5d6970" },
  { code: "7032", name: "Pebble grey", hex: "#b5b8b1" },
  { code: "7033", name: "Cement grey", hex: "#7d8471" },
  { code: "7035", name: "Light grey", hex: "#c5c7c4" },
  { code: "7036", name: "Platinum grey", hex: "#979392" },
  { code: "7037", name: "Dusty grey", hex: "#7a7b7a" },
  { code: "7038", name: "Agate grey", hex: "#b4b8b0" },
  { code: "7039", name: "Quartz grey", hex: "#6b695f" },
  { code: "7040", name: "Window grey", hex: "#9da3a6" },
  { code: "7042", name: "Traffic grey A", hex: "#8f9695" },
  { code: "7043", name: "Traffic grey B", hex: "#4e5451" },
  { code: "7044", name: "Silk grey", hex: "#bdbdb2" },
  { code: "7045", name: "Telegrey 1", hex: "#91969a" },
  { code: "7046", name: "Telegrey 2", hex: "#82898e" },
  { code: "7047", name: "Telegrey 4", hex: "#cfd0cf" },
  { code: "8014", name: "Sepia brown", hex: "#4a3526" },
  { code: "8017", name: "Chocolate brown", hex: "#442f29" },
  { code: "8019", name: "Grey brown", hex: "#3d3635" },
  { code: "8022", name: "Black brown", hex: "#1a1718" },
  { code: "8025", name: "Pale brown", hex: "#755c49" },
  { code: "8028", name: "Terra brown", hex: "#4e3b31" },
  { code: "9001", name: "Cream", hex: "#fdf4e3" },
  { code: "9002", name: "Grey white", hex: "#e7ebda" },
  { code: "9003", name: "Signal white", hex: "#f4f4f4" },
  { code: "9004", name: "Signal black", hex: "#282828" },
  { code: "9005", name: "Jet black", hex: "#0a0a0a" },
  { code: "9006", name: "White aluminium", hex: "#a5a5a5" },
  { code: "9007", name: "Grey aluminium", hex: "#8f8f8f" },
  { code: "9010", name: "Pure white", hex: "#f7f9ef" },
  { code: "9011", name: "Graphite black", hex: "#1c1c1c" },
  { code: "9016", name: "Traffic white", hex: "#f1f0ea" },
  { code: "9017", name: "Traffic black", hex: "#1e1e1e" },
  { code: "9018", name: "Papyrus white", hex: "#d7d7d7" },
];

/** Find a shade by number ("7024", "RAL 7024") or a fragment of its name. */
export function lookupRal(text: string): RalColor | undefined {
  const query = text.trim().toLowerCase().replace(/^ral\s*/, "");
  if (!query) return undefined;
  if (/^\d{4}$/.test(query)) return RAL_COLORS.find((c) => c.code === query);
  if (query.length < 3) return undefined;
  return RAL_COLORS.find((c) => c.name.toLowerCase().includes(query));
}
