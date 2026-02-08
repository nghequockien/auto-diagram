// External JS for index_beautiful.html
const errorEl = document.getElementById("error");
const img = document.getElementById("preview");
const statusEl = document.getElementById("status");
const editorDiv = document.getElementById("editor");
const previewContainer = document.getElementById("previewContainer");
const zoomLevelEl = document.getElementById("zoomLevel");

let editor;
let timer = null;
let lastHash = null;
let currentZoom = 1;
const zoomStep = 0.1;
const minZoom = 0.5;
const maxZoom = 2;

// Color hex pattern for detecting color codes
const hexColorRegex = /#[0-9a-fA-F]{6}\b/g;

let colorPickerData = null;
let globalColorInput = null;

function initColorPicker() {
  // Create a persistent color input that will be reused
  if (!globalColorInput) {
    globalColorInput = document.createElement("input");
    globalColorInput.type = "color";
    globalColorInput.style.display = "none";
    globalColorInput.style.visibility = "hidden";
    globalColorInput.style.position = "absolute";
    globalColorInput.style.left = "-9999px";
    document.body.appendChild(globalColorInput);
  }
}

function createColorPicker(initialColor, callback) {
  initColorPicker();
  
  // Set the color value
  globalColorInput.value = initialColor;
  
  let handled = false;
  
  // Create local handlers for this specific picker invocation
  const handleColorChange = () => {
    if (handled) return;
    handled = true;
    
    const selectedColor = globalColorInput.value.toUpperCase();
    callback(selectedColor);
    
    // Ensure input is removed from focus
    globalColorInput.blur();
    
    // Reset for next use
    setTimeout(() => {
      if (globalColorInput) {
        globalColorInput.value = "#000000";
      }
    }, 100);
  };
  
  const handleCancel = () => {
    if (!handled) {
      globalColorInput.blur();
    }
  };
  
  // Add one-time event listeners
  globalColorInput.addEventListener("change", handleColorChange, { once: true });
  globalColorInput.addEventListener("cancel", handleCancel, { once: true });
  
  // Also add input event for real-time detection
  const handleInput = () => {
    if (!handled && globalColorInput.value !== initialColor) {
      handleColorChange();
    }
  };
  globalColorInput.addEventListener("input", handleInput, { once: true });
  
  // Trigger the color picker
  setTimeout(() => {
    globalColorInput.click();
    // Force focus to ensure picker opens
    globalColorInput.focus();
  }, 0);
}

function handleColorPicked(newColor) {
  if (!colorPickerData || !editor) return;
  
  const { lineNumber, colorHex } = colorPickerData;
  
  const model = editor.getModel();
  const lineContent = model.getLineContent(lineNumber);
  const colorStart = lineContent.indexOf(colorHex);
  
  if (colorStart !== -1) {
    // Replace the old color with the new one
    const range = new monaco.Range(
      lineNumber,
      colorStart + 1,
      lineNumber,
      colorStart + colorHex.length + 1
    );
    model.applyEdits([{
      range: range,
      text: newColor
    }]);
    
    // Trigger re-decoration and render
    setTimeout(() => {
      updateColorDecorations();
      debounceRender();
      editor.focus();
    }, 100);
  }
  
  colorPickerData = null;
}

