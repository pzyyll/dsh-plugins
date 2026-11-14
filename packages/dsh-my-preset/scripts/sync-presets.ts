// ABOUTME: Regenerates presets/m-*.patch.yml from the preset files shipped with DSH.
// ABOUTME: Replaces each shipped tool-web row with the Exa MCP client and rewrites the declaration identity.

import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Runs from plain Node inside the package, so it may not import a YAML parser or
 * any runtime dependency: the shipped file is rewritten line by line, which also
 * keeps the !!js loader tags and the block scalars intact.
 */

/** A preset this package generates from one shipped by DSH. */
interface PresetSpec {
  /** Shipped preset file stem inside the DSH presets directory. */
  source: string;
  /** Output file name inside this package's presets directory. */
  output: string;
  /** Loader row id of the declaration. */
  declarationId: string;
  /** Preset id sessions save. */
  id: string;
  /** Roster display name. */
  name: string;
  /** Roster description. */
  description: string;
  /** Roster sort order. */
  order: number;
  /** Shipped plugin row that the Exa MCP client row replaces. */
  replacedRow: string;
}

/** The presets this bundle publishes, in roster order. */
const PRESETS: PresetSpec[] = [
  {
    source: "standard",
    output: "m-standard.patch.yml",
    declarationId: "preset-m-standard",
    id: "m-standard",
    name: "M-Standard",
    description: "Standard preset without the native web tools; Exa MCP instead.",
    order: 4,
    replacedRow: "tool-web",
  },
  {
    source: "ptc",
    output: "m-ptc.patch.yml",
    declarationId: "preset-m-ptc",
    id: "m-ptc",
    name: "M-PTC",
    description: "My custom PTC mode.",
    order: 5,
    replacedRow: "tool-web",
  },
  {
    source: "cordis",
    output: "m-creator.patch.yml",
    declarationId: "preset-m-creator",
    id: "m-creator",
    name: "M-Creator",
    description: "Creator preset without the native web tools; Exa MCP instead.",
    order: 6,
    replacedRow: "tool-web",
  },
];

/** Where the generated files live. */
const PRESETS_DIR = join(import.meta.dirname, "..", "presets");

/** One plugin row of the shipped preset: its id and every line it owns, comments included. */
interface PluginRow {
  id: string;
  lines: string[];
}

/** A readable collection of shipped preset files. */
interface Origin {
  /** Human-readable location, quoted in the generated header. */
  label: string;
  /** Version of the @deepseek-ai/dsh-web-app package that shipped them. */
  version: string;
  /** Whether this origin carries the given preset. */
  has(stem: string): boolean;
  /** Reads one shipped preset file. */
  read(stem: string): string;
}

const USAGE = [
  "Usage: node scripts/sync-presets.ts [preset...] [options]",
  "",
  "Copies the shipped DSH preset list for each preset this package publishes, swaps",
  "its tool-web row for the Exa MCP client, and rewrites the declaration identity.",
  "",
  "Presets: " + PRESETS.map((preset) => preset.source).join(", ") + " (default: all)",
  "",
  "Options:",
  "  --check           Report stale files instead of writing them; exit 1 when stale.",
  "  --source <path>   Read presets from here instead of the auto-detected DSH install.",
  "                    Accepts an app.asar, its resources directory, a dsh-web-app",
  "                    package directory, or a directory holding the preset files.",
  "  -h, --help        Show this message.",
].join("\n");

const indentOf = (line: string): number => line.length - line.trimStart().length;
const pad = (width: number): string => " ".repeat(width);
const escapeRegExp = (value: string): string => value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

/** Reports a fatal problem and stops with exit code 1. */
function fail(message: string): never {
  console.error("error: " + message);
  process.exit(1);
}

/** Narrows an unknown JSON value to an object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Extracts the version field of a package.json document. */
function packageVersion(text: string | null): string {
  if (text === null) return "unknown";
  try {
    const version = asRecord(JSON.parse(text))?.version;
    return typeof version === "string" ? version : "unknown";
  } catch {
    return "unknown";
  }
}

