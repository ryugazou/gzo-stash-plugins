// =============================================================
// Plugin Manager
// Enhances the Stash plugins settings page with four optional
// features:
//   - Plugin Collapse    (toggle: collapse_enabled)
//   - Plugin Grouping    (toggle: grouping_enabled)
//   - Plugin Categorizer (toggle: categorizer_enabled)
//   - Installed Marker   (toggle: installed_marker_enabled)
//
// Each feature can be enabled/disabled independently via the
// plugin settings panel. Settings are read from the Stash
// GraphQL API on init and re-read on every tab visit.
// =============================================================

(function () {
  "use strict";

  const PLUGIN_ID = "gzo-plugin-manager";
  const GRAPHQL   = "/graphql";

  // ── GraphQL helpers ──────────────────────────────────────────────────────
  async function gql(query, variables = {}) {
    const res = await fetch(GRAPHQL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, variables }),
    });
    return (await res.json()).data;
  }

  async function loadSettings() {
    const data = await gql(`query { configuration { plugins } }`);
    return data?.configuration?.plugins ?? {};
  }

  async function savePluginData(input) {
    await gql(
      `mutation ConfigurePlugin($id: ID!, $input: Map!) { configurePlugin(plugin_id: $id, input: $input) }`,
      { id: PLUGIN_ID, input }
    );
  }

  // ── Shared feature flags (loaded from settings on each tab visit) ────────
  // Defaults: all ON (true) — toggles are false until user turns them on,
  // but we treat missing = enabled so the feature works on first install.
  let featureGrouping    = true;
  let featureCollapse    = true;
  let featureCategorizer    = true;
  let featureInstalledMark      = true;
  let markerColorMatch          = "#b3ffb3"; // Color when installed version matches
  let markerColorMismatch       = "#ffbf80"; // Color when installed version differs

  // Read the three feature toggles from Stash plugin settings.
  // Convention: missing key = ON (first-run), explicit false = OFF.
  async function loadFeatureFlags() {
    const all = await loadSettings();
    const s   = all[PLUGIN_ID] ?? {};
    featureGrouping    = s.grouping_enabled    !== false;
    featureCollapse    = s.collapse_enabled    !== false;
    featureCategorizer = s.categorizer_enabled !== false;
  }

  // ============================================================
  // MODULE 1 — PLUGIN GROUPING
  // Groups plugin list into Active / Disabled sections.
  // ============================================================

  function runGrouping(wrapper) {
    if (!featureGrouping) return;

    // Prevent re-running on the same wrapper
    if (wrapper.dataset.pluginsGrouped) return;

    const groups = Array.from(wrapper.querySelectorAll(":scope > .setting-group"));
    if (!groups.length) return;

    // Split into active and disabled by presence of .disabled on the .setting
    const active   = groups.filter((g) => !g.querySelector(".setting")?.classList.contains("disabled"));
    const disabled = groups.filter((g) =>  g.querySelector(".setting")?.classList.contains("disabled"));

    // Remove all groups from wrapper before re-inserting under headers
    groups.forEach((g) => g.remove());

    // Active header
    const activeHeader = document.createElement("h5");
    activeHeader.className   = "plugin-group-header plugin-group-active";
    activeHeader.textContent = `✓ Active Plugins (${active.length})`;
    wrapper.appendChild(activeHeader);
    active.forEach((g) => wrapper.appendChild(g));

    // Disabled header
    const disabledHeader = document.createElement("h5");
    disabledHeader.className   = "plugin-group-header plugin-group-disabled";
    disabledHeader.textContent = `✗ Disabled Plugins (${disabled.length})`;
    wrapper.appendChild(disabledHeader);
    disabled.forEach((g) => wrapper.appendChild(g));

    // Mark with attribute so Categorizer can detect grouping is active
    wrapper.dataset.pluginsGrouped = "true";
    // Also set the attribute Categorizer uses to find this container
    wrapper.setAttribute("data-plugins-grouped", "true");
  }

  // ============================================================
  // MODULE 2 — PLUGIN COLLAPSE
  // Injects collapse/expand arrows into each plugin entry.
  // ============================================================

  const BTN_STYLE = "padding: 0 6px; margin-right: 4px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;";
  const ICON_HTML = `<svg aria-hidden="true" focusable="false"
    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"
    style="width:0.625em;height:1em;display:inline-block;
           overflow:visible;vertical-align:-0.125em;
           transition:transform 0.2s;">
    <path fill="white" d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5
      12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5
      -32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/>
  </svg>`;

  function runCollapse(wrapper) {
    if (!featureCollapse) return;

    wrapper.querySelectorAll(".setting-group").forEach((group) => {
      if (group.dataset.collapseAdded) return;
      group.dataset.collapseAdded = "true";

      const section    = group.querySelector(".collapsible-section");
      const settingDiv = group.querySelector(".setting");
      if (!settingDiv) return;

      settingDiv.style.display    = "flex";
      settingDiv.style.alignItems = "flex-start";

      const firstDiv  = settingDiv.children[0];
      const secondDiv = settingDiv.children[1];

      if (firstDiv) {
        firstDiv.style.display    = "flex";
        firstDiv.style.alignItems = "flex-start";
        firstDiv.style.flex       = "1";
        firstDiv.style.minWidth   = "0";

        // Wrap title and description in a vertical column.
        // The category label (injected by Categorizer) sits before h3 inside
        // the same parent — textCol wraps only h3 + sub-heading, not the label.
        const titleEl   = firstDiv.querySelector("h3");
        const subHeadEl = firstDiv.querySelector(".sub-heading");
        if (titleEl) {
          const textCol = document.createElement("div");
          textCol.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0;";
          titleEl.parentNode.insertBefore(textCol, titleEl);
          textCol.appendChild(titleEl);
          if (subHeadEl) textCol.appendChild(subHeadEl);
        }

        // Check if there is actual content to collapse
        const hasContent = section &&
          section.children.length > 0 &&
          Array.from(section.children).some(
            (el) => el.children.length > 0 || el.textContent.trim() !== ""
          );

        // The button/spacer is placed BEFORE the category label + textCol wrapper
        // inside firstDiv, so it naturally sits at the same vertical position as
        // the label. We then use align-self + margin-top to nudge it down to the
        // h3 title row instead of the label row.
        if (hasContent) {
          // Real clickable arrow button
          const btn = document.createElement("button");
          btn.type      = "button";
          btn.className = "btn btn-minimal btn-sm plugin-collapse-btn";
          btn.style.cssText = BTN_STYLE + " align-self:flex-start; margin-top:var(--collapse-btn-offset,0);";
          btn.innerHTML = ICON_HTML;
          firstDiv.insertBefore(btn, firstDiv.firstChild);

          btn.addEventListener("click", () => {
            const isExpanded = section.classList.contains("plugin-expanded");
            section.classList.toggle("plugin-expanded", !isExpanded);
            btn.querySelector("svg").style.transform = !isExpanded ? "rotate(90deg)" : "";
          });
        } else {
          // Invisible spacer so all titles align horizontally
          const spacer = document.createElement("button");
          spacer.type          = "button";
          spacer.className     = "btn btn-minimal btn-sm plugin-collapse-btn";
          spacer.style.cssText = BTN_STYLE + " visibility:hidden;pointer-events:none; align-self:flex-start; margin-top:var(--collapse-btn-offset,0);";
          spacer.innerHTML     = ICON_HTML;
          firstDiv.insertBefore(spacer, firstDiv.firstChild);
        }
      }

      if (secondDiv) {
        secondDiv.style.flexShrink = "0";
        secondDiv.style.alignSelf  = "flex-start";
      }
    });
  }

  // ============================================================
  // MODULE 3 — PLUGIN CATEGORIZER
  // Assigns colour-coded category labels to plugins and sorts
  // the plugin list by category. Adds a Categories Settings
  // button next to Reload plugins.
  // ============================================================

  const CAT_PLUGIN_ID = "gzo-plugin-manager"; // persisted under this plugin's own ID

  const DEFAULT_CATEGORIES = [
    { id: "global",     name: "Global",                color: "#ffffb3" },
    { id: "addons",     name: "Addons",                color: "#ffb3b3" },
    { id: "scenes",     name: "Scenes/Groups/Markers", color: "#ffdab3" },
    { id: "galleries",  name: "Galleries/Images",      color: "#b3ffff" },
    { id: "performers", name: "Performers",            color: "#b3ffb3" },
    { id: "studios",    name: "Studios",               color: "#ccccff" },
    { id: "tags",       name: "Tags",                  color: "#ffccff" },
  ];

  const AUTO_KEYWORDS = {
    global:     ["global", "layout", "navbar", "blur", "popover", "donate", "accessibility", "pagination", "badge", "filter"],
    addons:     ["addon", "companion", "valkyr", "serechops", "theme", "library", "glassy"],
    scenes:     ["scene", "group", "marker", "filter-tab", "similar", "rename", "details", "card-styling"],
    galleries:  ["gallery", "image"],
    performers: ["performer"],
    studios:    ["studio"],
    tags:       ["tag", "sub-tag"],
  };

  let categories  = [];
  let assignments = {};

  async function persistCatState() {
    await savePluginData({
      categories:  JSON.stringify(categories),
      assignments: JSON.stringify(assignments),
      // Preserve the three feature toggles when saving cat data
      grouping_enabled:    featureGrouping,
      collapse_enabled:    featureCollapse,
      categorizer_enabled:     featureCategorizer,
      installed_marker_enabled: featureInstalledMark,
    });
  }

  function autoAssign(pluginName) {
    const lower = pluginName.toLowerCase();
    for (const [catId, keywords] of Object.entries(AUTO_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) return catId;
    }
    return null;
  }

  function getCat(id) {
    return categories.find((c) => c.id === id) || null;
  }

  // ── Plugins tab helpers ───────────────────────────────────────────────────
  function getPluginsTabPane() {
    return document.querySelector("#configuration-tabs-tabpane-plugins.active.show");
  }

  function getPluginsWrapper() {
    const tabPane = getPluginsTabPane();
    if (!tabPane) return null;
    const sections = tabPane.querySelectorAll(".setting-section");
    for (let i = sections.length - 1; i >= 0; i--) {
      const card = sections[i].querySelector(".card");
      if (!card) continue;
      // Prefer the [data-plugins-grouped] div (set by Grouping module)
      const grouped = card.querySelector("[data-plugins-grouped]");
      if (grouped) return grouped;
      if (card.querySelector(".setting-group")) return card;
    }
    return null;
  }

  function getPluginGroups() {
    const w = getPluginsWrapper();
    return w ? Array.from(w.querySelectorAll(".setting-group")) : [];
  }

  function getPluginName(group) {
    const firstSetting = group.querySelector(":scope > .setting");
    if (!firstSetting) return null;
    const h3 = firstSetting.querySelector("h3");
    if (!h3) return null;
    return h3.textContent.replace(/\s*\([\d.]+\)\s*$/, "").trim();
  }

  // ── Apply categories to DOM ───────────────────────────────────────────────
  function applyCategories() {
    if (!featureCategorizer) return;
    const wrapper = getPluginsWrapper();
    if (!wrapper) return;

    const groupHeaders = wrapper.querySelectorAll(".plugin-group-header");
    if (groupHeaders.length > 0) {
      groupHeaders.forEach((header) => {
        const sectionGroups = [];
        let el = header.nextElementSibling;
        while (el && !el.classList.contains("plugin-group-header")) {
          if (el.classList.contains("setting-group")) sectionGroups.push(el);
          el = el.nextElementSibling;
        }
        if (sectionGroups.length) sortAndLabel(wrapper, sectionGroups, header);
      });
    } else {
      sortAndLabel(wrapper, Array.from(wrapper.querySelectorAll(".setting-group")), null);
    }
  }

  function sortAndLabel(wrapper, groups, insertAfter) {
    // Remove existing labels to avoid duplicates
    groups.forEach((g) => g.querySelectorAll(".gzo-cat-label").forEach((el) => el.remove()));

    const catOrder = categories.map((c) => c.id);
    groups.sort((a, b) => {
      const nameA = getPluginName(a) || "";
      const nameB = getPluginName(b) || "";
      const catA  = assignments[nameA] || "__none__";
      const catB  = assignments[nameB] || "__none__";
      const oA    = catOrder.indexOf(catA);
      const oB    = catOrder.indexOf(catB);
      const ordA  = oA === -1 ? 9999 : oA;
      const ordB  = oB === -1 ? 9999 : oB;
      if (ordA !== ordB) return ordA - ordB;
      return nameA.localeCompare(nameB);
    });

    if (insertAfter) {
      let ref = insertAfter.nextSibling;
      groups.forEach((g) => { wrapper.insertBefore(g, ref); ref = g.nextSibling; });
    } else {
      groups.forEach((g) => wrapper.appendChild(g));
    }

    groups.forEach((g) => {
      const name = getPluginName(g);
      if (!name) return;
      const cat = getCat(assignments[name]);
      if (!cat) return;

      const firstSetting = g.querySelector(":scope > .setting");
      if (!firstSetting) return;
      const outerDiv = firstSetting.querySelector("div");
      if (!outerDiv) return;
      const h3 = outerDiv.querySelector("h3");
      if (!h3) return;

      const label = document.createElement("span");
      label.className   = "gzo-cat-label";
      label.textContent = cat.name + ":";
      label.style.color = cat.color;
      h3.parentNode.insertBefore(label, h3);
    });
  }

  // ── Categories Settings button ────────────────────────────────────────────
  function injectCatButton() {
    if (!featureCategorizer) return;
    if (document.getElementById("gzo-cat-edit-btn")) return;
    if (!getPluginsTabPane()) return;

    // Find the setting row that contains "Reload plugins"
    let reloadSetting = null;
    document.querySelectorAll(
      "#configuration-tabs-tabpane-plugins .setting-section .setting"
    ).forEach((s) => {
      if (!reloadSetting && s.querySelector("h3")?.textContent.includes("Reload plugins")) {
        reloadSetting = s;
      }
    });
    if (!reloadSetting) return;

    const btn = document.createElement("button");
    btn.id          = "gzo-cat-edit-btn";
    btn.type        = "button";
    btn.className   = "mr-2 btn btn-secondary";
    btn.innerHTML   = "&#9881; Categories Settings";
    btn.style.marginLeft = "8px";
    btn.addEventListener("click", openCatModal);

    const right = reloadSetting.children[1];
    if (right) right.appendChild(btn);
  }

  // ── Categories modal ──────────────────────────────────────────────────────
  let selectedCatId = null;

  function openCatModal() {
    if (document.getElementById("gzo-cat-modal-overlay")) return;

    let tempCats   = JSON.parse(JSON.stringify(categories));
    let tempAssign = JSON.parse(JSON.stringify(assignments));
    selectedCatId  = tempCats[0]?.id || null;

    const overlay = document.createElement("div");
    overlay.id = "gzo-cat-modal-overlay";

    const modal = document.createElement("div");
    modal.id = "gzo-cat-modal";
    modal.innerHTML = `
      <div id="gzo-cat-modal-header">
        <h4>Plugin Categories</h4>
        <button type="button" class="btn btn-minimal" id="gzo-cat-close-btn">✕</button>
      </div>
      <div id="gzo-cat-modal-body">
        <div id="gzo-cat-left">
          <div id="gzo-cat-left-list"></div>
          <button type="button" class="btn btn-secondary btn-sm" id="gzo-cat-add-btn">+ Add category</button>
        </div>
        <div id="gzo-cat-right">
          <div id="gzo-cat-editor">
            <input id="gzo-cat-name-input" type="text" placeholder="Category name" />
            <input id="gzo-cat-color-input" type="color" title="Category colour" />
            <button type="button" class="btn btn-danger btn-sm" id="gzo-cat-delete-btn">Delete</button>
          </div>
          <div id="gzo-cat-plugins-label">Assign plugins to this category:</div>
          <div id="gzo-cat-plugins-list"></div>
        </div>
      </div>
      <div id="gzo-cat-modal-footer">
        <button type="button" class="btn btn-secondary btn-sm" id="gzo-cat-auto-assign-btn">↺ Auto-assign all</button>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="gzo-cat-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="gzo-cat-save-btn">Save &amp; Apply</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function renderCatList() {
      const list = document.getElementById("gzo-cat-left-list");
      list.innerHTML = "";
      tempCats.forEach((cat, idx) => {
        const isActive = cat.id === selectedCatId;
        const isFirst  = idx === 0;
        const isLast   = idx === tempCats.length - 1;

        const row = document.createElement("div");
        row.className = "gzo-cat-row" + (isActive ? " active" : "");

        // Swatch + name area — clicking selects the category
        const nameArea = document.createElement("div");
        nameArea.className = "gzo-cat-row-name-area";
        nameArea.innerHTML = `
          <span class="gzo-cat-row-swatch" style="background:${cat.color}"></span>
          <span class="gzo-cat-row-name">${cat.name}</span>
        `;
        nameArea.addEventListener("click", () => {
          selectedCatId = cat.id;
          renderCatList(); renderEditor(); renderPluginList();
        });

        // Up button — disabled on first item
        const upBtn = document.createElement("button");
        upBtn.type      = "button";
        upBtn.className = "gzo-cat-order-btn";
        upBtn.title     = "Move up";
        upBtn.textContent = "▲";
        upBtn.disabled  = isFirst;
        upBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          [tempCats[idx - 1], tempCats[idx]] = [tempCats[idx], tempCats[idx - 1]];
          renderCatList(); renderPluginList();
        });

        // Down button — disabled on last item
        const downBtn = document.createElement("button");
        downBtn.type      = "button";
        downBtn.className = "gzo-cat-order-btn";
        downBtn.title     = "Move down";
        downBtn.textContent = "▼";
        downBtn.disabled  = isLast;
        downBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          [tempCats[idx], tempCats[idx + 1]] = [tempCats[idx + 1], tempCats[idx]];
          renderCatList(); renderPluginList();
        });

        // Arrow group on the right
        const arrowGroup = document.createElement("div");
        arrowGroup.className = "gzo-cat-row-arrows";
        arrowGroup.appendChild(upBtn);
        arrowGroup.appendChild(downBtn);

        row.appendChild(nameArea);
        row.appendChild(arrowGroup);
        list.appendChild(row);
      });
    }

    function renderEditor() {
      const cat        = tempCats.find((c) => c.id === selectedCatId);
      const nameInput  = document.getElementById("gzo-cat-name-input");
      const colorInput = document.getElementById("gzo-cat-color-input");
      if (!cat) { nameInput.value = ""; colorInput.value = "#ffffff"; return; }
      nameInput.value  = cat.name;
      colorInput.value = cat.color;
    }

    function renderPluginList() {
      const list = document.getElementById("gzo-cat-plugins-list");
      list.innerHTML = "";
      const pluginNames = getPluginGroups()
        .map(getPluginName).filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      if (!pluginNames.length) {
        list.innerHTML = `<div class="gzo-cat-empty">No plugins found.</div>`;
        return;
      }
      pluginNames.forEach((name) => {
        const isAssigned = tempAssign[name] === selectedCatId;
        const currentCat = tempAssign[name] ? tempCats.find((c) => c.id === tempAssign[name]) : null;
        const row = document.createElement("div");
        row.className = "gzo-plugin-assign-row" + (isAssigned ? " assigned" : "");
        row.innerHTML = `
          <span class="gzo-plugin-assign-check">${isAssigned ? "✓" : ""}</span>
          <span class="gzo-plugin-assign-name">${name}</span>
          ${!isAssigned && currentCat
            ? `<span class="gzo-plugin-current-cat" style="color:${currentCat.color}">${currentCat.name}</span>`
            : ""}
        `;
        row.addEventListener("click", () => {
          if (isAssigned) { delete tempAssign[name]; }
          else            { tempAssign[name] = selectedCatId; }
          renderPluginList();
        });
        list.appendChild(row);
      });
    }

    renderCatList(); renderEditor(); renderPluginList();

    document.getElementById("gzo-cat-name-input").addEventListener("input", (e) => {
      const cat = tempCats.find((c) => c.id === selectedCatId);
      if (cat) { cat.name = e.target.value; renderCatList(); }
    });
    document.getElementById("gzo-cat-color-input").addEventListener("input", (e) => {
      const cat = tempCats.find((c) => c.id === selectedCatId);
      if (cat) { cat.color = e.target.value; renderCatList(); }
    });
    document.getElementById("gzo-cat-add-btn").addEventListener("click", () => {
      const newCat = { id: "cat_" + Date.now(), name: "New Category", color: "#cccccc" };
      tempCats.push(newCat);
      selectedCatId = newCat.id;
      renderCatList(); renderEditor(); renderPluginList();
    });
    document.getElementById("gzo-cat-delete-btn").addEventListener("click", () => {
      if (!selectedCatId) return;
      if (!confirm("Delete this category? Plugin assignments will be removed.")) return;
      Object.keys(tempAssign).forEach((name) => {
        if (tempAssign[name] === selectedCatId) delete tempAssign[name];
      });
      tempCats = tempCats.filter((c) => c.id !== selectedCatId);
      selectedCatId = tempCats[0]?.id || null;
      renderCatList(); renderEditor(); renderPluginList();
    });
    document.getElementById("gzo-cat-auto-assign-btn").addEventListener("click", () => {
      if (!confirm("Auto-assign will overwrite all current assignments. Continue?")) return;
      getPluginGroups().forEach((group) => {
        const name = getPluginName(group);
        if (!name) return;
        const catId = autoAssign(name);
        if (catId) tempAssign[name] = catId;
        else delete tempAssign[name];
      });
      renderPluginList();
    });
    document.getElementById("gzo-cat-save-btn").addEventListener("click", async () => {
      categories  = tempCats;
      assignments = tempAssign;
      overlay.remove();
      applyCategories();
      await persistCatState();
    });

    const close = () => overlay.remove();
    document.getElementById("gzo-cat-cancel-btn").addEventListener("click", close);
    document.getElementById("gzo-cat-close-btn").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }


  // ============================================================
  // MODULE 4 — INSTALLED MARKER
  // In the Settings > Plugins > Available Plugins view, marks
  // plugins that are already installed with a ✅ badge.
  // Reads installed plugin IDs via GraphQL, then watches for
  // the available-plugins list to render and injects badges.
  // ============================================================

  // Cache of installed plugin IDs (lowercase) loaded once per tab visit
  let _installedIds = null;

  // Map of plugin id (lowercase) → installed version string
  // e.g. { "cjcardtweaks": "1.2-a3eb5e0" }
  let _installedVersions = null;

  async function fetchInstalledData() {
    if (_installedIds !== null) return;
    try {
      // Fetch id and version for each installed plugin
      const data = await gql(`query { plugins { id version } }`);
      _installedIds      = new Set();
      _installedVersions = {};
      (data?.plugins ?? []).forEach((p) => {
        const id = p.id.toLowerCase();
        _installedIds.add(id);
        _installedVersions[id] = (p.version || "").trim();
      });
    } catch {
      _installedIds      = new Set();
      _installedVersions = {};
    }
  }

  async function runInstalledMarker() {
    if (!featureInstalledMark) return;

    await fetchInstalledData();
    if (!_installedIds.size) return;

    // Run immediately in case the available list is already rendered
    markAvailablePlugins();

    // Watch the tab pane for the available-packages section to appear lazily
    const tabPane = getPluginsTabPane();
    if (!tabPane) return;

    let _markTimer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(_markTimer);
      _markTimer = setTimeout(() => markAvailablePlugins(), 200);
    });
    obs.observe(tabPane, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000);
  }

  function markAvailablePlugins() {
    // Target ONLY the available-packages table, not the installed-packages table.
    const availableSection = document.querySelector(
      "#configuration-tabs-tabpane-plugins .available-packages"
    );
    if (!availableSection) return;

    const rows = availableSection.querySelectorAll("table tbody tr");
    if (!rows.length) return;

    rows.forEach((row) => {
      // Skip source header rows and already-coloured rows
      if (row.classList.contains("package-source")) return;
      if (row.dataset.gzoMarked) return;

      const pkgIdEl = row.querySelector(".package-id");
      if (!pkgIdEl) return;
      const pkgId = pkgIdEl.textContent.trim().toLowerCase();

      if (!_installedIds.has(pkgId)) return; // Not installed — leave row alone

      // The .package-version span contains ONLY the version string (e.g. "1.2-a3eb5e0").
      // The .package-date span (sibling) contains the date — we must NOT include it.
      // We read textContent of .package-version only, strip whitespace.
      const availVerEl   = row.querySelector(".package-version");
      const availVersion = availVerEl ? availVerEl.textContent.trim() : "";

      // GraphQL returns only the base version (e.g. "1.2"), while the available
      // list shows "1.2-a3eb5e0" (base + git hash). Strip the hash for comparison.
      const stripHash = (v) => v.split("-")[0].trim();
      const installedVersion = stripHash(_installedVersions[pkgId] || "");
      const availBase        = stripHash(availVersion);

      // Use configured colours: match color or mismatch color
      const color = (availBase === installedVersion && installedVersion !== "") ? markerColorMatch : markerColorMismatch;

      // Apply color to all td text content (not background)
      row.querySelectorAll("td").forEach((td) => {
        td.style.color = color;
      });
      // Also colour the checkbox cell border for visibility
      row.style.setProperty("--gzo-row-color", color);
      row.dataset.gzoMarked = "1";
    });
  }

  // ============================================================
  // MAIN INIT — runs once, then again on every tab visit via poll
  // ============================================================

  // Load category data from saved settings
  async function loadCatData(saved) {
    if (saved.categories) {
      try { categories = JSON.parse(saved.categories); } catch {}
    }
    if (!categories.length) categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));

    if (saved.assignments) {
      try { assignments = JSON.parse(saved.assignments); } catch {}
    }

    // First-run auto-assign (no saved assignments yet)
    if (!saved.assignments) {
      getPluginGroups().forEach((group) => {
        const name = getPluginName(group);
        if (!name || assignments[name]) return;
        const catId = autoAssign(name);
        if (catId) assignments[name] = catId;
      });
      await persistCatState();
    }
  }

  // Full run: load flags → apply all active modules in correct order
  async function runAll() {
    const all  = await loadSettings();
    const self = all[PLUGIN_ID] ?? {};

    // Feature flags (missing key = ON)
    featureGrouping    = self.grouping_enabled    !== false;
    featureCollapse    = self.collapse_enabled    !== false;
    featureCategorizer   = self.categorizer_enabled    !== false;
    featureInstalledMark  = self.installed_marker_enabled !== false;
    // Load custom colors, falling back to defaults if not set
    markerColorMatch    = (self.installed_marker_color_match    || "").trim() || "#b3ffb3";
    markerColorMismatch = (self.installed_marker_color_mismatch || "").trim() || "#ffbf80";

    // Load category data
    await loadCatData(self);

    // Find the plugins list wrapper
    const wrapper = getPluginsWrapper();
    if (!wrapper) return;

    // Order matters: Grouping must run before Collapse and Categorizer
    // so the DOM structure is correct when they process it.
    runGrouping(wrapper);
    runCollapse(wrapper);
    applyCategories();
    injectCatButton();
    runInstalledMarker(); // Mark installed plugins in the Available Plugins view
  }

  // ── Lightweight tab-change poll (no MutationObserver) ────────────────────
  // Checks location.href at 800ms intervals. Re-runs all modules once per
  // visit to the plugins tab. Costs essentially nothing between tab visits.
  let _lastHref    = location.href;
  let _tabHandled  = false;

  function checkTabChange() {
    const href = location.href;
    if (href !== _lastHref) {
      // URL changed — user navigated away, reset for next visit
      _lastHref   = href;
      _tabHandled = false;

      // Clean up injected elements — they'll be re-injected on next tab visit
      document.getElementById("gzo-cat-edit-btn")?.remove();
      _installedIds      = null; // Reset installed-plugins cache
      _installedVersions = null;
    }

    if (!_tabHandled && getPluginsTabPane()) {
      // Plugins tab just became active — run all modules
      _tabHandled = true;
      runAll();
    }
  }

  setInterval(checkTabChange, 800);

  // Initial run (page load may already be on plugins tab)
  setTimeout(runAll, 600);
})();