function updateColorDecorations() {
  if (!editor) return;
  
  const text = editor.getValue();
  const decorations = [];
  const colors = new Set();
  let match;
  
  // Reset regex lastIndex
  hexColorRegex.lastIndex = 0;
  
  while ((match = hexColorRegex.exec(text)) !== null) {
    const color = match[0];
    const startOffset = match.index;
    const endOffset = match.index + color.length;
    colors.add(color);
    
    // Convert offset to line/column
    const startPos = editor.getModel().getPositionAt(startOffset);
    const endPos = editor.getModel().getPositionAt(endOffset);
    
    // Validate hex color
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue;
    
    // Create decoration with glyph margin color and hover message
    decorations.push({
      range: new monaco.Range(startPos.lineNumber, startPos.column, startPos.lineNumber, startPos.column),
      options: {
        isWholeLine: false,
        glyphMarginClassName: "color-picker-glyph",
        glyphMarginHoverMessage: { value: `Click to pick a new color\n\nCurrent: ${color}` },
        glyphMarginBackgroundColor: color,
        minimap: {
          color: color,
          position: 2
        },
        hoverMessage: { value: `🎨 Click hex code to pick color\n\n${color}` }
      }
    });
    
    // Add inline decoration with color swatch
    const sanitizedColor = color.replace('#', '');
    decorations.push({
      range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
      options: {
        isWholeLine: false,
        className: "color-hex-code",
        inlineClassName: `color-hex-inline color-${sanitizedColor}`,
        hoverMessage: { value: `Click to pick color: ${color}` }
      }
    });
  }
  
  // Inject CSS for color swatches
  injectColorStyles(colors);
  
  // Store decorations to update them
  if (!window.colorDecorationIds) {
    window.colorDecorationIds = [];
  }
  window.colorDecorationIds = editor.deltaDecorations(window.colorDecorationIds || [], decorations);
}

function injectColorStyles(colors) {
  // Get or create a style element for color swatches
  let styleEl = document.getElementById('color-swatch-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'color-swatch-styles';
    document.head.appendChild(styleEl);
  }
  
  // Generate CSS for each color
  let css = '';
  colors.forEach(color => {
    const sanitized = color.replace('#', '');
    css += `.color-${sanitized}::after { background-color: ${color} !important; }\n`;
  });
  
  styleEl.textContent = css;
}

function setStatus(msg, ok = false) {
  statusEl.textContent = msg || "";
  statusEl.className = ok ? "status ok" : "status";
}

function stableHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function getJsonText() {
  return editor ? editor.getValue() : "";
}
function setJsonText(v) {
  if (editor) editor.setValue(v);
}

function formatJson() {
  errorEl.textContent = "";
  try {
    const obj = JSON.parse(getJsonText());
    setJsonText(JSON.stringify(obj, null, 2));
  } catch (e) {
    errorEl.textContent = "JSON format error:\n" + e.message;
  }
}

function minifyJson() {
  errorEl.textContent = "";
  try {
    const obj = JSON.parse(getJsonText());
    setJsonText(JSON.stringify(obj));
  } catch (e) {
    errorEl.textContent = "JSON minify error:\n" + e.message;
  }
}

function toggleMinimize(btn) {
  document.body.classList.toggle("editor-minimized");
  if (btn && btn.tagName === 'BUTTON') {
    btn.textContent = document.body.classList.contains("editor-minimized") ? "▶" : "▼";
  }
}

function updateZoomDisplay() {
  zoomLevelEl.textContent = Math.round(currentZoom * 100) + "%";
  if (img && img.src) {
    img.style.transform = `scale(${currentZoom})`;
  }
}

function zoomIn() {
  if (currentZoom < maxZoom) {
    currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
    updateZoomDisplay();
  }
}

function zoomOut() {
  if (currentZoom > minZoom) {
    currentZoom = Math.max(currentZoom - zoomStep, minZoom);
    updateZoomDisplay();
  }
}

function zoomReset() {
  currentZoom = 1;
  updateZoomDisplay();
}

async function renderNow(force = false) {
  errorEl.textContent = "";
  setStatus("Rendering...");

  let payload;
  let normalized;
  try {
    payload = JSON.parse(getJsonText());
    normalized = JSON.stringify(payload);
  } catch (e) {
    errorEl.textContent = "JSON parse error:\n" + e.message;
    setStatus("Fix JSON error");
    return;
  }

  const h = stableHash(normalized);
  if (!force && lastHash === h) {
    setStatus("No change (skipped)", true);
    return;
  }
  lastHash = h;

  try {
    const res = await fetch("/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: normalized,
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const j = await res.json();
        throw new Error(j.error || "HTTP " + res.status);
      }
      throw new Error("HTTP " + res.status);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    img.src = url;
    
    // Reset zoom on new render
    currentZoom = 1;
    updateZoomDisplay();

    setStatus("Rendered ✓", true);
  } catch (e) {
    errorEl.textContent = "Render error:\n" + e.message;
    setStatus("Render failed");
  }
}