/** Reads a directory, tolerating a missing one. */
function readDirectory(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** One file inside an asar archive. */
interface AsarEntry {
  size: number;
  offset: number;
  unpacked: boolean;
}

/** The file table of one asar archive. */
interface AsarIndex {
  archive: string;
  /** Offset of the first file payload; every entry offset is relative to it. */
  dataOffset: number;
  files: Map<string, AsarEntry>;
}

/** An asar directory node as decoded from the archive header. */
interface AsarNode {
  files?: Record<string, AsarNode | undefined>;
  size?: number;
  offset?: string | number;
  unpacked?: boolean;
}

/**
 * Decodes the JSON file table of an asar archive. Node cannot read through an
 * asar path, so the archive header is parsed here instead: a uint32 header size
 * at byte 4, the JSON length at byte 12, and the JSON itself from byte 16.
 */
function readAsarIndex(archive: string): AsarIndex {
  const handle = openSync(archive, "r");
  try {
    const header = Buffer.alloc(16);
    readSync(handle, header, 0, header.length, 0);
    const headerSize = header.readUInt32LE(4);
    const jsonSize = header.readUInt32LE(12);
    if (headerSize === 0 || jsonSize === 0) throw new Error("not an asar archive");
    const json = Buffer.alloc(jsonSize);
    readSync(handle, json, 0, jsonSize, 16);
    const files = new Map<string, AsarEntry>();
    const visit = (node: AsarNode, prefix: string): void => {
      for (const [name, child] of Object.entries(node.files ?? {})) {
        if (!child) continue;
        const path = prefix === "" ? name : prefix + "/" + name;
        if (child.files) {
          visit(child, path);
          continue;
        }
        files.set(path, {
          size: child.size ?? 0,
          offset: Number(child.offset ?? 0),
          unpacked: child.unpacked === true,
        });
      }
    };
    visit(JSON.parse(json.toString("utf8")) as AsarNode, "");
    return { archive, dataOffset: 8 + headerSize, files };
  } finally {
    closeSync(handle);
  }
}

/** Reads one file out of an asar archive, or null when the archive has no such file. */
function asarText(index: AsarIndex, path: string): string | null {
  const entry = index.files.get(path);
  if (!entry) return null;
  if (entry.unpacked) {
    const unpacked = join(index.archive + ".unpacked", ...path.split("/"));
    return existsSync(unpacked) ? readFileSync(unpacked, "utf8") : null;
  }
  const handle = openSync(index.archive, "r");
  try {
    const buffer = Buffer.alloc(entry.size);
    readSync(handle, buffer, 0, entry.size, index.dataOffset + entry.offset);
    return buffer.toString("utf8");
  } finally {
    closeSync(handle);
  }
}

/** Builds an origin from the preset files in a plain directory. */
function directoryOrigin(directory: string): Origin | null {
  const presetFile = (stem: string): string => join(directory, stem + ".patch.yml");
  if (!existsSync(presetFile("standard")) || !existsSync(presetFile("ptc"))) return null;
  let version = "unknown";
  try {
    version = packageVersion(readFileSync(join(dirname(directory), "package.json"), "utf8"));
  } catch {
    version = "unknown";
  }
  return {
    label: directory,
    version,
    has: (stem) => existsSync(presetFile(stem)),
    read: (stem) => readFileSync(presetFile(stem), "utf8"),
  };
}

/** Builds an origin from the preset files inside an asar archive. */
function asarOrigin(archive: string): Origin | null {
  let index: AsarIndex;
  try {
    index = readAsarIndex(archive);
  } catch {
    return null;
  }
  // The desktop app nests the runtime under dsh/, an npm install does not.
  for (const prefix of ["dsh/", ""]) {
    const packageRoot = prefix + "node_modules/@deepseek-ai/dsh-web-app";
    const directory = packageRoot + "/presets";
    if (!index.files.has(directory + "/standard.patch.yml")) continue;
    if (!index.files.has(directory + "/ptc.patch.yml")) continue;
    return {
      label: archive + "!/" + directory,
      version: packageVersion(asarText(index, packageRoot + "/package.json")),
      has: (stem) => index.files.has(directory + "/" + stem + ".patch.yml"),
      read: (stem) => {
        const text = asarText(index, directory + "/" + stem + ".patch.yml");
        if (text === null) throw new Error(directory + "/" + stem + ".patch.yml is missing");
        return text;
      },
    };
  }
  return null;
}

/** Resolves any supported source path, or null when it carries no preset file. */
function originFromPath(path: string): Origin | null {
  const resolved = resolve(path);
  let isFile: boolean;
  try {
    isFile = !statSync(resolved).isDirectory();
  } catch {
    return null;
  }
  if (isFile) return resolved.endsWith(".asar") ? asarOrigin(resolved) : null;
  return (
    directoryOrigin(resolved) ??
    directoryOrigin(join(resolved, "presets")) ??
    directoryOrigin(join(resolved, "node_modules", "@deepseek-ai", "dsh-web-app", "presets")) ??
    (existsSync(join(resolved, "app.asar")) ? asarOrigin(join(resolved, "app.asar")) : null)
  );
}

/** The DSH home that owns profiles and installed plugin packages. */
function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim();
  return configured ? configured : join(homedir(), ".dsh");
}

