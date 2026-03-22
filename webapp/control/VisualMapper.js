/**
 * VisualMapper — Apple-quality drag-and-drop field mapping
 *
 * Usage:
 *   var mapper = new VisualMapper({ container: domElement, onRulesChange: fn });
 *   mapper.setData(sourceFields, targetFields, connections);
 *   mapper.destroy();
 */
sap.ui.define([], function () {
  "use strict";

  /* ──────────────────────────────────────────────
     CSS — injected once, self-contained
     ────────────────────────────────────────────── */
  var CSS_INJECTED = false;
  function injectCSS() {
    if (CSS_INJECTED) return;
    CSS_INJECTED = true;
    var css = [
      /* Container */
      ".vm-root { position:relative; display:flex; gap:0; min-height:200px; user-select:none; font-family:'72',Arial,sans-serif; }",
      ".vm-root * { box-sizing:border-box; }",

      /* Columns */
      ".vm-col { flex:0 0 260px; display:flex; flex-direction:column; gap:4px; padding:12px 8px; z-index:2; border-radius:12px; }",
      ".vm-col-header { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.4px; padding:4px 16px 10px; opacity:.7; }",
      ".vm-src .vm-col-header { color:#60a5fa; }",
      ".vm-tgt .vm-col-header { color:#34d399; }",

      /* SVG area (fills the gap between columns) */
      ".vm-svg-wrap { flex:1; position:relative; min-width:120px; z-index:1; }",
      ".vm-svg-wrap svg { width:100%; height:100%; }",

      /* Nodes */
      ".vm-node { position:relative; display:flex; align-items:center; min-height:44px; padding:4px 14px; border-radius:10px; border:1px solid rgba(120,120,140,.15); background:rgba(255,255,255,.03); backdrop-filter:blur(4px); transition: background .2s, box-shadow .2s, transform .15s, border-color .2s; cursor:default; }",
      ".vm-node:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,.15); }",

      /* Source nodes (left) — SAP fields */
      ".vm-src .vm-node { justify-content:flex-end; text-align:right; padding-right:22px; }",
      ".vm-src .vm-node:hover { background:rgba(59,130,246,.1); border-color:rgba(59,130,246,.3); }",
      ".vm-src .vm-node.vm-connected { background:rgba(59,130,246,.12); border-color:rgba(59,130,246,.35); box-shadow:0 0 12px rgba(59,130,246,.08); }",

      /* Target nodes (right) — 3PL fields */
      ".vm-tgt .vm-node { justify-content:flex-start; text-align:left; padding-left:22px; }",
      ".vm-tgt .vm-node:hover { background:rgba(16,185,129,.1); border-color:rgba(16,185,129,.3); }",
      ".vm-tgt .vm-node.vm-connected { background:rgba(16,185,129,.12); border-color:rgba(16,185,129,.35); box-shadow:0 0 12px rgba(16,185,129,.08); }",

      /* Labels — two-line: short name bold + full path subtle */
      ".vm-label-wrap { display:flex; flex-direction:column; overflow:hidden; max-width:210px; }",
      ".vm-label { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:.2px; }",
      ".vm-label-path { font-size:9.5px; opacity:.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; font-family:monospace; letter-spacing:.3px; }",
      ".vm-src .vm-node.vm-connected .vm-label { color:#93bbfc; }",
      ".vm-tgt .vm-node.vm-connected .vm-label { color:#6ee7b7; }",
      ".vm-src .vm-node.vm-connected .vm-label-path { opacity:.55; color:#93bbfc; }",
      ".vm-tgt .vm-node.vm-connected .vm-label-path { opacity:.55; color:#6ee7b7; }",
      ".vm-sample { font-size:10px; opacity:.45; margin:0 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70px; font-family:monospace; background:rgba(255,255,255,.04); padding:1px 5px; border-radius:4px; }",

      /* Connection dots */
      ".vm-dot { position:absolute; top:50%; width:16px; height:16px; border-radius:50%; border:2.5px solid rgba(120,120,140,.3); background:var(--sapBackgroundColor, #1c2333); transform:translateY(-50%); transition: border-color .2s, box-shadow .25s, transform .2s; cursor:crosshair; z-index:3; }",
      ".vm-dot:hover { border-color:rgba(59,130,246,.8); box-shadow:0 0 0 5px rgba(59,130,246,.18); transform:translateY(-50%) scale(1.3); }",
      ".vm-src .vm-dot { right:-8px; }",
      ".vm-tgt .vm-dot { left:-8px; }",
      ".vm-dot.vm-active { border-color:#3b82f6; background:#3b82f6; box-shadow:0 0 10px rgba(59,130,246,.6); }",
      ".vm-tgt .vm-dot.vm-active { border-color:#10b981; background:#10b981; box-shadow:0 0 10px rgba(16,185,129,.6); }",

      /* Drop target highlight */
      ".vm-dot.vm-drop-target { border-color:#10b981; box-shadow:0 0 0 6px rgba(16,185,129,.2); transform:translateY(-50%) scale(1.35); }",

      /* SVG paths */
      ".vm-path { fill:none; stroke-width:2.5; stroke-linecap:round; opacity:.7; transition: stroke-width .2s, opacity .2s; cursor:pointer; }",
      ".vm-path:hover { stroke-width:4; opacity:1; }",
      ".vm-path.vm-selected { stroke-width:3.5; opacity:1; stroke-dasharray:8 4; animation:vm-dash 1s linear infinite; }",
      "@keyframes vm-dash { to { stroke-dashoffset:-12; } }",

      /* Drag line */
      ".vm-drag-line { fill:none; stroke:#3b82f6; stroke-width:2; stroke-dasharray:6 4; opacity:.7; pointer-events:none; }",

      /* Transform badge (on connection midpoint) */
      ".vm-badge-group { cursor:pointer; }",
      ".vm-badge-bg { fill:var(--sapBackgroundColor, #1c2333); stroke:rgba(120,120,140,.3); stroke-width:1; rx:4; }",
      ".vm-badge-text { font-size:9px; font-weight:600; fill:var(--sapTextColor, #c4c6c9); text-anchor:middle; dominant-baseline:central; pointer-events:none; }",
      ".vm-badge-group:hover .vm-badge-bg { stroke:#3b82f6; fill:rgba(59,130,246,.12); }",

      /* Delete button on connection */
      ".vm-del-group { cursor:pointer; opacity:0; transition:opacity .2s; }",
      ".vm-path:hover ~ .vm-del-group, .vm-badge-group:hover ~ .vm-del-group, .vm-del-group:hover { opacity:1; }",
      ".vm-del-bg { fill:#ef4444; rx:7; }",
      ".vm-del-x { stroke:#fff; stroke-width:1.8; stroke-linecap:round; }",

      /* Transform popover */
      ".vm-popover { position:absolute; z-index:100; background:var(--sapBackgroundColor, #1c2333); border:1px solid rgba(120,120,140,.25); border-radius:10px; padding:6px 0; min-width:140px; box-shadow:0 8px 32px rgba(0,0,0,.35); backdrop-filter:blur(12px); }",
      ".vm-popover-item { padding:8px 16px; font-size:12px; cursor:pointer; transition:background .15s; color:var(--sapTextColor, #c4c6c9); }",
      ".vm-popover-item:hover { background:rgba(59,130,246,.12); }",
      ".vm-popover-item.vm-active-item { color:#3b82f6; font-weight:600; }",

      /* Group headers (for nested fields like ITEMS[]) */
      ".vm-group { padding:6px 14px 2px; }",
      ".vm-group-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; opacity:.5; display:flex; align-items:center; gap:6px; }",
      ".vm-group-label::after { content:''; flex:1; height:1px; background:currentColor; opacity:.25; }",
      ".vm-src .vm-group-label { color:#60a5fa; justify-content:flex-end; flex-direction:row-reverse; }",
      ".vm-tgt .vm-group-label { color:#34d399; }",
      ".vm-group + .vm-node { margin-left:12px; }",
      ".vm-src .vm-group + .vm-node { margin-left:0; margin-right:12px; }",
      ".vm-indented { margin-left:12px; }",
      ".vm-src .vm-indented { margin-left:0; margin-right:12px; }",

      /* Empty state */
      ".vm-empty { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; opacity:.35; font-size:13px; pointer-events:none; }",

      /* Responsive column widths */
      "@media (max-width:900px) { .vm-col { flex:0 0 200px; } .vm-label { max-width:140px; } }",
      "@media (max-width:700px) { .vm-col { flex:0 0 160px; } .vm-label { max-width:110px; font-size:11px; } .vm-sample { display:none; } }"
    ].join("\n");

    var el = document.createElement("style");
    el.setAttribute("data-vm", "1");
    el.textContent = css;
    document.head.appendChild(el);
  }


  /* ──────────────────────────────────────────────
     VisualMapper Constructor
     ────────────────────────────────────────────── */
  function VisualMapper(opts) {
    injectCSS();
    this._container = opts.container;
    this._onConnect = opts.onConnect || function () {};        // (sourceField, targetField)
    this._onDisconnect = opts.onDisconnect || function () {};  // (sourceField, targetField)
    this._onTransformChange = opts.onTransformChange || function () {}; // (sourceField, targetField, newTransform)
    this._getText = opts.getText || function (k) { return k; };

    this._sourceFields = [];  // [{key, label, sample}]
    this._targetFields = [];  // [{key, label}]
    this._connections = [];   // [{source, target, transform}]

    // Interaction state
    this._dragging = false;
    this._dragFrom = null;   // {side:"source"|"target", key:string}
    this._dragLineEl = null;
    this._hoveredDot = null;
    this._popover = null;
    this._selectedConn = null;

    // Bound handlers (for cleanup)
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onDocClick = this._handleDocClick.bind(this);
  }


  /* ──────────────────────────────────────────────
     Public API
     ────────────────────────────────────────────── */

  VisualMapper.prototype.setData = function (sourceFields, targetFields, connections) {
    this._sourceFields = sourceFields || [];
    this._targetFields = targetFields || [];
    this._connections = (connections || []).map(function (c) {
      return { source: c.source, target: c.target, transform: c.transform || "DIRECT" };
    });
    this._render();
  };

  VisualMapper.prototype.destroy = function () {
    this._closePopover();
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    document.removeEventListener("click", this._onDocClick);
    if (this._container) this._container.innerHTML = "";
    this._container = null;
  };


  /* ──────────────────────────────────────────────
     Rendering
     ────────────────────────────────────────────── */

  VisualMapper.prototype._render = function () {
    var el = this._container;
    if (!el) return;
    el.innerHTML = "";

    var root = document.createElement("div");
    root.className = "vm-root";

    // Source column
    var srcCol = this._createColumn("source", this._sourceFields, this._getText("vmSapFields") || "SAP Alanları");
    root.appendChild(srcCol);

    // SVG area
    var svgWrap = document.createElement("div");
    svgWrap.className = "vm-svg-wrap";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgWrap.appendChild(svg);
    root.appendChild(svgWrap);
    this._svg = svg;
    this._svgWrap = svgWrap;

    // Target column
    var tgtCol = this._createColumn("target", this._targetFields, this._getText("vm3plFields") || "3PL Alanları");
    root.appendChild(tgtCol);

    el.appendChild(root);
    this._root = root;

    // Empty state
    if (this._sourceFields.length === 0 && this._targetFields.length === 0) {
      var empty = document.createElement("div");
      empty.className = "vm-empty";
      empty.textContent = this._getText("vmEmptyHint") || "JSON yapıştırarak alanları çıkarın";
      root.appendChild(empty);
    }

    // Draw connections after layout settles
    var self = this;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        self._drawConnections();
      });
    });

    // Global listeners
    document.addEventListener("click", this._onDocClick);
  };

  VisualMapper.prototype._createColumn = function (side, fields, headerText) {
    var self = this;
    var col = document.createElement("div");
    col.className = "vm-col " + (side === "source" ? "vm-src" : "vm-tgt");

    var header = document.createElement("div");
    header.className = "vm-col-header";
    header.textContent = headerText;
    col.appendChild(header);

    var connectedKeys = {};
    this._connections.forEach(function (c) {
      connectedKeys[c.source] = true;
      connectedKeys[c.target] = true;
    });

    // Group fields by parent path (e.g. ITEMS[] → header, ITEMS[].LFIMG → child)
    var groups = this._groupFields(fields);

    groups.forEach(function (group) {
      // Render group header if it has a parent
      if (group.parent) {
        var groupDiv = document.createElement("div");
        groupDiv.className = "vm-group";
        var groupLabel = document.createElement("div");
        groupLabel.className = "vm-group-label";
        groupLabel.textContent = group.parent;
        groupDiv.appendChild(groupLabel);
        col.appendChild(groupDiv);
      }

      group.fields.forEach(function (f) {
        var node = document.createElement("div");
        var cls = "vm-node" + (connectedKeys[f.key] ? " vm-connected" : "");
        if (group.parent) cls += " vm-indented";
        node.className = cls;
        node.setAttribute("data-side", side);
        node.setAttribute("data-key", f.key);

        // Label — two lines: short name (bold) + full path (subtle monospace)
        var labelWrap = document.createElement("div");
        labelWrap.className = "vm-label-wrap";
        var shortName = f.label || f.key;
        // For grouped children, show only the leaf part as the bold name
        if (group.parent && f.key.indexOf(group.parent + ".") === 0) {
          shortName = f.key.substring(group.parent.length + 1);
        }
        var label = document.createElement("span");
        label.className = "vm-label";
        label.textContent = shortName;
        labelWrap.appendChild(label);
        // Full path subtitle (only if it differs from shortName)
        if (f.key !== shortName) {
          var pathEl = document.createElement("span");
          pathEl.className = "vm-label-path";
          pathEl.textContent = f.key;
          labelWrap.appendChild(pathEl);
        }
        labelWrap.title = f.key;

        var dot = document.createElement("div");
        dot.className = "vm-dot" + (connectedKeys[f.key] ? " vm-active" : "");
        dot.setAttribute("data-side", side);
        dot.setAttribute("data-key", f.key);

        if (side === "source") {
          if (f.sample) {
            var sample = document.createElement("span");
            sample.className = "vm-sample";
            sample.textContent = f.sample;
            node.appendChild(sample);
          }
          node.appendChild(labelWrap);
          node.appendChild(dot);
        } else {
          node.appendChild(dot);
          node.appendChild(labelWrap);
        }

      // Drag start
      dot.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._startDrag(side, f.key, e);
      });

      // Drop target hover
      dot.addEventListener("mouseenter", function () {
        if (self._dragging && self._dragFrom.side !== side) {
          dot.classList.add("vm-drop-target");
          self._hoveredDot = { side: side, key: f.key, el: dot };
        }
      });
      dot.addEventListener("mouseleave", function () {
        dot.classList.remove("vm-drop-target");
        if (self._hoveredDot && self._hoveredDot.key === f.key) {
          self._hoveredDot = null;
        }
      });

        col.appendChild(node);
      }); // end group.fields
    }); // end groups

    return col;
  };

  /**
   * Groups fields by their parent path prefix.
   * e.g. ["VBELN", "ITEMS[].LFIMG", "ITEMS[].MAKTX"] →
   *   [ {parent:null, fields:[{key:"VBELN",...}]},
   *     {parent:"ITEMS[]", fields:[{key:"ITEMS[].LFIMG",...}, ...]} ]
   */
  VisualMapper.prototype._groupFields = function (fields) {
    var groups = [];
    var currentGroup = null;

    fields.forEach(function (f) {
      var key = f.key;
      // Detect parent: look for "[]." pattern
      var arrMatch = key.match(/^(.+?\[\])\./);
      var dotMatch = !arrMatch ? key.match(/^(.+?)\./) : null;
      var parent = arrMatch ? arrMatch[1] : (dotMatch ? dotMatch[1] : null);

      if (!currentGroup || currentGroup.parent !== parent) {
        currentGroup = { parent: parent, fields: [] };
        groups.push(currentGroup);
      }
      currentGroup.fields.push(f);
    });

    return groups;
  };


  /* ──────────────────────────────────────────────
     SVG Connections
     ────────────────────────────────────────────── */

  VisualMapper.prototype._drawConnections = function () {
    if (!this._svg || !this._root) return;
    var svg = this._svg;
    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Add gradient defs
    var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    var grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    grad.id = "vm-grad";
    grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
    grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "0%");
    var stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", "#3b82f6");
    var stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", "#10b981");
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    var self = this;
    this._connections.forEach(function (conn) {
      self._drawSingleConnection(conn);
    });
  };

  VisualMapper.prototype._getDotPos = function (side, key) {
    if (!this._root || !this._svgWrap) return null;
    var dot = this._root.querySelector('.vm-dot[data-side="' + side + '"][data-key="' + CSS.escape(key) + '"]');
    if (!dot) return null;
    var svgRect = this._svgWrap.getBoundingClientRect();
    var dotRect = dot.getBoundingClientRect();
    return {
      x: dotRect.left + dotRect.width / 2 - svgRect.left,
      y: dotRect.top + dotRect.height / 2 - svgRect.top
    };
  };

  VisualMapper.prototype._drawSingleConnection = function (conn) {
    var svg = this._svg;
    var p1 = this._getDotPos("source", conn.source);
    var p2 = this._getDotPos("target", conn.target);
    if (!p1 || !p2) return;

    var self = this;
    var dx = Math.abs(p2.x - p1.x) * 0.45;

    // Bezier path
    var d = "M" + p1.x + "," + p1.y +
            " C" + (p1.x + dx) + "," + p1.y +
            " " + (p2.x - dx) + "," + p2.y +
            " " + p2.x + "," + p2.y;

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", "url(#vm-grad)");
    path.classList.add("vm-path");
    path.setAttribute("data-source", conn.source);
    path.setAttribute("data-target", conn.target);

    // Click to select
    path.addEventListener("click", function (e) {
      e.stopPropagation();
      self._selectConnection(conn, midX, midY);
    });
    svg.appendChild(path);

    // Midpoint badge (transform label)
    var midX = (p1.x + p2.x) / 2;
    var midY = (p1.y + p2.y) / 2;

    var badgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    badgeGroup.classList.add("vm-badge-group");
    var badgeW = conn.transform.length * 7 + 12;
    var badgeBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    badgeBg.setAttribute("x", midX - badgeW / 2);
    badgeBg.setAttribute("y", midY - 10);
    badgeBg.setAttribute("width", badgeW);
    badgeBg.setAttribute("height", 20);
    badgeBg.classList.add("vm-badge-bg");
    var badgeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    badgeText.setAttribute("x", midX);
    badgeText.setAttribute("y", midY);
    badgeText.classList.add("vm-badge-text");
    badgeText.textContent = conn.transform;
    badgeGroup.appendChild(badgeBg);
    badgeGroup.appendChild(badgeText);
    badgeGroup.addEventListener("click", function (e) {
      e.stopPropagation();
      self._selectConnection(conn, midX, midY);
    });
    svg.appendChild(badgeGroup);

    // Delete button (small X circle)
    var delGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    delGroup.classList.add("vm-del-group");
    var delX = midX + badgeW / 2 + 14;
    var delBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    delBg.setAttribute("x", delX - 7);
    delBg.setAttribute("y", midY - 7);
    delBg.setAttribute("width", 14);
    delBg.setAttribute("height", 14);
    delBg.classList.add("vm-del-bg");
    var line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line1.setAttribute("x1", delX - 3); line1.setAttribute("y1", midY - 3);
    line1.setAttribute("x2", delX + 3); line1.setAttribute("y2", midY + 3);
    line1.classList.add("vm-del-x");
    var line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line2.setAttribute("x1", delX + 3); line2.setAttribute("y1", midY - 3);
    line2.setAttribute("x2", delX - 3); line2.setAttribute("y2", midY + 3);
    line2.classList.add("vm-del-x");
    delGroup.appendChild(delBg);
    delGroup.appendChild(line1);
    delGroup.appendChild(line2);
    delGroup.addEventListener("click", function (e) {
      e.stopPropagation();
      self._onDisconnect(conn.source, conn.target);
    });
    svg.appendChild(delGroup);
  };


  /* ──────────────────────────────────────────────
     Drag & Drop
     ────────────────────────────────────────────── */

  VisualMapper.prototype._startDrag = function (side, key, e) {
    this._dragging = true;
    this._dragFrom = { side: side, key: key };
    this._dragStartPos = this._getDotPos(side, key);

    // Create temporary drag line
    var line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.classList.add("vm-drag-line");
    this._svg.appendChild(line);
    this._dragLineEl = line;

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);

    // Visual feedback on starting dot
    var dot = this._root.querySelector('.vm-dot[data-side="' + side + '"][data-key="' + CSS.escape(key) + '"]');
    if (dot) dot.classList.add("vm-active");
  };

  VisualMapper.prototype._handleMouseMove = function (e) {
    if (!this._dragging || !this._dragLineEl || !this._svgWrap) return;
    var svgRect = this._svgWrap.getBoundingClientRect();
    var mx = e.clientX - svgRect.left;
    var my = e.clientY - svgRect.top;

    var p1 = this._dragStartPos;
    if (!p1) return;

    var dx = Math.abs(mx - p1.x) * 0.45;
    var d;
    if (this._dragFrom.side === "source") {
      d = "M" + p1.x + "," + p1.y + " C" + (p1.x + dx) + "," + p1.y + " " + (mx - dx) + "," + my + " " + mx + "," + my;
    } else {
      d = "M" + mx + "," + my + " C" + (mx + dx) + "," + my + " " + (p1.x - dx) + "," + p1.y + " " + p1.x + "," + p1.y;
    }
    this._dragLineEl.setAttribute("d", d);
  };

  VisualMapper.prototype._handleMouseUp = function () {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);

    // Remove drag line
    if (this._dragLineEl && this._dragLineEl.parentNode) {
      this._dragLineEl.parentNode.removeChild(this._dragLineEl);
    }
    this._dragLineEl = null;

    // Remove active state from starting dot
    if (this._dragFrom) {
      var startDot = this._root.querySelector('.vm-dot[data-side="' + this._dragFrom.side + '"][data-key="' + CSS.escape(this._dragFrom.key) + '"]');
      if (startDot) startDot.classList.remove("vm-active");
    }

    // Check if dropped on valid target
    if (this._hoveredDot && this._dragFrom && this._hoveredDot.side !== this._dragFrom.side) {
      var src = this._dragFrom.side === "source" ? this._dragFrom.key : this._hoveredDot.key;
      var tgt = this._dragFrom.side === "target" ? this._dragFrom.key : this._hoveredDot.key;

      // Check if connection already exists
      var exists = this._connections.some(function (c) { return c.source === src && c.target === tgt; });
      if (!exists) {
        this._onConnect(src, tgt);
      }

      this._hoveredDot.el.classList.remove("vm-drop-target");
    }

    this._dragging = false;
    this._dragFrom = null;
    this._hoveredDot = null;
  };


  /* ──────────────────────────────────────────────
     Transform Popover
     ────────────────────────────────────────────── */

  VisualMapper.prototype._selectConnection = function (conn, svgX, svgY) {
    this._closePopover();
    this._selectedConn = conn;

    var self = this;
    var transforms = ["DIRECT", "LOOKUP", "PREFIX", "SAP_DATE", "TO_NUMBER", "TO_STRING"];

    var pop = document.createElement("div");
    pop.className = "vm-popover";

    // Position relative to container
    var svgRect = this._svgWrap.getBoundingClientRect();
    var containerRect = this._container.getBoundingClientRect();
    pop.style.left = (svgRect.left - containerRect.left + svgX - 70) + "px";
    pop.style.top = (svgRect.top - containerRect.top + svgY + 16) + "px";

    transforms.forEach(function (t) {
      var item = document.createElement("div");
      item.className = "vm-popover-item" + (t === conn.transform ? " vm-active-item" : "");
      item.textContent = t;
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        self._closePopover();
        if (t !== conn.transform) {
          self._onTransformChange(conn.source, conn.target, t);
        }
      });
      pop.appendChild(item);
    });

    this._container.style.position = "relative";
    this._container.appendChild(pop);
    this._popover = pop;
  };

  VisualMapper.prototype._closePopover = function () {
    if (this._popover && this._popover.parentNode) {
      this._popover.parentNode.removeChild(this._popover);
    }
    this._popover = null;
    this._selectedConn = null;
  };

  VisualMapper.prototype._handleDocClick = function () {
    this._closePopover();
  };

  /* ──────────────────────────────────────────────
     Resize handler
     ────────────────────────────────────────────── */
  VisualMapper.prototype.refresh = function () {
    this._drawConnections();
  };

  return VisualMapper;
});
