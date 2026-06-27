"use strict";

// ── State ────────────────────────────────────────────────────────────────────
const STATE = {
  widgetName:        "MyWidget",
  bundleId:          "com.example.MyApp.MyWidget",
  displayName:       "My Widget",
  description:       "A helpful widget.",
  configurationType: "static",   // static | intent | appIntent
  refreshKind:       "atEnd",    // atEnd | after | never
  refreshMinutes:    30,
  sizes: new Set(["systemSmall", "systemMedium"]),
  entryFields: [
    { id: 1, name: "title",  type: "String", sample: "Hello, World!" },
    { id: 2, name: "value",  type: "Int",    sample: "42" },
  ],
  outputTab: "main",
};

let _uid = 3;
function uid() { return _uid++; }

const SIZE_LABELS = {
  systemSmall:          "System Small",
  systemMedium:         "System Medium",
  systemLarge:          "System Large",
  systemExtraLarge:     "System Extra Large (iPad)",
  accessoryCircular:    "Accessory Circular (Lock Screen)",
  accessoryRectangular: "Accessory Rectangular (Lock Screen)",
  accessoryInline:      "Accessory Inline (Lock Screen)",
};

const SWIFT_TYPES = ["String","Int","Double","Bool","Date","URL","UUID"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function defaultValueFor(type) {
  switch(type) {
    case "String": return '""';
    case "Int":    return "0";
    case "Double": return "0.0";
    case "Bool":   return "false";
    case "Date":   return "Date()";
    case "URL":    return 'URL(string: "https://example.com")!';
    case "UUID":   return "UUID()";
    default:       return '""';
  }
}

// ── Collect ──────────────────────────────────────────────────────────────────
function collect() {
  STATE.widgetName        = el("inp_widgetName").value.trim() || "MyWidget";
  STATE.bundleId          = el("inp_bundleId").value.trim() || "com.example.MyApp.MyWidget";
  STATE.displayName       = el("inp_displayName").value.trim() || "My Widget";
  STATE.description       = el("inp_description").value.trim() || "A helpful widget.";
  STATE.configurationType = el("inp_configType").value;
  STATE.refreshKind       = el("inp_refreshKind").value;
  STATE.refreshMinutes    = parseInt(el("inp_refreshMinutes").value) || 30;
}

function toggleSize(size, checked) {
  if (checked) STATE.sizes.add(size);
  else STATE.sizes.delete(size);
  generate();
}

function addEntryField() {
  STATE.entryFields.push({ id: uid(), name: "field" + STATE.entryFields.length, type: "String", sample: "" });
  renderEntryFields();
  generate();
}
function removeEntryField(id) {
  STATE.entryFields = STATE.entryFields.filter(f => f.id !== id);
  renderEntryFields();
  generate();
}
function updateField(id, key, val) {
  const f = STATE.entryFields.find(x => x.id === id);
  if (f) { f[key] = val; generate(); }
}

// ── Render entry fields editor ───────────────────────────────────────────────
function renderEntryFields() {
  const wrap = el("entryFields");
  if (!wrap) return;
  wrap.innerHTML = STATE.entryFields.map(f => `
    <div class="field-row">
      <input type="text" class="field-name" value="${esc(f.name)}"
        placeholder="fieldName" oninput="updateField(${f.id},'name',this.value)" />
      <select onchange="updateField(${f.id},'type',this.value)">
        ${SWIFT_TYPES.map(t => `<option value="${t}" ${f.type===t?"selected":""}>${t}</option>`).join("")}
      </select>
      <input type="text" class="field-sample" value="${esc(f.sample)}"
        placeholder="sample value" oninput="updateField(${f.id},'sample',this.value)" />
      <button class="rm-btn" onclick="removeEntryField(${f.id})">✕</button>
    </div>`).join("");
}

// ── Code generation ──────────────────────────────────────────────────────────
function generate() {
  collect();
  const tab = STATE.outputTab;
  if (tab === "main")   el("output").textContent = generateMain();
  if (tab === "view")   el("output").textContent = generateView();
  if (tab === "bundle") el("output").textContent = generateBundle();
  if (tab === "plist")  el("output").textContent = generatePlist();
}

function sizesArray() {
  const order = Object.keys(SIZE_LABELS);
  return order.filter(s => STATE.sizes.has(s));
}

function entryStructCode() {
  const fields = STATE.entryFields;
  const lines = [
    `struct ${STATE.widgetName}Entry: TimelineEntry {`,
    `    let date: Date`,
    ...fields.map(f => `    let ${f.name}: ${f.type}`),
    `}`,
  ];
  return lines.join("\n");
}

function snapshotEntry() {
  const fields = STATE.entryFields;
  const args = ["date: Date()", ...fields.map(f => `${f.name}: ${defaultValueFor(f.type)}`)];
  return `${STATE.widgetName}Entry(${args.join(", ")})`;
}

function generateMain() {
  const n = STATE.widgetName;
  const sizes = sizesArray();
  const sizeCode = sizes.length === 1
    ? `        .supportedFamilies([.${sizes[0]}])`
    : "        .supportedFamilies([\n" + sizes.map(s => `            .${s}`).join(",\n") + "\n        ])";

  let providerProtocol = "TimelineProvider";
  let intentPart = "";
  if (STATE.configurationType === "intent") {
    providerProtocol = "IntentTimelineProvider";
    intentPart = ", configuration: ConfigurationIntent";
  } else if (STATE.configurationType === "appIntent") {
    providerProtocol = "AppIntentTimelineProvider";
    intentPart = ", configuration: ${n}Configuration";
  }

  let refreshCode = "";
  if (STATE.refreshKind === "atEnd") {
    refreshCode = `        let nextUpdate = Calendar.current.date(byAdding: .minute, value: ${STATE.refreshMinutes}, to: Date())!
        let timeline = Timeline(entries: entries, policy: .atEnd)`;
  } else if (STATE.refreshKind === "after") {
    refreshCode = `        let nextUpdate = Calendar.current.date(byAdding: .minute, value: ${STATE.refreshMinutes}, to: Date())!
        let timeline = Timeline(entries: entries, policy: .after(nextUpdate))`;
  } else {
    refreshCode = `        let timeline = Timeline(entries: entries, policy: .never)`;
  }

  const fields = STATE.entryFields;
  const snapshotArgs = ["date: Date()", ...fields.map(f => `${f.name}: ${defaultValueFor(f.type)}`)];

  return `import WidgetKit
import SwiftUI

// MARK: - Entry

${entryStructCode()}

// MARK: - Provider

struct ${n}Provider: ${providerProtocol} {

    func placeholder(in context: Context) -> ${n}Entry {
        ${snapshotEntry()}
    }

    func getSnapshot(${intentPart ? "for configuration: " + (STATE.configurationType === "appIntent" ? n + "Configuration" : "ConfigurationIntent") + ", " : ""}in context: Context, completion: @escaping (${n}Entry) -> Void) {
        let entry = ${snapshotEntry()}
        completion(entry)
    }

    func getTimeline(${intentPart ? "for configuration: " + (STATE.configurationType === "appIntent" ? n + "Configuration" : "ConfigurationIntent") + ", " : ""}in context: Context, completion: @escaping (Timeline<${n}Entry>) -> Void) {
        var entries: [${n}Entry] = []

        // Generate a timeline with sample entries
        let currentDate = Date()
        for hourOffset in 0 ..< 5 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
            let entry = ${n}Entry(
                date: entryDate${fields.map(f => `,\n                ${f.name}: ${defaultValueFor(f.type)}`).join("")}
            )
            entries.append(entry)
        }

${refreshCode}
        completion(timeline)
    }
}

// MARK: - Widget

struct ${n}: Widget {
    let kind: String = "${n}"

    var body: some WidgetConfiguration {
        ${STATE.configurationType === "static" ? "StaticConfiguration" : STATE.configurationType === "intent" ? "IntentConfiguration" : "AppIntentConfiguration"}(
            kind: kind,
            ${STATE.configurationType === "intent" ? "intent: ConfigurationIntent.self,\n            " : STATE.configurationType === "appIntent" ? "intent: ${n}Configuration.self,\n            " : ""}provider: ${n}Provider()
        ) { entry in
            ${n}WidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("${STATE.displayName}")
        .description("${STATE.description}")
${sizeCode}
    }
}

// MARK: - Preview

#Preview(as: .systemSmall) {
    ${n}()
} timeline: {
    ${snapshotEntry()}
}`;
}

function generateView() {
  const n = STATE.widgetName;
  const fields = STATE.entryFields;
  return `import SwiftUI
import WidgetKit

struct ${n}WidgetView: View {
    var entry: ${n}Provider.Entry
    @Environment(\\.widgetFamily) var widgetFamily

    var body: some View {
        switch widgetFamily {
${sizesArray().map(s => `        case .${s}:\n            ${s}View(entry: entry)`).join("\n")}
        default:
            // Fallback for unexpected families
            Text(entry.date, style: .time)
        }
    }
}

// MARK: - Size-specific Views

${sizesArray().map(s => `struct ${s.charAt(0).toUpperCase() + s.slice(1)}View: View {
    var entry: ${n}Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
${fields.map(f => `            Text("${f.name}: \\(entry.${f.name})")`).join("\n") || "            Text(entry.date, style: .time)"}
        }
        .padding()
    }
}`).join("\n\n")}`;
}