/** Preset directories of the CLI's installed runtimes. */
function profilePresetDirectories(): string[] {
  const profiles = join(dshHome(), "profiles");
  const directories: string[] = [];
  for (const entry of readDirectory(profiles)) {
    const root = join(profiles, entry);
    directories.push(join(root, "node_modules", "@deepseek-ai", "dsh-web-app", "presets"));
    directories.push(join(root, "dsh", "node_modules", "@deepseek-ai", "dsh-web-app", "presets"));
  }
  directories.push(join(profiles, "node_modules", "@deepseek-ai", "dsh-web-app", "presets"));
  return directories;
}

/** Every place a DSH install can keep its preset files, most authoritative first. */
function candidatePaths(): string[] {
  const home = homedir();
  const paths: string[] = [];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    paths.push(
      join(process.env.LOCALAPPDATA, "Programs", "DeepSeek Harness", "resources", "app.asar"),
    );
  }
  if (process.platform === "darwin") {
    paths.push("/Applications/DeepSeek Harness.app/Contents/Resources/app.asar");
    paths.push(
      join(home, "Applications", "DeepSeek Harness.app", "Contents", "Resources", "app.asar"),
    );
  }
  if (process.platform === "linux") {
    paths.push("/opt/DeepSeek Harness/resources/app.asar");
    paths.push(join(home, ".local", "share", "deepseek-harness", "resources", "app.asar"));
  }
  paths.push(...profilePresetDirectories());
  let current = process.cwd();
  for (let depth = 0; depth < 4; depth += 1) {
    paths.push(join(current, "node_modules", "@deepseek-ai", "dsh-web-app", "presets"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [...new Set(paths)];
}

/** Picks the origin to sync from plus every other candidate that also qualifies. */
function pickOrigin(explicit: string | undefined): { origin: Origin; alternatives: Origin[] } {
  if (explicit) {
    const origin = originFromPath(explicit);
    if (!origin) {
      fail(
        explicit +
          " does not carry the DSH preset files (expected standard.patch.yml and ptc.patch.yml, " +
          "a dsh-web-app package directory, or an app.asar archive)",
      );
    }
    return { origin, alternatives: [] };
  }
  const found: Origin[] = [];
  for (const path of candidatePaths()) {
    const origin = originFromPath(path);
    if (origin) found.push(origin);
  }
  const [origin, ...alternatives] = found;
  if (!origin) {
    fail(
      "cannot find a DSH install that ships the preset files. Tried:\n  " +
        candidatePaths().join("\n  ") +
        "\nPass --source <path> to point at one.",
    );
  }
  return { origin, alternatives };
}

/** The generated comment block that explains where the file came from. */
function header(spec: PresetSpec, origin: Origin): string[] {
  return [
    "# Agent preset " + spec.name + ": GENERATED FILE - edit scripts/sync-presets.ts instead.",
    "#",
    "# Copied from the " +
      spec.source +
      " preset shipped with @deepseek-ai/dsh-web-app " +
      origin.version +
      ".",
    "#",
    "# Regenerate: mise run sync-presets",
    "#             node scripts/sync-presets.ts " + spec.source,
    "#",
    "# Two edits on top of the shipped list: its " +
      spec.replacedRow +
      " row becomes mcp-exa, so an",
    "# Agent that selects this preset gets mcp__exa__* instead of the native web tools and",
    "# their prompt guidance. The declaration also carries this preset's own identity:",
    "# config.id is what sessions save and config.name is what the roster shows.",
    "#",
    "# The host web service and its providers stay on the host plane: a preset controls",
    "# only the tools its Agent sees.",
  ];
}

/** The Exa MCP client row that replaces the shipped web tool row. */
function exaRow(rowIndent: number): string[] {
  const row = pad(rowIndent);
  const key = pad(rowIndent + 2);
  const value = pad(rowIndent + 4);
  return [
    row + "# Exa hosted MCP, scoped to this preset: its tools register on the",
    row + "# preset's own tool scope, so only this preset's Agents see them.",
    row + "# EXA_API_KEY comes from the process environment ($DSH_HOME/.env or",
    row + "# the shell that launched dsh); restart after changing it.",
    row + "- id: mcp-exa",
    key + 'name: "@deepseek-ai/dsh-mcp-client"',
    key + "config:",
    value + "serverName: exa",
    value + "transport: streamable-http",
    value + "url: https://mcp.exa.ai/mcp",
    value +
      "headers: !!js 'process.env.EXA_API_KEY ? { \"x-api-key\": process.env.EXA_API_KEY } : {}'",
  ];
}

/** Splits the plugin list of a shipped preset into rows, attaching each leading comment to its row. */
function readPluginRows(
  lines: string[],
  pluginsIndex: number,
  rowIndent: number,
): { rows: PluginRow[]; end: number } {
  const rows: PluginRow[] = [];
  const pending: string[] = [];
  let current: PluginRow | null = null;
  let cursor = pluginsIndex + 1;
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() === "") {
      (current ? current.lines : pending).push(line);
      continue;
    }
    const indent = indentOf(line);
    if (indent < rowIndent) break;
    if (indent === rowIndent && line.trimStart().startsWith("#")) {
      pending.push(line);
      continue;
    }
    if (indent === rowIndent) {
      const match = /^- id: (.+)$/.exec(line.trimStart());
      if (!match) {
        throw new Error(
          "line " + (cursor + 1) + ': expected a plugin row, found "' + line.trim() + '"',
        );
      }
      if (current) rows.push(current);
      current = { id: match[1].trim(), lines: [...pending, line] };
      pending.length = 0;
      continue;
    }
    if (!current) throw new Error("line " + (cursor + 1) + ": plugin content before the first row");
    current.lines.push(line);
  }
  if (current) rows.push(current);
  return { rows, end: cursor };
}