function debounceRender() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => renderNow(false), 600);
}

// Load Monaco after RequireJS (RequireJS script is in the HTML head)
require.config({ paths: { vs: window.MONACO_BASE + "/vs" } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(editorDiv, {
    value: JSON.stringify(
      {
        graph: {
          title: "Live Diagram",
          direction: "LR",
          graph_attr: { pad: "0.6", nodesep: "0.5", ranksep: "0.7" },
          node_attr: { fontsize: "12" },
          edge_attr: { fontsize: "11" },
        },
        defaults: { edge_attributes: { color: "#424242" } },
        nodes: [
          { id: "user", label: "User", node_class: "diagrams.onprem.client.Users" },
          { id: "api", label: "API", node_class: "diagrams.onprem.compute.Server" },
          { id: "db", label: "DB", node_class: "diagrams.onprem.database.Mysql" },
        ],
        clusters: [
          {
            name: "Application",
            graph_attr: { style: "rounded,filled", color: "#43A047", penwidth: "2" },
            node_ids: ["api"],
          },
          {
            name: "Data",
            graph_attr: { style: "rounded,filled", color: "#FB8C00", penwidth: "2" },
            node_ids: ["db"],
          },
        ],
        edges: [
          { from: "user", to: "api", attributes: { label: "HTTPS" } },
          { from: "api", to: "db", attributes: { label: "SQL", color: "#6D4C41" } },
        ],
      },
      null,
      2
    ),
    language: "json",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    tabSize: 2,
    scrollBeyondLastLine: false,
  });

  editor.onDidChangeModelContent(() => {
    updateColorDecorations();
    debounceRender();
  });

  // Initialize color picker
  initColorPicker();

  // Handle click on hex colors to open color picker
  editor.onMouseDown((e) => {
    // Check if clicked on a glyph margin with color picker
    if (e.target.type === monaco.editor.MouseTargetType.GLYPH_MARGIN) {
      const pos = e.target.position;
      const line = editor.getModel().getLineContent(pos.lineNumber);
      
      // Find hex color on this line
      const hexMatch = /#[0-9a-fA-F]{6}\b/.exec(line);
      if (hexMatch) {
        const colorHex = hexMatch[0];
        const lineNumber = pos.lineNumber;
        
        colorPickerData = { lineNumber, colorHex };
        createColorPicker(colorHex, handleColorPicked);
        return;
      }
    }
    
    // Also allow clicking directly on the hex code text
    if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
      const pos = e.target.position;
      const line = editor.getModel().getLineContent(pos.lineNumber);
      
      // Find all hex codes on this line
      let hexMatch;
      const hexRegex = /#[0-9a-fA-F]{6}\b/g;
      while ((hexMatch = hexRegex.exec(line)) !== null) {
        const startCol = hexMatch.index + 1; // Monaco columns are 1-indexed
        const endCol = hexMatch.index + hexMatch[0].length + 1;
        
        // Check if click is within this hex code
        if (pos.column >= startCol && pos.column <= endCol) {
          const colorHex = hexMatch[0];
          const lineNumber = pos.lineNumber;
          
          colorPickerData = { lineNumber, colorHex };
          createColorPicker(colorHex, handleColorPicked);
          return;
        }
      }
    }
  });

  // Initial render and color decoration
  updateColorDecorations();
  renderNow(true);
});

// Expose a few functions globally for toolbar buttons
window.renderNow = renderNow;
window.formatJson = formatJson;
window.minifyJson = minifyJson;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.zoomReset = zoomReset;

// Add mouse wheel zoom support
previewContainer.addEventListener("wheel", (e) => {
  // Only zoom if Ctrl (Cmd on Mac) is held
  if (!e.ctrlKey && !e.metaKey) return;
  
  e.preventDefault();
  if (e.deltaY < 0) {
    zoomIn();
  } else {
    zoomOut();
  }
});