function generateBundle() {
  const n = STATE.widgetName;
  return `import SwiftUI
import WidgetKit

// WidgetBundle — add this file to your Widget Extension target.
// Xcode creates this automatically when you create a new Widget Extension target.

@main
struct ${n}Bundle: WidgetBundle {
    var body: some Widget {
        ${n}()
        // Add more widgets here as needed
    }
}`;
}

function generatePlist() {
  return `<!-- Add these keys to your Widget Extension's Info.plist -->

<!-- If your widget supports Lock Screen (accessory families), declare it: -->
<key>NSExtension</key>
<dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
</dict>

<!-- Ensure your Widget Extension target's Info.plist contains: -->
<key>CFBundleDisplayName</key>
<string>${STATE.displayName}</string>

<!-- In your MAIN app's Info.plist, add the widget extension bundle ID
     to allow the app and widget to share data via App Group:          -->
<!-- (No special key required — set up an App Group in Capabilities)   -->

<!-- Minimum iOS version for WidgetKit: iOS 14.0                       -->
<!-- Lock Screen widgets: iOS 16.0                                      -->
<!-- Live Activities: iOS 16.1                                          -->`;
}

// ── Output tab ────────────────────────────────────────────────────────────────
function switchOutputTab(tab) {
  STATE.outputTab = tab;
  ["main","view","bundle","plist"].forEach(t => {
    el("otab_" + t).classList.toggle("active", t === tab);
  });
  generate();
}

// ── Copy / Download ───────────────────────────────────────────────────────────
function copyOutput() {
  navigator.clipboard.writeText(el("output").textContent).then(() => {
    const b = el("copyBtn");
    const orig = b.textContent;
    b.textContent = "Copied!";
    setTimeout(() => { b.textContent = orig; }, 1500);
  });
}

function downloadOutput() {
  collect();
  const text = el("output").textContent;
  const names = { main: STATE.widgetName + ".swift", view: STATE.widgetName + "View.swift", bundle: STATE.widgetName + "Bundle.swift", plist: "Info-additions.plist" };
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = names[STATE.outputTab] || "widget.swift";
  a.click();
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderEntryFields();
  generate();
});