/** Rewrites the shipped single-quoted plugin names as double-quoted ones, matching this package. */
function normalizeQuotes(text: string): string {
  return text.replace(/^(\s*name:\s*)'([^']*)'$/gm, '$1"$2"');
}

/** Fails when the generated text no longer has the shape this bundle relies on. */
function validate(text: string, spec: PresetSpec): void {
  const count = (pattern: RegExp): number => (text.match(pattern) ?? []).length;
  if (!text.startsWith("# Agent preset ")) throw new Error("the generated file lost its header");
  if (count(/^\s*- id: tool-web$/gm) !== 0) throw new Error("the tool-web row survived");
  if (count(/^\s*- id: mcp-exa$/gm) !== 1) throw new Error("expected exactly one mcp-exa row");
  if (count(new RegExp("^\\s*- id: " + escapeRegExp(spec.declarationId) + "$", "gm")) !== 1) {
    throw new Error("expected exactly one " + spec.declarationId + " declaration");
  }
  if (count(new RegExp("^\\s*id: " + escapeRegExp(spec.id) + "$", "gm")) !== 1) {
    throw new Error("expected exactly one id: " + spec.id);
  }
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    throw new Error("the generated file must end with exactly one newline");
  }
}

/** Builds the replacement file for one preset from the shipped text. */
function generate(spec: PresetSpec, shipped: string, origin: Origin): string {
  const lines = shipped.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const insertIndex = lines.findIndex((line) => line.trim() === "- insert:");
  if (insertIndex < 0) throw new Error("no - insert: row");

  const declarationIndex = lines.findIndex(
    (line, index) =>
      index > insertIndex && indentOf(line) > 0 && line.trimStart().startsWith("- id: "),
  );
  if (declarationIndex < 0) throw new Error("no declaration row under - insert:");
  const declarationId = lines[declarationIndex].trim().slice("- id: ".length);
  if (declarationId !== "preset-" + spec.source) {
    throw new Error(
      "expected the preset-" + spec.source + ' declaration, found "' + declarationId + '"',
    );
  }

  const declarationIndent = indentOf(lines[declarationIndex]);
  const configKeyIndent = declarationIndent + 2;
  const fieldIndent = declarationIndent + 4;
  const configIndex = lines.findIndex(
    (line, index) =>
      index > declarationIndex && indentOf(line) === configKeyIndent && line.trim() === "config:",
  );
  if (configIndex < 0) throw new Error("the declaration has no config: block");

  const fieldIndex = (name: string): number =>
    lines.findIndex(
      (line, index) =>
        index > configIndex &&
        indentOf(line) === fieldIndent &&
        line.startsWith(pad(fieldIndent) + name + ": "),
    );
  const idIndex = fieldIndex("id");
  const orderIndex = fieldIndex("order");
  if (idIndex < 0) throw new Error("the declaration config has no id:");
  const pluginsIndex = lines.findIndex(
    (line, index) =>
      index > configIndex && indentOf(line) === fieldIndent && line.trim() === "plugins:",
  );
  if (pluginsIndex < 0) throw new Error("the declaration config has no plugins: list");

  const rowIndent = fieldIndent + 2;
  const { rows, end: rowsEnd } = readPluginRows(lines, pluginsIndex, rowIndent);
  if (rows.length === 0) throw new Error("the shipped plugin list is empty");

  const replacedIndex = rows.findIndex((row) => row.id === spec.replacedRow);
  if (replacedIndex < 0) {
    throw new Error(
      "the shipped " +
        spec.source +
        " preset has no " +
        spec.replacedRow +
        " row to replace with mcp-exa; " +
        "update the replacement in scripts/sync-presets.ts",
    );
  }
  rows.splice(replacedIndex, 1, { id: "mcp-exa", lines: exaRow(rowIndent) });

  // Rewrite the declaration identity in its own copy of the lines, so the row
  // indices above stay valid.
  const head = lines.slice(insertIndex, pluginsIndex + 1);
  head[declarationIndex - insertIndex] = pad(declarationIndent) + "- id: " + spec.declarationId;
  head[idIndex - insertIndex] = pad(fieldIndent) + "id: " + spec.id;
  const identity = [
    pad(fieldIndent) + "name: " + spec.name,
    pad(fieldIndent) + "description: " + spec.description,
    pad(fieldIndent) + "order: " + spec.order,
  ];
  if (orderIndex >= 0) head.splice(orderIndex - insertIndex, 1, ...identity);
  else head.splice(idIndex - insertIndex + 1, 0, ...identity);

  const body = [
    ...header(spec, origin),
    ...head,
    ...rows.flatMap((row) => row.lines),
    ...lines.slice(rowsEnd),
  ];
  const text = normalizeQuotes(body.join("\n").replace(/\n+$/, "")) + "\n";
  validate(text, spec);
  return text;
}

/** Parses the command line; every argument is optional. */
function parseArguments(argv: string[]): {
  presets: string[];
  check: boolean;
  source?: string;
  help: boolean;
} {
  const presets: string[] = [];
  let check = false;
  let source: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") check = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument === "--source") {
      source = argv[index + 1];
      if (!source) fail("--source needs a path");
      index += 1;
    } else if (argument.startsWith("--source=")) source = argument.slice("--source=".length);
    else if (argument.startsWith("-")) fail("unknown option " + argument + "\n\n" + USAGE);
    else presets.push(argument);
  }
  return { presets, check, source, help };
}

/** Maps the requested preset names onto the specs this bundle publishes. */
function selectPresets(names: string[]): PresetSpec[] {
  if (names.length === 0) return PRESETS;
  const selected: PresetSpec[] = [];
  for (const name of names) {
    const spec = PRESETS.find(
      (candidate) =>
        candidate.source === name ||
        candidate.id === name ||
        candidate.output === name ||
        candidate.output === name + ".patch.yml",
    );
    if (!spec) {
      fail(
        'unknown preset "' +
          name +
          '"; known presets: ' +
          PRESETS.map((candidate) => candidate.source).join(", "),
      );
    }
    if (!selected.includes(spec)) selected.push(spec);
  }
  return selected;
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const { origin, alternatives } = pickOrigin(options.source ?? process.env.DSH_PRESETS_SOURCE);
for (const alternative of alternatives) {
  if (alternative.version !== origin.version) {
    console.warn(
      "warning: also found @deepseek-ai/dsh-web-app " +
        alternative.version +
        " at " +
        alternative.label +
        "; " +
        "syncing from the first match instead. Pass --source to choose.",
    );
  }
}
console.log("source: " + origin.label + " (@deepseek-ai/dsh-web-app " + origin.version + ")");

let stale = 0;
for (const spec of selectPresets(options.presets)) {
  if (!origin.has(spec.source)) fail("the source has no " + spec.source + ".patch.yml");
  const generated = generate(spec, origin.read(spec.source), origin);
  const destination = join(PRESETS_DIR, spec.output);
  const current = existsSync(destination) ? readFileSync(destination, "utf8") : null;
  if (current === generated) {
    console.log("up to date  presets/" + spec.output);
    continue;
  }
  if (options.check) {
    stale += 1;
    console.log("stale       presets/" + spec.output);
    continue;
  }
  writeFileSync(destination, generated);
  console.log("wrote       presets/" + spec.output);
}

if (stale > 0) {
  console.error(
    stale + " preset file(s) are out of date; run this script without --check to regenerate.",
  );
  process.exitCode = 1;
}
