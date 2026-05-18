// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
let TOKEN = "";
let USERNAME = "";
let REPOS = [];
let CURRENT_REPO = null;
let CURRENT_PATH = "";
let DELETE_TARGET = "";

const API = "https://api.github.com";
const STORAGE_KEY = "gh_mgr_token";
const THEME_KEY = "gh_mgr_theme";
const SEARCH_HISTORY_KEY = "gh_mgr_search_history";
const SAVED_SEARCHES_KEY = "gh_mgr_saved_searches";
const MAX_SEARCH_HISTORY = 12;
let RATE_LIMIT = { remaining: null, limit: null, reset: null };
let SEARCH_DEBOUNCE_TIMER = null;

// ═══════════════════════════════════════
//  THEME
// ═══════════════════════════════════════
function applyTheme(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (theme === "light") {
    document.body.classList.add("light");
    if (btn) btn.textContent = "☀️";
  } else {
    document.body.classList.remove("light");
    if (btn) btn.textContent = "🌙";
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light");
  const next = isLight ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Inicializuj motiv ihned
(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
})();

// AI Links Modal
const aiToggleBtn = document.getElementById('aiToggleBtn');
const aiLinksModal = document.getElementById('aiLinksModal');
const closeAiLinksModalBtn = document.getElementById('closeAiLinksModal');

if (aiToggleBtn && aiLinksModal && closeAiLinksModalBtn) {
  aiToggleBtn.addEventListener('click', () => {
    aiLinksModal.style.display = 'flex';
  });

  closeAiLinksModalBtn.addEventListener('click', () => {
    aiLinksModal.style.display = 'none';
  });

  // Close modal when clicking on overlay
  aiLinksModal.addEventListener('click', (e) => {
    if (e.target === aiLinksModal) {
      aiLinksModal.style.display = 'none';
    }
  });
}

function saveToken(token) {
  localStorage.setItem(STORAGE_KEY, btoa(token));
}
function loadToken() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v ? atob(v) : null;
}
function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

// ═══════════════════════════════════════
//  MOBILE PANEL SWITCHER
// ═══════════════════════════════════════
const MOBILE_BREAKPOINT = 640;

function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function setMobilePanel(panel) {
  if (!isMobile()) return;
  const sidebar = document.getElementById('sidebar');
  const mainPanel = document.getElementById('mainPanel');
  const tabSidebar = document.getElementById('mobileTabSidebar');
  const tabMain = document.getElementById('mobileTabMain');
  if (!sidebar || !mainPanel) return;

  if (panel === 'sidebar') {
    // Sidebar zobraz jen pokud je přihlášen (má display:flex normálně)
    if (TOKEN) sidebar.style.display = 'flex';
    mainPanel.style.display = 'none';
    tabSidebar.classList.add('active');
    tabMain.classList.remove('active');
  } else {
    if (TOKEN) sidebar.style.display = 'none';
    mainPanel.style.display = 'flex';
    tabSidebar.classList.remove('active');
    tabMain.classList.add('active');
  }
}

function initMobileTabs() {
  const tabs = document.getElementById('mobileTabs');
  if (isMobile()) {
    tabs.style.display = 'flex';
    setMobilePanel('main');
  } else {
    tabs.style.display = 'none';
  }
  // Aktualizuj badge s počtem repo
  const badge = document.getElementById('mobileRepoBadge');
  if (badge) badge.textContent = REPOS.length || '';
}

window.addEventListener('resize', () => {
  const tabs = document.getElementById('mobileTabs');
  const sidebar = document.getElementById('sidebar');
  const mainPanel = document.getElementById('mainPanel');
  if (!TOKEN) return;
  if (!isMobile()) {
    tabs.style.display = 'none';
    sidebar.style.display = 'flex';
    mainPanel.style.display = 'flex';
  } else {
    tabs.style.display = 'flex';
    // Nastav aktuální aktivní tab
    const activeTab = document.getElementById('mobileTabMain').classList.contains('active') ? 'main' : 'sidebar';
    setMobilePanel(activeTab);
  }
});

// ═══════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════
function toast(msg, type = "success", duration = 3200) {
  const t = document.getElementById("toast");
  const title = document.getElementById("toastTitle");
  const body = document.getElementById("toastMsg");
  title.textContent = type === "success" ? "✓ Úspěch" : "✕ Chyba";
  body.textContent = msg;
  t.className = "toast " + type;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), duration);
}

async function ghFetch(endpoint, options = {}) {
  const res = await fetch(API + endpoint, {
    ...options,
    headers: {
      Authorization: "token " + TOKEN,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  // Side effect: aktualizuj rate limit z response headers
  const rlRemaining = res.headers.get('X-RateLimit-Remaining');
  if (rlRemaining !== null) {
    RATE_LIMIT.remaining = parseInt(rlRemaining);
    RATE_LIMIT.limit = parseInt(res.headers.get('X-RateLimit-Limit') || '60');
    RATE_LIMIT.reset = parseInt(res.headers.get('X-RateLimit-Reset') || '0');
    updateRateLimitDisplay();
  }
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "GitHub API error");
  return data;
}

// ═══════════════════════════════════════
//  LOGIN / LOGOUT
// ═══════════════════════════════════════
document.getElementById("loginBtn").onclick = async () => {
  const token = document.getElementById("tokenInput").value.trim();
  if (!token) return toast("Zadáš token prosím.", "error");
  TOKEN = token;

  try {
    const user = await ghFetch("/user");
    USERNAME = user.login;
    saveToken(TOKEN);
    await loadRepos();
    // UI switch
    document.getElementById("loginPanel").style.display = "none";
    document.getElementById("sidebar").style.display = "flex";
    document.getElementById("mainContent").style.display = "block";
    document.getElementById("statusDot").classList.add("connected");
    document.getElementById("statusLabel").textContent = USERNAME;
    document.getElementById("logoutBtn").style.display = "inline-block";
    document.getElementById("searchBtn").style.display = "inline-flex";
    document.getElementById("sidebarGreeting").innerHTML = `👋 Ahoj, ${USERNAME}!<div class="sidebar-sub">Tvoje repozitáře</div>`;
    showHomeView();
    initMobileTabs();
    toast("Přihlášen jako " + USERNAME);
  } catch (e) {
    toast("Neplatný token nebo chyba: " + e.message, "error");
    TOKEN = "";
  }
};

document.getElementById("logoutBtn").onclick = () => {
  TOKEN = "";
  USERNAME = "";
  REPOS = [];
  CURRENT_REPO = null;
  CURRENT_PATH = "";
  clearToken();
  document.getElementById("tokenInput").value = "";
  document.getElementById("loginPanel").style.display = "flex";
  document.getElementById("sidebar").style.display = "none";
  document.getElementById("mainContent").style.display = "none";
  document.getElementById("statusDot").classList.remove("connected");
  document.getElementById("statusLabel").textContent = "Nepřihlášen";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("searchBtn").style.display = "none";
  document.getElementById("mobileTabs").style.display = "none";
  document.getElementById("sidebarGreeting").textContent = "Repozitáře";
  toast("Odhlášen.");
};

// ═══════════════════════════════════════
//  REPOS
// ═══════════════════════════════════════
async function loadRepos() {
  REPOS = await ghFetch("/user/repos?per_page=100&sort=updated");
  renderRepoList();
}

function renderRepoList() {
  const list = document.getElementById("repoList");
  if (!REPOS.length) {
    list.innerHTML =
      '<div class="empty-state" style="padding:40px 10px;"><div class="big">📭</div><p>Žádné repo</p></div>';
    return;
  }
  list.innerHTML = REPOS.map(
    (r) => `
  <div class="repo-item ${CURRENT_REPO === r.name ? "active" : ""}" data-repo="${r.name}">
    <span class="icon">📁</span>
    <span class="name">${r.name}</span>
    <span class="visibility ${r.private ? "priv" : "pub"}">${r.private ? "🔒" : "🌐"}</span>
  </div>
`,
  ).join("");

  // click → open repo
  list.querySelectorAll(".repo-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      openRepo(el.dataset.repo);
    });
  });
}

// ═══════════════════════════════════════
//  OPEN REPO / BROWSE FILES
// ═══════════════════════════════════════
// Globální proměnné pro filtrování a třídění
let ALL_FILES = [];
let CURRENT_SORT = "name-asc";
let CURRENT_FILTER = "";

async function openRepo(repoName, path = "") {
  CURRENT_REPO = repoName;
  CURRENT_PATH = path;
  renderRepoList(); // highlight
  setMobilePanel('main'); // na mobilu přepni na obsah

  const view = document.getElementById("repoView");
  const toolbar = document.getElementById("fileToolbar");
  view.innerHTML = '<div class="spinner"></div>';
  toolbar.style.display = "flex";

  try {
    const endpoint = path
      ? `/repos/${USERNAME}/${repoName}/contents/${path}`
      : `/repos/${USERNAME}/${repoName}/contents`;
    const contents = await ghFetch(endpoint);
    const repoInfo = await ghFetch(`/repos/${USERNAME}/${repoName}`);

    ALL_FILES = contents;
    renderFileList(repoInfo, repoName, path);
  } catch (e) {
    view.innerHTML = `<div class="empty-state"><div class="big">⚠️</div><p>Chyba: ${e.message}</p></div>`;
    toolbar.style.display = "none";
  }
}

function renderFileList(repoInfo, repoName, path) {
  const view = document.getElementById("repoView");

  // Filtrování
  let filtered = ALL_FILES;
  if (CURRENT_FILTER) {
    const filter = CURRENT_FILTER.toLowerCase();
    filtered = ALL_FILES.filter((item) =>
      item.name.toLowerCase().includes(filter),
    );
  }

  // Třídění
  let sorted = [...filtered];
  switch (CURRENT_SORT) {
    case "name-asc":
      sorted.sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") return -1;
        if (a.type !== "dir" && b.type === "dir") return 1;
        return a.name.localeCompare(b.name);
      });
      break;
    case "name-desc":
      sorted.sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") return -1;
        if (a.type !== "dir" && b.type === "dir") return 1;
        return b.name.localeCompare(a.name);
      });
      break;
    case "size-asc":
      sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
      break;
    case "size-desc":
      sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      break;
    case "type-asc":
      sorted.sort((a, b) => {
        const extA = a.name.split(".").pop().toLowerCase();
        const extB = b.name.split(".").pop().toLowerCase();
        return extA.localeCompare(extB);
      });
      break;
  }

  // breadcrumb with up button
  let bc = "";

  // Přidat tlačítko "o složku výš" pokud nejsme v root
  if (path) {
    const parts = path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    bc += `<button class="up-btn" onclick="openRepo('${repoName}', '${parentPath}')" title="O složku výš">↑</button>`;
  } else if (CURRENT_REPO) {
    bc += `<button class="up-btn" onclick="showHomeView()" title="Zpět na home">↑</button>`;
  }

  bc += `<span onclick="showHomeView()" style="cursor:pointer;">🏠 Home</span>`;
  bc += ` <span class="sep">›</span> <span onclick="openRepo('${repoName}')" style="cursor:pointer;" ${!path ? 'class="active"' : ""}>${repoName}</span>`;
  if (path) {
    const parts = path.split("/");
    let cumul = "";
    parts.forEach((p, i) => {
      cumul += (cumul ? "/" : "") + p;
      const isLast = i === parts.length - 1;
      bc += ` <span class="sep">›</span> <span ${isLast ? 'class="active"' : `onclick="openRepo('${repoName}','${cumul}')" style="cursor:pointer;"`}>${p}</span>`;
    });
  }
  document.getElementById("breadcrumb").innerHTML = bc;

  // table
  let html = `
    <div class="repo-header">
      <div>
        <h3>📁 ${repoName} <span class="visibility ${repoInfo.private ? "priv" : "pub"} visibility-toggle"
          data-repo="${repoName}" data-private="${repoInfo.private}"
          style="font-size:11px; vertical-align:middle;"
          title="Klikni pro změnu viditelnosti">${repoInfo.private ? "🔒 Private" : "🌐 Public"}</span></h3>
        <div class="desc" data-repo="${repoName}" data-desc="${repoInfo.description || ""}" title="Klikni pro úpravu popisu">${repoInfo.description || "<em>Klikni pro přidání popisu</em>"}</div>
      </div>
      <div class="stats">
        <div class="stat">⭐ <span>${repoInfo.stargazers_count}</span></div>
        <div class="stat">🔀 <span>${repoInfo.forks_count}</span></div>
        <div class="stat">📝 <span>${repoInfo.open_issues_count} issues</span></div>
        <button class="btn-secondary" onclick="openCloneModal('${repoName}', '${repoInfo.clone_url}', '${repoInfo.ssh_url}')" style="font-size:11px; padding:4px 10px; margin-left:8px;" title="Clone / Git příkazy">🔗 Clone</button>
      </div>
    </div>
    <div class="toolbar-actions">
      <button class="btn-secondary" id="uploadFilesBtn">
        <span>📤</span> Nahrát soubory
      </button>
      <button class="btn-secondary" id="uploadFolderBtn">
        <span>📁</span> Nahrát složku
      </button>
      <button class="btn-secondary" id="uploadFolderContentsBtn" title="Nahraje obsah složky bez samotné složky — soubory půjdou přímo do aktuálního umístění">
        <span>📂</span> Nahrát obsah složky
      </button>
      <button class="btn-secondary" id="uploadSmartSyncBtn" title="Porovná SHA souborů s GitHubem a nahraje jen chybějící nebo změněné soubory" style="color:var(--accent); border-color:var(--accent);">
        <span>⚡</span> Smart sync složky
      </button>
      <button class="btn-secondary" id="selectAllBtn">
        <span>☑️</span> Vybrat vše
      </button>
      <button class="btn-secondary" id="deselectAllBtn" style="display:none;">
        <span>⬜</span> Zrušit výběr
      </button>
      <button class="btn-secondary" id="deleteSelectedBtn" style="display:none; color:var(--red); border-color:var(--red);">
        <span>🗑️</span> Smazat vybrané
      </button>
      <button class="btn-secondary" id="newFileBtn" onclick="openNewFileModal()" style="background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600;">
        <span>➕</span> Nový soubor/složka
      </button>
    </div>
    <table class="file-table">
      <thead><tr>
        <th style="width:40px;"><input type="checkbox" id="selectAllCheckbox" class="file-checkbox" /></th>
        <th>Název</th>
        <th>Typ</th>
        <th>Velikost</th>
      </tr></thead>
      <tbody>
  `;
  sorted.forEach((item) => {
    const isDir = item.type === "dir";
    const iconEmoji = isDir ? "📂" : getFileIcon(item.name);
    const nameClass = isDir ? "folder-name" : "file-name";
    const size = isDir ? "—" : formatBytes(item.size);
    html += `
      <tr class="file-row" data-name="${item.name}" data-path="${item.path}" data-type="${item.type}" data-size="${item.size || 0}">
        <td class="checkbox-cell"><input type="checkbox" class="file-checkbox row-checkbox" data-path="${item.path}" /></td>
        <td><span class="icon">${iconEmoji}</span><span class="${nameClass}">${item.name}</span></td>
        <td class="meta">${isDir ? "Složka" : "Soubor"}</td>
        <td class="meta">${size}</td>
      </tr>
    `;
  });
  html += `</tbody></table>`;

  // Viditelná drag&drop zóna
  html += `
    <div class="inline-drop-zone" id="inlineDropZone">
      <div class="inline-drop-content">
        <span class="drop-icon">📤</span>
        <span class="drop-text">Přetáhni sem soubory nebo více složek najednou</span>
        <span class="drop-sub">Tlačítko "Nahrát složku" = vždy jedna složka, drag&drop = neomezený počet</span>
      </div>
    </div>
  `;
  view.innerHTML = html;

  // bind click events on rows
  view.querySelectorAll(".file-row").forEach((row) => {
    // Levý klik: otevřít soubor/složku
    row.addEventListener("click", (e) => {
      // Pokud klikl na checkbox, neotvírej soubor
      if (
        e.target.classList.contains("file-checkbox") ||
        e.target.classList.contains("checkbox-cell")
      ) {
        return;
      }
      e.preventDefault();
      const isDir = row.dataset.type === "dir";
      if (isDir) {
        // Otevřít složku
        openRepo(repoName, row.dataset.path);
      } else {
        // Otevřít soubor (zobrazit obsah nebo preview)
        openFile(row.dataset.name, row.dataset.path, repoName);
      }
    });

    // Pravý klik: kontextové menu
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openFileContext(
        row.dataset.name,
        row.dataset.path,
        row.dataset.type,
        parseInt(row.dataset.size),
        repoName,
      );
    });

    // Touch podpora (dlouhý stisk) pro mobil
    let touchTimer = null;
    row.addEventListener("touchstart", (e) => {
      touchTimer = setTimeout(() => {
        e.preventDefault();
        openFileContext(
          row.dataset.name,
          row.dataset.path,
          row.dataset.type,
          parseInt(row.dataset.size),
          repoName,
        );
      }, 500);
    });
    row.addEventListener("touchend", () => {
      if (touchTimer) clearTimeout(touchTimer);
    });
    row.addEventListener("touchmove", () => {
      if (touchTimer) clearTimeout(touchTimer);
    });
  });

  // Bind visibility toggle
  const visToggle = view.querySelector(".visibility-toggle");
  if (visToggle) {
    visToggle.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const repo = e.currentTarget.dataset.repo;
      const isPrivate = e.currentTarget.dataset.private === "true";
      try {
        await ghFetch(`/repos/${USERNAME}/${repo}`, {
          method: "PATCH",
          body: JSON.stringify({ private: !isPrivate }),
        });
        toast(
          `Viditelnost změněna na ${!isPrivate ? "Private" : "Public"}`,
        );
        await loadRepos();
        openRepo(repo, path);
      } catch (err) {
        toast("Chyba při změně viditelnosti: " + err.message, "error");
      }
    });
  }

  // Bind description edit
  const descEl = view.querySelector(".desc");
  if (descEl) {
    descEl.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const repo = e.currentTarget.dataset.repo;
      const currentDesc = e.currentTarget.dataset.desc;
      document.getElementById("editDescInput").value = currentDesc;
      document.getElementById("editDescModal").style.display = "flex";
      document.getElementById("editDescInput").focus();

      // Store for later
      window.EDIT_DESC_REPO = repo;
      window.EDIT_DESC_PATH = path;
    });
  }

  // Bind checkbox selection
  const selectAllCb = document.getElementById("selectAllCheckbox");
  const rowCheckboxes = view.querySelectorAll(".row-checkbox");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const deselectAllBtn = document.getElementById("deselectAllBtn");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");

  function updateSelectionUI() {
    const checkedCount = Array.from(rowCheckboxes).filter(
      (cb) => cb.checked,
    ).length;
    if (checkedCount > 0) {
      deselectAllBtn.style.display = "inline-flex";
      selectAllBtn.style.display = "none";
      selectAllCb.checked = checkedCount === rowCheckboxes.length;
      if (deleteSelectedBtn) {
        deleteSelectedBtn.style.display = "inline-flex";
        deleteSelectedBtn.textContent = `🗑️ Smazat (${checkedCount})`;
      }
    } else {
      deselectAllBtn.style.display = "none";
      selectAllBtn.style.display = "inline-flex";
      selectAllCb.checked = false;
      if (deleteSelectedBtn) deleteSelectedBtn.style.display = "none";
    }
  }

  selectAllCb.addEventListener("change", () => {
    rowCheckboxes.forEach((cb) => (cb.checked = selectAllCb.checked));
    updateSelectionUI();
  });

  selectAllBtn.addEventListener("click", () => {
    rowCheckboxes.forEach((cb) => (cb.checked = true));
    selectAllCb.checked = true;
    updateSelectionUI();
  });

  deselectAllBtn.addEventListener("click", () => {
    rowCheckboxes.forEach((cb) => (cb.checked = false));
    selectAllCb.checked = false;
    updateSelectionUI();
  });

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", () => {
      deleteSelectedItems(repoName, path);
    });
  }

  rowCheckboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      updateSelectionUI();
    });
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });

  // Upload button
  const uploadBtn = document.getElementById("uploadFilesBtn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      openFileUploadDialog(repoName, path);
    });
  }

  // Upload folder button (se složkou jako prefixem)
  const uploadFolderBtn = document.getElementById("uploadFolderBtn");
  if (uploadFolderBtn) {
    uploadFolderBtn.addEventListener("click", () => {
      openFileUploadDialog(repoName, path, "folder");
    });
  }

  // Upload folder CONTENTS button (bez prefixu složky)
  const uploadFolderContentsBtn = document.getElementById("uploadFolderContentsBtn");
  if (uploadFolderContentsBtn) {
    uploadFolderContentsBtn.addEventListener("click", () => {
      openFileUploadDialog(repoName, path, "contents");
    });
  }

  // Smart sync button — nahraje jen chybějící/změněné soubory
  const uploadSmartSyncBtn = document.getElementById("uploadSmartSyncBtn");
  if (uploadSmartSyncBtn) {
    uploadSmartSyncBtn.addEventListener("click", () => {
      openFileUploadDialog(repoName, path, "smartsync");
    });
  }

  // Inline drop zone — jen klik (drop zpracuje mainContent handler výše)
  const inlineDropZone = document.getElementById("inlineDropZone");
  if (inlineDropZone) {
    inlineDropZone.addEventListener("click", () => {
      openFileUploadDialog(repoName, path);
    });
    // Vizuální highlight při hoveru (drag eventy probublají na mainContent)
    inlineDropZone.addEventListener("dragenter", (e) => {
      inlineDropZone.classList.add("drag-active");
    });
    inlineDropZone.addEventListener("dragleave", (e) => {
      if (!inlineDropZone.contains(e.relatedTarget)) {
        inlineDropZone.classList.remove("drag-active");
      }
    });
  }
}

// ═══════════════════════════════════════
//  OPEN FILE (not context menu)
// ═══════════════════════════════════════
function openFile(name, path, repo) {
  const isHtml = /\.html?$/i.test(name);

  if (isHtml) {
    // Otevřít HTML soubor v novém tabu s GitHub Pages URL
    const githubPagesUrl = `https://${USERNAME}.github.io/${repo}/${path}`;
    window.open(githubPagesUrl, "_blank");
    toast(`Otevírám ${name} v novém tabu...`);
  } else {
    // Pro ostatní soubory zobrazit kontextové menu
    openFileContext(name, path, "file", 0, repo);
  }
}

function showHomeView() {
  CURRENT_REPO = null;
  CURRENT_PATH = "";
  renderRepoList();
  setMobilePanel('main'); // na mobilu přepni na obsah
  document.getElementById("fileToolbar").style.display = "none";
  document.getElementById("breadcrumb").innerHTML =
    '<span class="active">🏠 Home</span>';

  const view = document.getElementById("repoView");
  if (!REPOS.length) {
    view.innerHTML = `<div class="empty-state"><div class="big">🚀</div><p>Nemáš žádné repozitář. Klikni <strong>+</strong> a vytvoř první!</p></div>`;
    return;
  }
  view.innerHTML = `
  <table class="file-table repo-table-home">
    <thead><tr><th>Repozitář</th><th>Viditelnost</th><th>Popis</th><th>Aktualizován</th></tr></thead>
    <tbody>
      ${REPOS.map(
        (r) => `
        <tr class="repo-row" data-repo="${r.name}" style="cursor:pointer;">
          <td><span class="icon">📁</span><span class="folder-name">${r.name}</span></td>
          <td><span class="visibility ${r.private ? "priv" : "pub"}">${r.private ? "🔒 Private" : "🌐 Public"}</span></td>
          <td class="meta">${r.description || "—"}</td>
          <td class="meta">${new Date(r.updated_at).toLocaleDateString("cs-CZ")}</td>
        </tr>
      `,
      ).join("")}
    </tbody>
  </table>
`;

  // Bind events na repo rows
  view.querySelectorAll(".repo-row").forEach((row) => {
    // Levý klik - otevřít repo
    row.addEventListener("click", () => {
      openRepo(row.dataset.repo);
    });

    // Pravý klik - context menu
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openRepoContext(row.dataset.repo);
    });

    // Touch podpora (dlouhý stisk) pro mobil
    let touchTimer = null;
    row.addEventListener("touchstart", (e) => {
      touchTimer = setTimeout(() => {
        e.preventDefault();
        openRepoContext(row.dataset.repo);
      }, 500);
    });
    row.addEventListener("touchend", () => {
      if (touchTimer) clearTimeout(touchTimer);
    });
    row.addEventListener("touchmove", () => {
      if (touchTimer) clearTimeout(touchTimer);
    });
  });
}

// ═══════════════════════════════════════
//  NEW REPO
// ═══════════════════════════════════════
document.getElementById("newRepoBtn").onclick = () => {
  document.getElementById("newRepoName").value = "";
  document.getElementById("newRepoDesc").value = "";
  document.getElementById("newRepoModal").style.display = "flex";
};
document.getElementById("cancelNewRepo").onclick = () => {
  document.getElementById("newRepoModal").style.display = "none";
};
// ═══════════════════════════════════════
//  NEW FILE/FOLDER
// ═══════════════════════════════════════
function openNewFileModal() {
  if (!CURRENT_REPO) return;
  document.getElementById("newFileModal").style.display = "flex";
  document.getElementById("newItemName").value = "";
  document.getElementById("newFileContent").value = "";
  document.getElementById("newItemType").value = "file";
  document.getElementById("fileContentSection").style.display = "block";
  document.getElementById("newItemName").focus();
}

document.getElementById("newItemType").addEventListener("change", (e) => {
  const isFolder = e.target.value === "folder";
  document.getElementById("fileContentSection").style.display = isFolder
    ? "none"
    : "block";
  document.getElementById("newItemName").placeholder = isFolder
    ? "nazev-slozky/"
    : "nazev.txt";
});

document.getElementById("cancelNewItem").onclick = () => {
  document.getElementById("newFileModal").style.display = "none";
};

document.getElementById("confirmNewItem").onclick = async () => {
  const type = document.getElementById("newItemType").value;
  let name = document.getElementById("newItemName").value.trim();
  const content = document.getElementById("newFileContent").value;

  if (!name) {
    toast("Zadej název", "error");
    return;
  }

  try {
    if (type === "folder") {
      // GitHub nemá prázdné složky, vytvoříme .gitkeep
      if (!name.endsWith("/")) name += "/";
      const filePath = CURRENT_PATH
        ? `${CURRENT_PATH}/${name}.gitkeep`
        : `${name}.gitkeep`;
      await ghFetch(
        `/repos/${USERNAME}/${CURRENT_REPO}/contents/${filePath}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: `Create folder: ${name}`,
            content: btoa(""),
          }),
        },
      );
      toast(`Složka "${name}" vytvořena`);
    } else {
      // Vytvořit soubor
      const filePath = CURRENT_PATH ? `${CURRENT_PATH}/${name}` : name;
      await ghFetch(
        `/repos/${USERNAME}/${CURRENT_REPO}/contents/${filePath}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: `Create file: ${name}`,
            content: btoa(unescape(encodeURIComponent(content || ""))),
          }),
        },
      );
      toast(`Soubor "${name}" vytvořen`);
    }

    document.getElementById("newFileModal").style.display = "none";
    openRepo(CURRENT_REPO, CURRENT_PATH);
  } catch (e) {
    toast("Chyba při vytváření: " + e.message, "error");
  }
};

// Close modal on overlay click
document.getElementById("newFileModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("newFileModal")) {
    document.getElementById("newFileModal").style.display = "none";
  }
});

document.getElementById("confirmNewRepo").onclick = async () => {
  const name = document.getElementById("newRepoName").value.trim();
  if (!name) return toast("Zadáš název repozitáře.", "error");

  const payload = {
    name,
    description: document.getElementById("newRepoDesc").value.trim(),
    private:
      document.getElementById("newRepoVisibility").value === "true",
    auto_init: document.getElementById("newRepoReadme").checked,
  };

  try {
    await ghFetch("/user/repos", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    document.getElementById("newRepoModal").style.display = "none";
    toast("Repozitář „" + name + '" vytvořen!');
    await loadRepos();
    openRepo(name);
  } catch (e) {
    toast("Chyba: " + e.message, "error");
  }
};

// ═══════════════════════════════════════
//  DELETE REPO
// ═══════════════════════════════════════
function openDeleteModal(name) {
  DELETE_TARGET = name;
  const lastTwo = name.slice(-2);
  document.getElementById("deleteRepoNameShow").textContent = name;
  document.getElementById("deleteHintLetters").textContent = lastTwo;
  document.getElementById("deleteRepoConfirm").value = "";
  document.getElementById("confirmDeleteRepo").disabled = true;
  document.getElementById("deleteRepoModal").style.display = "flex";
  document.getElementById("deleteRepoConfirm").focus();
}
document.getElementById("cancelDeleteRepo").onclick = () => {
  document.getElementById("deleteRepoModal").style.display = "none";
};
document.getElementById("deleteRepoConfirm").oninput = function () {
  document.getElementById("confirmDeleteRepo").disabled =
    this.value.trim() !== DELETE_TARGET.slice(-2);
};
document.getElementById("confirmDeleteRepo").onclick = async () => {
  try {
    await ghFetch(`/repos/${USERNAME}/${DELETE_TARGET}`, {
      method: "DELETE",
    });
    document.getElementById("deleteRepoModal").style.display = "none";
    toast("Repozitář „" + DELETE_TARGET + '" smazán.');
    await loadRepos();
    showHomeView();
  } catch (e) {
    toast("Chyba při mazání: " + e.message, "error");
  }
};

// ═══════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  const icons = {
    html: "🌐",
    css: "🎨",
    js: "⚡",
    ts: "💎",
    json: "📋",
    md: "📝",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    py: "🐍",
    rb: "💎",
    java: "☕",
    txt: "📄",
    yml: "⚙️",
    yaml: "⚙️",
    gitignore: "🙈",
    env: "🔐",
    lock: "🔒",
    xml: "📋",
    csv: "📊",
  };
  return icons[ext] || "📄";
}

// ═══════════════════════════════════════
//  BACKUP (download all repos as ZIP)
// ═══════════════════════════════════════
let BACKUP_CANCELLED = false;

document.getElementById("backupBtn").onclick = () => {
  if (!REPOS.length)
    return toast("Nemáš žádné repozitář na stáhnoutí.", "error");
  BACKUP_CANCELLED = false;
  document.getElementById("backupModal").style.display = "flex";
  document.getElementById("backupProgressBar").style.width = "0%";
  document.getElementById("backupPercent").textContent = "0%";
  document.getElementById("backupStatus").textContent = "Začíná...";
  document.getElementById("backupRepoList").innerHTML = REPOS.map(
    (r) =>
      `<div id="backupItem-${r.name}" style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid var(--border); font-size:12px;">
    <span id="backupIcon-${r.name}" style="width:16px; text-align:center;">⏳</span>
    <span style="flex:1; color:var(--text);">${r.name}</span>
    <span id="backupCount-${r.name}" style="color:var(--text-dim); font-size:11px;">—</span>
  </div>`,
  ).join("");
  startBackup();
};

document.getElementById("cancelBackup").onclick = () => {
  BACKUP_CANCELLED = true;
  document.getElementById("backupModal").style.display = "none";
  toast("Backup zrušen.");
};

// ── recursively fetch all files in a repo ──
async function fetchAllFiles(repoName, path = "") {
  const endpoint = path
    ? `/repos/${USERNAME}/${repoName}/contents/${path}`
    : `/repos/${USERNAME}/${repoName}/contents`;
  const items = await ghFetch(endpoint);
  let files = [];
  for (const item of items) {
    if (BACKUP_CANCELLED) return [];
    if (item.type === "dir") {
      const sub = await fetchAllFiles(repoName, item.path);
      files = files.concat(sub);
    } else {
      // fetch file content (base64)
      const fileData = await ghFetch(
        `/repos/${USERNAME}/${repoName}/contents/${item.path}`,
      );
      files.push({
        path: repoName + "/" + item.path,
        content: fileData.content,
      });
    }
  }
  return files;
}

async function startBackup() {
  const totalRepos = REPOS.length;
  let allFiles = [];

  for (let i = 0; i < totalRepos; i++) {
    if (BACKUP_CANCELLED) return;
    const repo = REPOS[i];
    document.getElementById("backupStatus").textContent =
      `Stahuje: ${repo.name}...`;
    document.getElementById("backupIcon-" + repo.name).textContent = "📥";

    try {
      const files = await fetchAllFiles(repo.name);
      if (BACKUP_CANCELLED) return;
      allFiles = allFiles.concat(files);
      document.getElementById("backupIcon-" + repo.name).textContent =
        "✅";
      document.getElementById("backupCount-" + repo.name).textContent =
        files.length + " soubor" + (files.length === 1 ? "" : "ů");
    } catch (e) {
      document.getElementById("backupIcon-" + repo.name).textContent =
        "❌";
      document.getElementById("backupCount-" + repo.name).textContent =
        "chyba";
    }

    const pct = Math.round(((i + 1) / totalRepos) * 100);
    document.getElementById("backupProgressBar").style.width = pct + "%";
    document.getElementById("backupPercent").textContent = pct + "%";
  }

  if (BACKUP_CANCELLED) return;

  // build ZIP and download
  document.getElementById("backupStatus").textContent = "Balí do ZIP...";
  const zipBlob = buildZip(allFiles);
  downloadBlob(
    zipBlob,
    `github-backup-${USERNAME}-${new Date().toISOString().slice(0, 10)}.zip`,
  );
  document.getElementById("backupModal").style.display = "none";
  toast(
    `Backup hotov – ${allFiles.length} soubor` +
      (allFiles.length === 1 ? "" : "ů") +
      ` v ZIP.`,
  );
}

// ── manual ZIP builder (no external library) ──
function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.path);
    const contentBytes = Uint8Array.from(atob(file.content), (c) =>
      c.charCodeAt(0),
    );
    const crc = crc32(contentBytes);

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // signature
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // compression = stored
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0, true); // mod date
    localView.setUint32(14, crc, true); // crc32
    localView.setUint32(18, contentBytes.length, true); // compressed size
    localView.setUint32(22, contentBytes.length, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true); // filename length
    localView.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);
    localHeaders.push({
      header: local,
      content: contentBytes,
      nameBytes,
      crc,
      offset,
    });

    // Central directory header
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); // signature
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // flags
    centralView.setUint16(10, 0, true); // compression
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0, true); // mod date
    centralView.setUint32(16, crc, true); // crc32
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attr
    centralView.setUint32(38, 0, true); // external attr
    centralView.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length + contentBytes.length;
  }

  // End of central directory
  let centralSize = 0;
  centralHeaders.forEach((c) => (centralSize += c.length));
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  // Concatenate everything
  const totalSize = offset + centralSize + eocd.length;
  const zip = new Uint8Array(totalSize);
  let pos = 0;
  localHeaders.forEach(({ header, content }) => {
    zip.set(header, pos);
    pos += header.length;
    zip.set(content, pos);
    pos += content.length;
  });
  centralHeaders.forEach((c) => {
    zip.set(c, pos);
    pos += c.length;
  });
  zip.set(eocd, pos);

  return new Blob([zip], { type: "application/zip" });
}

// ── CRC32 ──
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── trigger browser download ──
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════
//  REPO CONTEXT MENU
// ═══════════════════════════════════════
function openRepoContext(repoName) {
  const repo = REPOS.find((r) => r.name === repoName);
  if (!repo) return;

  document.getElementById("repoCtxName").textContent = repoName;
  document.getElementById("repoCtxMeta").textContent = repo.private
    ? "🔒 Private"
    : "🌐 Public";
  document.getElementById("repoCtxModal").style.display = "flex";

  // Rename button
  document.getElementById("repoCtxRename").onclick = () => {
    document.getElementById("repoCtxModal").style.display = "none";
    const newName = prompt(
      `Přejmenovat repozitář "${repoName}" na:`,
      repoName,
    );
    if (newName && newName !== repoName) {
      renameRepo(repoName, newName);
    }
  };

  // Delete button
  document.getElementById("repoCtxDelete").onclick = () => {
    document.getElementById("repoCtxModal").style.display = "none";
    openDeleteModal(repoName);
  };
}

// Close repo context modal on overlay click
document.getElementById("repoCtxModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("repoCtxModal")) {
    document.getElementById("repoCtxModal").style.display = "none";
  }
});

async function renameRepo(oldName, newName) {
  try {
    await ghFetch(`/repos/${USERNAME}/${oldName}`, {
      method: "PATCH",
      body: JSON.stringify({ name: newName }),
    });
    toast(`Repozitář přejmenován na "${newName}"`);
    await loadRepos();
    if (CURRENT_REPO === oldName) {
      openRepo(newName, CURRENT_PATH);
    } else {
      showHomeView();
    }
  } catch (e) {
    toast("Chyba při přejmenování: " + e.message, "error");
  }
}

// ═══════════════════════════════════════
//  EDIT DESCRIPTION MODAL
// ═══════════════════════════════════════
document.getElementById("cancelEditDesc").onclick = () => {
  document.getElementById("editDescModal").style.display = "none";
};

document.getElementById("confirmEditDesc").onclick = async () => {
  const newDesc = document.getElementById("editDescInput").value.trim();
  const repo = window.EDIT_DESC_REPO;
  const path = window.EDIT_DESC_PATH;

  try {
    await ghFetch(`/repos/${USERNAME}/${repo}`, {
      method: "PATCH",
      body: JSON.stringify({ description: newDesc }),
    });
    document.getElementById("editDescModal").style.display = "none";
    toast("Popis aktualizován");
    await loadRepos();
    openRepo(repo, path);
  } catch (e) {
    toast("Chyba při úpravě popisu: " + e.message, "error");
  }
};

document
  .getElementById("editDescModal")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("editDescModal")) {
      document.getElementById("editDescModal").style.display = "none";
    }
  });

// ═══════════════════════════════════════
//  FILE VIEWER MODAL
// ═══════════════════════════════════════
let VIEWER_FILE = {};
let VIEWER_FILE_SHA = "";
let VIEWER_IS_MODIFIED = false;
let VIEWER_ORIGINAL_CONTENT = "";
let VIEWER_SEARCH_MATCHES = [];
let VIEWER_CURRENT_MATCH = -1;

async function openFileViewer(name, path, repo) {
  VIEWER_FILE = { name, path, repo };
  VIEWER_FILE_SHA = "";
  VIEWER_IS_MODIFIED = false;
  VIEWER_SEARCH_MATCHES = [];
  VIEWER_CURRENT_MATCH = -1;

  document.getElementById("viewerFileName").textContent = name;
  document.getElementById("viewerFileMeta").textContent =
    `${repo}/${path}`;
  document.getElementById("viewerFileIcon").textContent =
    getFileIcon(name);
  document.getElementById("fileViewerModal").style.display = "flex";
  document.getElementById("fileViewerContent").textContent = "Načítám...";
  document.getElementById("searchInput").value = "";
  document.getElementById("replaceInput").value = "";
  document.getElementById("replaceControls").style.display = "none";
  document.getElementById("searchCounter").textContent = "";

  try {
    const fileData = await ghFetch(
      `/repos/${USERNAME}/${repo}/contents/${path}`,
    );

    // Správné dekódování UTF-8 (podpora českých znaků)
    const binaryString = atob(fileData.content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const content = new TextDecoder("utf-8").decode(bytes);

    VIEWER_ORIGINAL_CONTENT = content;
    VIEWER_FILE_SHA = fileData.sha;
    document.getElementById("saveFileBtn").style.display = "none";
    document.getElementById("fileViewerContent").textContent = content;
    document.getElementById("viewerFileMeta").textContent =
      formatBytes(content.length) +
      " · " +
      name.split(".").pop().toUpperCase();
  } catch (e) {
    document.getElementById("fileViewerContent").textContent =
      "Chyba při načítání: " + e.message;
  }
}

// Search functionality
function performSearch() {
  const searchTerm = document.getElementById("searchInput").value;
  const content = VIEWER_ORIGINAL_CONTENT;
  const contentEl = document.getElementById("fileViewerContent");

  if (!searchTerm) {
    contentEl.textContent = content;
    document.getElementById("searchCounter").textContent = "";
    VIEWER_SEARCH_MATCHES = [];
    VIEWER_CURRENT_MATCH = -1;
    return;
  }

  // Find all matches
  VIEWER_SEARCH_MATCHES = [];
  let index = 0;
  while ((index = content.indexOf(searchTerm, index)) !== -1) {
    VIEWER_SEARCH_MATCHES.push(index);
    index += searchTerm.length;
  }

  if (VIEWER_SEARCH_MATCHES.length === 0) {
    document.getElementById("searchCounter").textContent = "Nenalezeno";
    contentEl.textContent = content;
    VIEWER_CURRENT_MATCH = -1;
    return;
  }

  VIEWER_CURRENT_MATCH = 0;
  highlightMatches();
}

function highlightMatches() {
  const searchTerm = document.getElementById("searchInput").value;
  const content = VIEWER_ORIGINAL_CONTENT;
  const contentEl = document.getElementById("fileViewerContent");

  if (VIEWER_SEARCH_MATCHES.length === 0) return;

  // Build HTML with highlighted matches
  let html = "";
  let lastIndex = 0;

  VIEWER_SEARCH_MATCHES.forEach((matchIndex, i) => {
    // Add text before match
    html += escapeHtml(content.substring(lastIndex, matchIndex));

    // Add highlighted match
    const isCurrent = i === VIEWER_CURRENT_MATCH;
    const style = isCurrent
      ? "background: var(--accent); color: var(--bg); font-weight: 700;"
      : "background: var(--yellow); color: var(--bg);";
    html += `<mark style="${style}">${escapeHtml(content.substring(matchIndex, matchIndex + searchTerm.length))}</mark>`;

    lastIndex = matchIndex + searchTerm.length;
  });

  // Add remaining text
  html += escapeHtml(content.substring(lastIndex));

  contentEl.innerHTML = html;
  document.getElementById("searchCounter").textContent =
    `${VIEWER_CURRENT_MATCH + 1} z ${VIEWER_SEARCH_MATCHES.length}`;

  // Scroll to current match
  const marks = contentEl.querySelectorAll("mark");
  if (marks[VIEWER_CURRENT_MATCH]) {
    marks[VIEWER_CURRENT_MATCH].scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function findNext() {
  if (VIEWER_SEARCH_MATCHES.length === 0) return;
  VIEWER_CURRENT_MATCH =
    (VIEWER_CURRENT_MATCH + 1) % VIEWER_SEARCH_MATCHES.length;
  highlightMatches();
}

function findPrevious() {
  if (VIEWER_SEARCH_MATCHES.length === 0) return;
  VIEWER_CURRENT_MATCH =
    (VIEWER_CURRENT_MATCH - 1 + VIEWER_SEARCH_MATCHES.length) %
    VIEWER_SEARCH_MATCHES.length;
  highlightMatches();
}

function replaceCurrentMatch() {
  const searchTerm = document.getElementById("searchInput").value;
  const replaceTerm = document.getElementById("replaceInput").value;

  if (!searchTerm || VIEWER_SEARCH_MATCHES.length === 0) {
    toast("Nejprve vyhledej text", "error");
    return;
  }

  const matchIndex = VIEWER_SEARCH_MATCHES[VIEWER_CURRENT_MATCH];
  VIEWER_ORIGINAL_CONTENT =
    VIEWER_ORIGINAL_CONTENT.substring(0, matchIndex) +
    replaceTerm +
    VIEWER_ORIGINAL_CONTENT.substring(matchIndex + searchTerm.length);

  document.getElementById("fileViewerContent").textContent =
    VIEWER_ORIGINAL_CONTENT;
  toast("Nahrazeno 1 výskyt");

  // Re-search
  performSearch();
}

function replaceAllMatches() {
  const searchTerm = document.getElementById("searchInput").value;
  const replaceTerm = document.getElementById("replaceInput").value;

  if (!searchTerm || VIEWER_SEARCH_MATCHES.length === 0) {
    toast("Nejprve vyhledej text", "error");
    return;
  }

  const count = VIEWER_SEARCH_MATCHES.length;
  VIEWER_ORIGINAL_CONTENT =
    VIEWER_ORIGINAL_CONTENT.split(searchTerm).join(replaceTerm);
  document.getElementById("fileViewerContent").textContent =
    VIEWER_ORIGINAL_CONTENT;

  toast(`Nahrazeno ${count} výskyt${count > 1 ? "ů" : ""}`);

  // Clear search
  document.getElementById("searchInput").value = "";
  VIEWER_SEARCH_MATCHES = [];
  VIEWER_CURRENT_MATCH = -1;
  document.getElementById("searchCounter").textContent = "";
}

// Event listeners for search
document
  .getElementById("searchInput")
  .addEventListener("input", performSearch);
document
  .getElementById("searchInput")
  .addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    }
  });
document.getElementById("findNextBtn").onclick = findNext;
document.getElementById("findPrevBtn").onclick = findPrevious;
document.getElementById("toggleReplaceBtn").onclick = () => {
  const controls = document.getElementById("replaceControls");
  controls.style.display =
    controls.style.display === "none" ? "flex" : "none";
};
document.getElementById("replaceBtn").onclick = replaceCurrentMatch;
document.getElementById("replaceAllBtn").onclick = replaceAllMatches;

// Save file changes
document.getElementById("saveFileBtn").onclick = async () => {
  try {
    const content =
      document.getElementById("fileViewerContent").textContent;
    const base64Content = btoa(unescape(encodeURIComponent(content)));

    await ghFetch(
      `/repos/${USERNAME}/${VIEWER_FILE.repo}/contents/${VIEWER_FILE.path}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `Update: ${VIEWER_FILE.name}`,
          content: base64Content,
          sha: VIEWER_FILE_SHA,
        }),
      },
    );

    toast("Soubor uložen!");
    VIEWER_IS_MODIFIED = false;
    document.getElementById("saveFileBtn").style.display = "none";
    document.getElementById("fileViewerModal").style.display = "none";

    // Refresh current folder
    if (CURRENT_REPO) {
      openRepo(CURRENT_REPO, CURRENT_PATH);
    }
  } catch (e) {
    toast("Chyba při ukládání: " + e.message, "error");
  }
};

// Sledování změn v obsahu
document
  .getElementById("fileViewerContent")
  .addEventListener("input", () => {
    VIEWER_IS_MODIFIED = true;
    // Zobrazit tlačítko Uložit když jsou změny
    document.getElementById("saveFileBtn").style.display = "inline-block";
  });

document.getElementById("closeFileViewer").onclick = () => {
  if (
    VIEWER_IS_MODIFIED &&
    !confirm("Máš neuložené změny. Opravdu zavřít?")
  ) {
    return;
  }
  document.getElementById("fileViewerModal").style.display = "none";
};

document.getElementById("downloadFromViewer").onclick = async () => {
  try {
    const fileData = await ghFetch(
      `/repos/${USERNAME}/${VIEWER_FILE.repo}/contents/${VIEWER_FILE.path}`,
    );
    const bytes = Uint8Array.from(atob(fileData.content), (c) =>
      c.charCodeAt(0),
    );
    const blob = new Blob([bytes]);
    downloadBlob(blob, VIEWER_FILE.name);
    toast("Soubor stáhnut");
  } catch (e) {
    toast("Chyba při stáhnutí: " + e.message, "error");
  }
};

document
  .getElementById("fileViewerModal")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("fileViewerModal")) {
      document.getElementById("fileViewerModal").style.display = "none";
    }
  });

// ═══════════════════════════════════════
//  FILE CONTEXT MENU
// ═══════════════════════════════════════
let CTX_FILE = {}; // { name, path, type, size, repo }

function openFileContext(name, path, type, size, repo) {
  CTX_FILE = { name, path, type, size, repo };
  const isDir = type === "dir";
  const isHtml = /\.html?$/i.test(name);
  const ext = name.split(".").pop().toLowerCase();
  const isTextFile = [
    "txt",
    "md",
    "json",
    "js",
    "ts",
    "css",
    "html",
    "xml",
    "yml",
    "yaml",
    "py",
    "java",
    "rb",
    "php",
    "c",
    "cpp",
    "h",
    "cs",
    "go",
    "rs",
    "kt",
    "swift",
  ].includes(ext);

  document.getElementById("ctxFileName").textContent = name;
  document.getElementById("ctxFileMeta").textContent = isDir
    ? "Složka"
    : formatBytes(size) + " · " + name.split(".").pop().toUpperCase();
  document.getElementById("ctxFileIcon").textContent = isDir
    ? "📂"
    : getFileIcon(name);

  // hide rename row
  document.getElementById("renameRow").classList.remove("show");

  // build action buttons
  let btns = "";
  if (isHtml) {
    btns += `<button class="ctx-btn" id="ctxPreview">
    <span class="ctx-icon">🌐</span>
    <div><div class="ctx-label">Spustit v browseru</div><div class="ctx-desc">Otevře HTML stránku v novém tabu</div></div>
  </button>`;
  }
  if (!isDir && isTextFile) {
    btns += `<button class="ctx-btn" id="ctxView">
    <span class="ctx-icon">👁️</span>
    <div><div class="ctx-label">Zobrazit obsah</div><div class="ctx-desc">Otevře soubor v prohlížeči</div></div>
  </button>`;
  }
  if (!isDir) {
    btns += `<button class="ctx-btn" id="ctxDownload">
    <span class="ctx-icon">⬇️</span>
    <div><div class="ctx-label">Stáhnout soubor</div><div class="ctx-desc">Uloží soubor na tvůj počítač</div></div>
  </button>`;
  } else {
    btns += `<button class="ctx-btn" id="ctxDownload">
    <span class="ctx-icon">📦</span>
    <div><div class="ctx-label">Stáhnout složku jako ZIP</div><div class="ctx-desc">Stáhne celou složku se soubory</div></div>
  </button>`;
  }
  btns += `<button class="ctx-btn" id="ctxRename">
  <span class="ctx-icon">✏️</span>
  <div><div class="ctx-label">Přejmenovat</div><div class="ctx-desc">Změni název ${isDir ? "složky" : "souboru"}</div></div>
</button>`;
  btns += `<button class="ctx-btn danger" id="ctxDelete">
  <span class="ctx-icon">🗑️</span>
  <div><div class="ctx-label" style="color:var(--red);">Smazat</div><div class="ctx-desc">Navždy smazá ${isDir ? "složku a vše uvnitř" : "tento soubor"}</div></div>
</button>`;

  document.getElementById("ctxActions").innerHTML = btns;
  document.getElementById("ctxModal").style.display = "flex";

  // ── bind action handlers ──

  // Preview HTML - open in GitHub Pages
  const previewBtn = document.getElementById("ctxPreview");
  if (previewBtn) {
    previewBtn.onclick = () => {
      // Otevřít v GitHub Pages
      const githubPagesUrl = `https://${USERNAME}.github.io/${CTX_FILE.repo}/${CTX_FILE.path}`;
      window.open(githubPagesUrl, "_blank");
      document.getElementById("ctxModal").style.display = "none";
      toast(`Otevírám ${CTX_FILE.name} v GitHub Pages...`);
    };
  }

  // View file content
  const viewBtn = document.getElementById("ctxView");
  if (viewBtn) {
    viewBtn.onclick = () => {
      document.getElementById("ctxModal").style.display = "none";
      openFileViewer(CTX_FILE.name, CTX_FILE.path, CTX_FILE.repo);
    };
  }

  // Download
  const dlBtn = document.getElementById("ctxDownload");
  if (dlBtn) {
    dlBtn.onclick = async () => {
      if (CTX_FILE.type === "dir") {
        // Stáhnout složku jako ZIP
        document.getElementById("ctxModal").style.display = "none";
        toast(`Připravuji ZIP pro složku "${CTX_FILE.name}"...`);
        try {
          const files = await fetchAllFiles(CTX_FILE.repo, CTX_FILE.path);
          if (!files || files.length === 0) {
            toast("Složka je prázdná nebo nelze načíst.", "error");
            return;
          }
          const zipBlob = buildZip(files.map(f => ({
            path: f.path.replace(CTX_FILE.repo + '/', ''),
            content: f.content,
          })));
          downloadBlob(zipBlob, `${CTX_FILE.name}.zip`);
          toast(`Složka "${CTX_FILE.name}" stáhnuta jako ZIP`);
        } catch (e) {
          toast("Chyba při stáhnutí složky: " + e.message, "error");
        }
      } else {
        try {
          const fileData = await ghFetch(
            `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${CTX_FILE.path}`,
          );
          const bytes = Uint8Array.from(atob(fileData.content), (c) =>
            c.charCodeAt(0),
          );
          const blob = new Blob([bytes]);
          downloadBlob(blob, CTX_FILE.name);
          document.getElementById("ctxModal").style.display = "none";
          toast("Soubor „" + CTX_FILE.name + '" stáhnut.');
        } catch (e) {
          toast("Chyba při stáhnutí: " + e.message, "error");
        }
      }
    };
  }

  // Rename – show input
  document.getElementById("ctxRename").onclick = () => {
    document.getElementById("renameRow").classList.add("show");
    document.getElementById("renameInput").value = CTX_FILE.name;
    document.getElementById("renameInput").focus();
    // select just the name part (before extension)
    const dotIdx = CTX_FILE.name.lastIndexOf(".");
    if (dotIdx > 0)
      document.getElementById("renameInput").setSelectionRange(0, dotIdx);
  };

  document.getElementById("cancelRename").onclick = () => {
    document.getElementById("renameRow").classList.remove("show");
  };

  document.getElementById("confirmRename").onclick = async () => {
    const newName = document.getElementById("renameInput").value.trim();
    if (!newName || newName === CTX_FILE.name)
      return toast("Název nezměněn.", "error");
    // compute new path: replace last segment
    const parts = CTX_FILE.path.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    try {
      // GitHub rename = get content → delete old → create new at new path
      const fileData = await ghFetch(
        `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${CTX_FILE.path}`,
      );
      // delete old
      await ghFetch(
        `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${CTX_FILE.path}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            message: `rename: ${CTX_FILE.name} → ${newName}`,
            sha: fileData.sha,
          }),
        },
      );
      // create new (only for files; folders can't be created empty on GitHub)
      if (CTX_FILE.type !== "dir") {
        await ghFetch(
          `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${newPath}`,
          {
            method: "PUT",
            body: JSON.stringify({
              message: `rename: ${CTX_FILE.name} → ${newName}`,
              content: fileData.content.replace(/\n/g, ""),
            }),
          },
        );
      }
      document.getElementById("ctxModal").style.display = "none";
      toast("Přejmenováno na „" + newName + '"');
      // refresh current folder
      openRepo(
        CTX_FILE.repo,
        CTX_FILE.path.split("/").slice(0, -1).join("/"),
      );
    } catch (e) {
      toast("Chyba při přejmenování: " + e.message, "error");
    }
  };

  // Delete
  document.getElementById("ctxDelete").onclick = async () => {
    if (!confirm(`Smazat „${CTX_FILE.name}"? Toto nelze vrátit.`)) return;
    try {
      if (CTX_FILE.type === "dir") {
        // folders: need to delete all files inside recursively
        await deleteDir(CTX_FILE.repo, CTX_FILE.path);
      } else {
        const fileData = await ghFetch(
          `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${CTX_FILE.path}`,
        );
        await ghFetch(
          `/repos/${USERNAME}/${CTX_FILE.repo}/contents/${CTX_FILE.path}`,
          {
            method: "DELETE",
            body: JSON.stringify({
              message: `delete: ${CTX_FILE.name}`,
              sha: fileData.sha,
            }),
          },
        );
      }
      document.getElementById("ctxModal").style.display = "none";
      toast("„" + CTX_FILE.name + '" smazán.');
      openRepo(
        CTX_FILE.repo,
        CTX_FILE.path.split("/").slice(0, -1).join("/"),
      );
    } catch (e) {
      toast("Chyba při mazání: " + e.message, "error");
    }
  };
}

// ═══════════════════════════════════════
//  DELETE SELECTED ITEMS
// ═══════════════════════════════════════
async function deleteSelectedItems(repo, currentPath) {
  const selectedRows = Array.from(document.querySelectorAll(".row-checkbox:checked"));
  if (!selectedRows.length) return;

  const count = selectedRows.length;
  if (!confirm(`Smazat ${count} vybraných položek? Toto nelze vrátit.`)) return;

  let deleted = 0;
  let failed = 0;
  toast(`Mažu... 0/${count}`, "success", 60000);

  for (const checkbox of selectedRows) {
    const row = checkbox.closest(".file-row");
    if (!row) continue;
    const name = row.dataset.name;
    const path = row.dataset.path;
    const type = row.dataset.type;
    try {
      if (type === "dir") {
        await deleteDir(repo, path);
      } else {
        const fileData = await ghFetch(`/repos/${USERNAME}/${repo}/contents/${path}`);
        await ghFetch(`/repos/${USERNAME}/${repo}/contents/${path}`, {
          method: "DELETE",
          body: JSON.stringify({ message: `delete: ${name}`, sha: fileData.sha }),
        });
      }
      deleted++;
    } catch (err) {
      failed++;
      toast(`Chyba: ${name}: ${err.message}`, "error", 4000);
    }
    toast(`Mažu... ${deleted + failed}/${count}`, "success", 60000);
  }

  if (failed > 0) {
    toast(`Smazáno ${deleted}/${count}, ${failed} selhalo.`, "error");
  } else {
    toast(`✓ Smazáno ${deleted} položek.`);
  }
  openRepo(repo, currentPath);
}

// Smaže složku atomicky přes Git Data API (jeden commit, žádné SHA konflikty)
async function deleteDir(repo, dirPath) {
  // Krok 1: zjisti HEAD commit a branch
  const repoInfo = await ghFetch(`/repos/${USERNAME}/${repo}`);
  const branch = repoInfo.default_branch || "main";
  const refData = await ghFetch(`/repos/${USERNAME}/${repo}/git/ref/heads/${branch}`);
  const headCommitSha = refData.object.sha;

  // Krok 2: načti celý strom (recursive=1 vrátí všechny soubory)
  const headCommit = await ghFetch(`/repos/${USERNAME}/${repo}/git/commits/${headCommitSha}`);
  const baseTreeSha = headCommit.tree.sha;
  const treeData = await ghFetch(`/repos/${USERNAME}/${repo}/git/trees/${baseTreeSha}?recursive=1`);
  if (!treeData.tree) throw new Error("Nelze načíst strom repozitáře");

  // Krok 3: najdi soubory ke smazání (jen blob položky uvnitř složky)
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
  const toDelete = treeData.tree.filter(item =>
    item.type === "blob" && (item.path === dirPath || item.path.startsWith(prefix))
  );

  if (toDelete.length === 0) return; // nic ke smazání

  // Krok 4: vytvoř nový tree pomocí base_tree + sha:null pro smazané soubory
  // GitHub Git Trees API: sha:null = smaž tuto položku
  const deletionItems = toDelete.map(item => ({
    path: item.path,
    mode: item.mode || "100644",
    type: "blob",
    sha: null,  // null = smazat
  }));

  const newTree = await ghFetch(`/repos/${USERNAME}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,  // základ = aktuální strom, jen aplikujeme změny
      tree: deletionItems,
    }),
  });

  // Krok 5: vytvoř nový commit
  const newCommit = await ghFetch(`/repos/${USERNAME}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `delete: ${dirPath}`,
      tree: newTree.sha,
      parents: [headCommitSha],
    }),
  });

  // Krok 6: posuň HEAD na nový commit
  await ghFetch(`/repos/${USERNAME}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });
}

// close context modal on overlay click
document.getElementById("ctxModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("ctxModal")) {
    document.getElementById("ctxModal").style.display = "none";
  }
});

// ═══════════════════════════════════════
//  FILE UPLOAD
// ═══════════════════════════════════════

// Sestaví mapu path→sha pro celý adresářový strom jedním průchodem
// Slouží k tomu, abychom nepotřebovali GET pro každý soubor zvlášť
async function buildShaCache(repo, rootPath = "") {
  const cache = new Map(); // "path/to/file.js" → "sha..."
  async function scan(dirPath) {
    try {
      const endpoint = dirPath
        ? `/repos/${USERNAME}/${repo}/contents/${dirPath}`
        : `/repos/${USERNAME}/${repo}/contents`;
      const items = await ghFetch(endpoint);
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (item.type === "dir") {
          await scan(item.path);
        } else {
          cache.set(item.path, item.sha);
        }
      }
    } catch (e) {
      // složka neexistuje nebo chyba → prostě prázdný cache pro tuto větev
    }
  }
  await scan(rootPath);
  return cache;
}

// Nahraje jeden soubor — používá SHA z cache (žádný extra GET)
async function uploadFileWithCache(repo, uploadPath, base64Content, commitMsg, shaCache) {
  const sha = shaCache ? shaCache.get(uploadPath) : null;
  const body = { message: commitMsg, content: base64Content };
  if (sha) body.sha = sha;
  await ghFetch(`/repos/${USERNAME}/${repo}/contents/${uploadPath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  // Aktualizuj cache pro případné opakované uploady
  if (shaCache) shaCache.set(uploadPath, "pending");
}

// Fallback pro jednotlivé soubory (bez cache — zachováno pro zpětnou kompatibilitu)
async function uploadFileToGitHub(repo, uploadPath, base64Content, commitMsg) {
  let sha = null;
  try {
    const existing = await ghFetch(`/repos/${USERNAME}/${repo}/contents/${uploadPath}`);
    if (existing && existing.sha) sha = existing.sha;
  } catch (e) {
    // 404 = soubor neexistuje → sha null → create
  }
  const body = { message: commitMsg, content: base64Content };
  if (sha) body.sha = sha;
  await ghFetch(`/repos/${USERNAME}/${repo}/contents/${uploadPath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// Hlavní upload funkce — files je pole { file, path } kde path je relativní cesta
// ── Upload progress UI ──
let _uploadProgressEl = null;

function showUploadProgress(text, current, total) {
  // Pokud panel neexistuje, vytvoř ho
  if (!_uploadProgressEl) {
    _uploadProgressEl = document.createElement("div");
    _uploadProgressEl.id = "uploadProgressPanel";
    _uploadProgressEl.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--surface); border: 1px solid var(--accent);
      border-radius: 10px; padding: 14px 20px; min-width: 320px; max-width: 480px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4); z-index: 9999;
      font-family: var(--font-mono); font-size: 12px;
    `;
    _uploadProgressEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span id="uprogLabel" style="color:var(--text);"></span>
        <span id="uprogCount" style="color:var(--accent); font-weight:600;"></span>
      </div>
      <div style="background:var(--bg); border-radius:4px; height:6px; overflow:hidden;">
        <div id="uprogBar" style="height:100%; background:var(--accent); transition:width 0.15s; width:0%;"></div>
      </div>
      <div id="uprogSub" style="margin-top:6px; color:var(--text-dim); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
    `;
    document.body.appendChild(_uploadProgressEl);
  }
  _uploadProgressEl.style.display = "block";
  document.getElementById("uprogLabel").textContent = text;
  document.getElementById("uprogCount").textContent = total > 0 ? `${current} / ${total}` : "";
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById("uprogBar").style.width = pct + "%";
}

function updateUploadProgressFile(fileName) {
  const sub = document.getElementById("uprogSub");
  if (sub) sub.textContent = fileName;
}

function hideUploadProgress() {
  if (_uploadProgressEl) {
    _uploadProgressEl.style.display = "none";
    _uploadProgressEl = null; // reset pro příště
    const el = document.getElementById("uploadProgressPanel");
    if (el) el.remove();
  }
}

async function runUpload(repo, currentPath, files) {
  const total = files.length;
  if (total === 0) return;

  showUploadProgress("Načítám strukturu...", 0, total);

  // Zjisti kořenové složky pro SHA cache
  const uploadRoots = new Set();
  for (const { path: filePath } of files) {
    const parts = filePath.split("/");
    if (parts.length > 1) {
      const root = currentPath ? `${currentPath}/${parts[0]}` : parts[0];
      uploadRoots.add(root);
    } else {
      uploadRoots.add("__root__");
    }
  }

  // Sestav SHA cache
  const shaCache = new Map();
  for (const root of uploadRoots) {
    const scanPath = root === "__root__" ? currentPath : root;
    try {
      const sub = await buildShaCache(repo, scanPath);
      sub.forEach((sha, path) => shaCache.set(path, sha));
    } catch (e) {}
  }
  if (uploadRoots.has("__root__") && currentPath) {
    try {
      const sub = await buildShaCache(repo, currentPath);
      sub.forEach((sha, path) => shaCache.set(path, sha));
    } catch (e) {}
  }

  showUploadProgress("Nahrávám...", 0, total);

  let uploaded = 0;
  let failed = 0;
  const failedNames = [];

  for (const { file, path: filePath } of files) {
    updateUploadProgressFile(filePath);
    try {
      const content = await readFileAsBase64(file);
      const uploadPath = currentPath ? `${currentPath}/${filePath}` : filePath;
      await uploadFileWithCache(repo, uploadPath, content, `Upload: ${filePath}`, shaCache);
      uploaded++;
    } catch (err) {
      failed++;
      failedNames.push(filePath.split("/").pop());
    }
    showUploadProgress("Nahrávám...", uploaded + failed, total);
  }

  hideUploadProgress();

  if (failed > 0) {
    toast(`Nahráno ${uploaded}/${total}. Chyba u: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? ` +${failedNames.length - 3}` : ""}`, "error", 8000);
  } else {
    toast(`✓ Nahráno ${uploaded} soubor${uploaded > 1 ? "ů" : ""}!`);
  }
  openRepo(repo, currentPath);
}

// mode: "files" = normální soubory, "folder" = složka se zachovaným prefixem,
//        "contents" = obsah složky bez prefixu, "smartsync" = obsah složky, jen rozdíly
function openFileUploadDialog(repo, path, mode = "files") {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (mode === "folder" || mode === "contents" || mode === "smartsync") {
    input.webkitdirectory = true;
    input.directory = true;
  }
  input.onchange = async (e) => {
    const rawFiles = Array.from(e.target.files);
    if (!rawFiles.length) return;

    // Normalizuj relativní cestu
    const normalize = (f) => {
      const rel = f.webkitRelativePath;
      if (!rel) {
        // webkitRelativePath je prázdný — browser nepodporuje nebo soubor bez složky
        return f.name;
      }
      if (mode === "contents" || mode === "smartsync") {
        // Odřízni první segment (= název vybrané složky)
        // "nazev-slozky/podsložka/soubor.txt" → "podsložka/soubor.txt"
        // "nazev-slozky/soubor.txt" → "soubor.txt"
        const slash = rel.indexOf("/");
        return slash !== -1 ? rel.slice(slash + 1) : rel;
      }
      return rel;
    };

    // Debug: zobraz prvních 5 cest v konzoli
    const sample = rawFiles.slice(0, 5).map(f => ({
      name: f.name,
      webkitRelativePath: f.webkitRelativePath,
      normalized: normalize(f),
    }));
    console.log(`[Upload mode="${mode}"] ukázka cest:`, sample);

    let files = rawFiles.map(f => ({ file: f, path: normalize(f) }));

    if (mode === "smartsync") {
      // Porovnej SHA lokálních souborů s GitHubem — nahraje jen rozdíly
      showUploadProgress("Načítám strom GitHubu...", 0, 0);
      try {
        // Získej celý strom repo jedním requestem
        const repoInfo = await ghFetch(`/repos/${USERNAME}/${repo}`);
        const branch = repoInfo.default_branch || "main";
        const refData = await ghFetch(`/repos/${USERNAME}/${repo}/git/ref/heads/${branch}`);
        const treeData = await ghFetch(`/repos/${USERNAME}/${repo}/git/trees/${refData.object.sha}?recursive=1`);

        // Postav mapu path → blob sha
        const ghShaMap = new Map();
        const prefix = path ? path + "/" : "";
        for (const item of (treeData.tree || [])) {
          if (item.type !== "blob") continue;
          // Relativní cesta vůči aktuální složce
          if (path && !item.path.startsWith(prefix)) continue;
          const rel = path ? item.path.slice(prefix.length) : item.path;
          ghShaMap.set(rel, item.sha);
        }

        // Porovnej SHA lokálních souborů
        showUploadProgress("Porovnávám soubory...", 0, files.length);
        const toUpload = [];
        let same = 0;
        for (const f of files) {
          const ghSha = ghShaMap.get(f.path);
          if (!ghSha) {
            // Soubor na GitHubu chybí → nahrát
            toUpload.push(f);
          } else {
            // Porovnej SHA
            const localSha = await computeLocalBlobSha(f.file);
            if (localSha !== ghSha) {
              toUpload.push(f);
            } else {
              same++;
            }
          }
        }

        if (toUpload.length === 0) {
          hideUploadProgress();
          toast(`✓ Vše je aktuální — ${same} souborů shodných, nic k nahrání.`);
          return;
        }

        toast(`Smart sync: ${toUpload.length} změn, ${same} shodných — nahrávám...`);
        files = toUpload;
      } catch (err) {
        hideUploadProgress();
        toast("Chyba při porovnání: " + err.message, "error");
        return;
      }
    }

    await runUpload(repo, path, files);
  };
  input.click();
}

// Výpočet Git blob SHA pro lokální soubor (sha1 of "blob <size>\0<content>")
async function computeLocalBlobSha(file) {
  const buffer = await file.arrayBuffer();
  const header = new TextEncoder().encode(`blob ${buffer.byteLength}\0`);
  const combined = new Uint8Array(header.byteLength + buffer.byteLength);
  combined.set(header, 0);
  combined.set(new Uint8Array(buffer), header.byteLength);
  const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
//  DRAG & DROP FUNCTIONALITY
// ═══════════════════════════════════════

// Spolehlivé načtení všech souborů z FileSystemEntry (včetně složek)
function readAllEntries(dirReader) {
  return new Promise((resolve) => {
    let all = [];
    const read = () => {
      dirReader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all = all.concat(Array.from(entries));
          read(); // čti dokud nejsou prázdné (max 100 na volání)
        }
      }, () => resolve(all)); // chyba → vrať co máme
    };
    read();
  });
}

async function processDropEntry(entry, relativePath, fileList) {
  if (entry.isFile) {
    await new Promise((resolve) => {
      entry.file((file) => {
        fileList.push({ file, path: relativePath + file.name });
        resolve();
      }, resolve); // chyba → přeskoč
    });
  } else if (entry.isDirectory) {
    const entries = await readAllEntries(entry.createReader());
    for (const child of entries) {
      await processDropEntry(child, relativePath + entry.name + "/", fileList);
    }
  }
}

async function collectDroppedFiles(dataTransfer) {
  const fileList = [];
  const items = Array.from(dataTransfer.items || []);
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) {
      await processDropEntry(entry, "", fileList);
    } else {
      const file = item.getAsFile();
      if (file) fileList.push({ file, path: file.name });
    }
  }
  return fileList;
}

// Vrátí true pokud všechny soubory sdílí stejný kořenový prefix (= přetáhnuta jedna složka)
function getSingleDroppedFolderName(files) {
  if (!files.length) return null;
  const roots = new Set(files.map(f => f.path.split("/")[0]));
  // Jedna společná kořenová složka A alespoň jeden soubor je v podsložce
  if (roots.size === 1 && files.some(f => f.path.includes("/"))) {
    return [...roots][0];
  }
  return null;
}

async function uploadDroppedFiles(files, repo, currentPath) {
  await runUpload(repo, currentPath, files);
}

// Zobrazí rychlý výběr jak nahrát přetaženou složku
function showDropFolderChoice(folderName, files, repo, currentPath) {
  // Odstraň starý dialog pokud existuje
  const old = document.getElementById("dropChoiceDialog");
  if (old) old.remove();

  const dialog = document.createElement("div");
  dialog.id = "dropChoiceDialog";
  dialog.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--surface); border: 1px solid var(--accent);
    border-radius: 10px; padding: 16px 20px; min-width: 340px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5); z-index: 9999;
    font-family: var(--font-mono); font-size: 12px;
  `;
  dialog.innerHTML = `
    <div style="margin-bottom:12px; color:var(--text);">
      📁 Přetažena složka <strong style="color:var(--accent);">${folderName}</strong>
      <span style="color:var(--text-dim);"> (${files.length} souborů)</span>
    </div>
    <div style="display:flex; gap:8px;">
      <button id="dropChoiceFolder" style="flex:1; padding:8px; background:var(--surface2); border:1px solid var(--border); border-radius:6px; color:var(--text); cursor:pointer; font-size:11px; font-family:var(--font-mono);">
        📁 Se složkou<br><span style="color:var(--text-dim); font-size:10px;">${currentPath ? currentPath + "/" : ""}${folderName}/soubor.txt</span>
      </button>
      <button id="dropChoiceContents" style="flex:1; padding:8px; background:var(--surface2); border:1px solid var(--accent); border-radius:6px; color:var(--accent); cursor:pointer; font-size:11px; font-family:var(--font-mono);">
        📂 Jen obsah<br><span style="color:var(--text-dim); font-size:10px;">${currentPath ? currentPath + "/" : ""}soubor.txt</span>
      </button>
      <button id="dropChoiceCancel" style="padding:8px 12px; background:transparent; border:1px solid var(--border); border-radius:6px; color:var(--text-dim); cursor:pointer; font-size:11px;">✕</button>
    </div>
  `;
  document.body.appendChild(dialog);

  // Se složkou — nahraje jak je (folderName/soubor.txt)
  document.getElementById("dropChoiceFolder").onclick = async () => {
    dialog.remove();
    await uploadDroppedFiles(files, repo, currentPath);
  };

  // Jen obsah — odřízni první segment (folderName/)
  document.getElementById("dropChoiceContents").onclick = async () => {
    dialog.remove();
    const stripped = files.map(f => ({
      file: f.file,
      path: f.path.indexOf("/") !== -1 ? f.path.slice(f.path.indexOf("/") + 1) : f.path,
    }));
    await uploadDroppedFiles(stripped, repo, currentPath);
  };

  document.getElementById("dropChoiceCancel").onclick = () => dialog.remove();

  // Auto-zavři po 30s
  setTimeout(() => { if (dialog.parentNode) dialog.remove(); }, 30000);
}

function setupDragAndDrop() {
  const mainContent = document.getElementById("mainContent");

  // Zabraň výchozímu chování browseru pro drag eventy globálně
  document.addEventListener("dragover", (e) => e.preventDefault(), false);
  document.addEventListener("drop", (e) => e.preventDefault(), false);

  // Drag vizuál — jen na mainContent oblasti
  mainContent.addEventListener("dragenter", (e) => {
    if (!CURRENT_REPO) return;
    e.preventDefault();
    mainContent.classList.add("drag-over");
    const inlineZone = document.getElementById("inlineDropZone");
    if (inlineZone) inlineZone.classList.add("drag-active");
  });

  mainContent.addEventListener("dragover", (e) => {
    if (!CURRENT_REPO) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  mainContent.addEventListener("dragleave", (e) => {
    // Jen pokud opouštíme mainContent úplně (ne jen přecházíme na child element)
    if (!mainContent.contains(e.relatedTarget)) {
      mainContent.classList.remove("drag-over");
      const inlineZone = document.getElementById("inlineDropZone");
      if (inlineZone) inlineZone.classList.remove("drag-active");
    }
  });

  mainContent.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    mainContent.classList.remove("drag-over");
    const inlineZone = document.getElementById("inlineDropZone");
    if (inlineZone) inlineZone.classList.remove("drag-active");

    if (!CURRENT_REPO) {
      toast("Nejdřív otevři repozitář.", "error");
      return;
    }

    toast("Čtu soubory...", "success", 30000);
    const files = await collectDroppedFiles(e.dataTransfer);

    if (files.length === 0) {
      toast("Žádné soubory k nahrání.", "error");
      return;
    }

    // Detekuj jestli byla přetažena právě jedna složka
    const folderName = getSingleDroppedFolderName(files);
    if (folderName) {
      // Zeptej se uživatele co chce
      showDropFolderChoice(folderName, files, CURRENT_REPO, CURRENT_PATH);
    } else {
      await uploadDroppedFiles(files, CURRENT_REPO, CURRENT_PATH);
    }
  });
}

// Initialize drag & drop after login
setupDragAndDrop();

// ═══════════════════════════════════════
//  FILE FILTERING & SORTING
// ═══════════════════════════════════════
document
  .getElementById("fileFilterInput")
  .addEventListener("input", (e) => {
    CURRENT_FILTER = e.target.value.trim();
    if (CURRENT_REPO && ALL_FILES.length > 0) {
      // Re-render bez nového API callu
      const repoInfo = REPOS.find((r) => r.name === CURRENT_REPO);
      if (repoInfo) {
        renderFileList(repoInfo, CURRENT_REPO, CURRENT_PATH);
      }
    }
  });

document
  .getElementById("fileSortSelect")
  .addEventListener("change", (e) => {
    CURRENT_SORT = e.target.value;
    if (CURRENT_REPO && ALL_FILES.length > 0) {
      const repoInfo = REPOS.find((r) => r.name === CURRENT_REPO);
      if (repoInfo) {
        renderFileList(repoInfo, CURRENT_REPO, CURRENT_PATH);
      }
    }
  });

// ═══════════════════════════════════════
//  GITHUB SEARCH
// ═══════════════════════════════════════

// Detailní nápověda k programovacím jazykům
const LANGUAGE_HELP = {
  'HTML': {
    icon: '🌐',
    name: 'HTML (HyperText Markup Language)',
    desc: 'Základní jazyk pro tvorbu webových stránek. Definuje strukturu a obsah webu - nadpisy, odstavce, obrázky, odkazy, formuláře.',
    difficulty: '🟢 Začátečník',
    useFor: 'Webové stránky, e-maily, dokumentace',
    fileExt: '.html, .htm',
    run: [
      'Otevři soubor přímo v prohlížeči (Chrome, Firefox, Edge)',
      'V této aplikaci klikni na ▶️ Spustit',
      'Ve VS Code použij Live Server rozšíření pro automatické obnovování'
    ],
    tools: 'VS Code (zdarma), Notepad++, Sublime Text',
    install: 'Není potřeba žádná instalace - stačí textový editor a prohlížeč',
    example: '<!DOCTYPE html>\n<html>\n  <head><title>Moje stránka</title></head>\n  <body><h1>Ahoj světe!</h1></body>\n</html>',
    links: [
      { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/cs/docs/Web/HTML' },
      { title: 'W3Schools', url: 'https://www.w3schools.com/html/' }
    ]
  },
  'CSS': {
    icon: '🎨',
    name: 'CSS (Cascading Style Sheets)',
    desc: 'Jazyk pro definování vzhledu webových stránek. Určuje barvy, fonty, rozložení, animace a responzivní design.',
    difficulty: '🟢 Začátečník',
    useFor: 'Stylizace HTML stránek, animace, responzivní design',
    fileExt: '.css',
    run: [
      'CSS se připojuje k HTML souboru přes <link> tag',
      'Nebo se píše přímo do HTML v <style> tagu',
      'Změny vidíš po obnovování stránky v prohlížeči'
    ],
    tools: 'VS Code, Chrome DevTools (F12)',
    install: 'Není potřeba instalace',
    example: 'body {\n  background: #1a1a2e;\n  color: white;\n  font-family: Arial;\n}\n\nh1 {\n  color: #00e5a0;\n}',
    links: [
      { title: 'CSS-Tricks', url: 'https://css-tricks.com/' },
      { title: 'Flexbox Froggy (hra)', url: 'https://flexboxfroggy.com/' }
    ]
  },
  'JavaScript': {
    icon: '⚡',
    name: 'JavaScript',
    desc: 'Programovací jazyk webu. Umožňuje interaktivitu - tlačítka, formuláře, animace, hry. Funguje v prohlížeči i na serveru (Node.js).',
    difficulty: '🟡 Střední',
    useFor: 'Webové aplikace, hry, serverové aplikace, mobilní apps',
    fileExt: '.js, .mjs',
    run: [
      'V prohlížeči: připoj do HTML přes <script src="app.js">',
      'V terminálu: node soubor.js',
      'Konzole prohlížeče (F12) pro testování'
    ],
    tools: 'VS Code, Node.js, npm (správce balíčků)',
    install: 'Pro prohlížeč: nic\nPro server: stáhni Node.js z nodejs.org',
    example: '// Zobrazení zprávy\nalert("Ahoj světe!");\n\n// Změna textu na stránce\ndocument.getElementById("nadpis").textContent = "Nový text";',
    links: [
      { title: 'JavaScript.info', url: 'https://javascript.info/' },
      { title: 'freeCodeCamp', url: 'https://www.freecodecamp.org/' }
    ]
  },
  'TypeScript': {
    icon: '💎',
    name: 'TypeScript',
    desc: 'Nadstavba JavaScriptu s typy. Pomáhá předcházet chybám a zpehledňuje kód. Kompiluje se do JavaScriptu.',
    difficulty: '🟡 Střední',
    useFor: 'Velké webové aplikace, týmové projekty',
    fileExt: '.ts, .tsx',
    run: [
      '1. Nainstaluj: npm install -g typescript',
      '2. Kompiluj: npx tsc soubor.ts',
      '3. Spusť: node soubor.js'
    ],
    tools: 'VS Code (skvělá podpora), npm, Node.js',
    install: 'npm install -g typescript',
    example: 'function pozdrav(jmeno: string): string {\n  return `Ahoj ${jmeno}!`;\n}\n\nconsole.log(pozdrav("Světe"));',
    links: [
      { title: 'TypeScript Docs', url: 'https://www.typescriptlang.org/docs/' },
      { title: 'TypeScript Playground', url: 'https://www.typescriptlang.org/play' }
    ]
  },
  'Python': {
    icon: '🐍',
    name: 'Python',
    desc: 'Univerzální jazyk s jednoduchou syntaxí. Populární pro AI, machine learning, automatizaci, analýzu dat a webové aplikace.',
    difficulty: '🟢 Začátečník',
    useFor: 'AI/ML, data science, automatizace, web (Django, Flask)',
    fileExt: '.py',
    run: [
      'V terminálu: python soubor.py',
      'Nebo: python3 soubor.py (na macOS/Linux)',
      'Interaktivně: napiš "python" a pak píš kód'
    ],
    tools: 'VS Code + Python rozšíření, PyCharm, Jupyter Notebook',
    install: 'Stáhni z python.org a nainstaluj\nBalíčky: pip install nazev_balicku',
    example: '# Výpis textu\nprint("Ahoj světe!")\n\n# Cyklus\nfor i in range(5):\n    print(f"Číslo: {i}")\n\n# Funkce\ndef secti(a, b):\n    return a + b',
    links: [
      { title: 'Python.org', url: 'https://www.python.org/' },
      { title: 'Real Python', url: 'https://realpython.com/' }
    ]
  },
  'Java': {
    icon: '☕',
    name: 'Java',
    desc: 'Robustní objektově orientovaný jazyk. Používá se pro enterprise aplikace, Android vývoj, a velké systémy.',
    difficulty: '🟠 Pokročilý',
    useFor: 'Android aplikace, enterprise software, bac kend',
    fileExt: '.java',
    run: [
      '1. Kompiluj: javac Soubor.java',
      '2. Spusť: java Soubor',
      'Nebo použij IDE které to udělá automaticky'
    ],
    tools: 'IntelliJ IDEA (doporučeno), Eclipse, VS Code + Java Pack',
    install: 'Stáhni JDK (Java Development Kit) z adoptium.net nebo oracle.com',
    example: 'public class Hello {\n    public static void main(String[] args) {\n        System.out.println("Ahoj světe!");\n    }\n}',
    links: [
      { title: 'Java Docs', url: 'https://docs.oracle.com/en/java/' },
      { title: 'Codecademy Java', url: 'https://www.codecademy.com/learn/learn-java' }
    ]
  },
  'C#': {
    icon: '🔷',
    name: 'C# (C-Sharp)',
    desc: 'Moderní jazyk od Microsoftu. Používá se pro Windows aplikace, hry v Unity, webové API a cross-platform apps.',
    difficulty: '🟡 Střední',
    useFor: 'Unity hry, Windows aplikace, web API, .NET aplikace',
    fileExt: '.cs',
    run: [
      'S .NET CLI: dotnet new console && dotnet run',
      'Ve Visual Studiu: F5 pro spuštění',
      'Unity: kód se spouští v enginu'
    ],
    tools: 'Visual Studio (Windows), VS Code + C# rozšíření, Rider',
    install: 'Stáhni .NET SDK z dotnet.microsoft.com\nPro hry: Unity z unity.com',
    example: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Ahoj světe!");\n    }\n}',
    links: [
      { title: 'Microsoft C# Docs', url: 'https://learn.microsoft.com/cs-cz/dotnet/csharp/' },
      { title: 'Unity Learn', url: 'https://learn.unity.com/' }
    ]
  },
  'C++': {
    icon: '⚙️',
    name: 'C++',
    desc: 'Výkonný systémový jazyk. Používá se pro hry (Unreal Engine), operační systémy, embedded systémy a výkonově kritické aplikace.',
    difficulty: '🔴 Expert',
    useFor: 'Hry (AAA tituly), OS, drivery, embedded, HPC',
    fileExt: '.cpp, .h, .hpp',
    run: [
      'S g++: g++ soubor.cpp -o program && ./program',
      'Na Windows: cl soubor.cpp (MSVC)',
      'Ve Visual Studiu: F5'
    ],
    tools: 'Visual Studio, CLion, VS Code + C++ rozšíření',
    install: 'Windows: Visual Studio s C++ workload\nLinux: sudo apt install build-essential\nmacOS: xcode-select --install',
    example: '#include <iostream>\n\nint main() {\n    std::cout << "Ahoj světe!" << std::endl;\n    return 0;\n}',
    links: [
      { title: 'cppreference', url: 'https://cppreference.com/' },
      { title: 'Learn C++', url: 'https://www.learncpp.com/' }
    ]
  },
  'Go': {
    icon: '🐹',
    name: 'Go (Golang)',
    desc: 'Moderní jazyk od Google. Jednoduchý, rychlý, skvělý pro serverové aplikace, mikroservicy a CLI nástroje.',
    difficulty: '🟡 Střední',
    useFor: 'Backend, mikroservicy, CLI nástroje, cloud',
    fileExt: '.go',
    run: [
      'Spuštění: go run soubor.go',
      'Kompilace: go build soubor.go',
      'Instalace balíčku: go get nazev'
    ],
    tools: 'VS Code + Go rozšíření, GoLand',
    install: 'Stáhni z go.dev/dl a nainstaluj',
    example: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Ahoj světe!")\n}',
    links: [
      { title: 'Go by Example', url: 'https://gobyexample.com/' },
      { title: 'Tour of Go', url: 'https://go.dev/tour/' }
    ]
  },
  'Rust': {
    icon: '🦀',
    name: 'Rust',
    desc: 'Bezpečný systémový jazyk bez garbage collectoru. Garantuje paměťovou bezpečnost. Oblíbený pro systémové programování a WebAssembly.',
    difficulty: '🔴 Expert',
    useFor: 'Systémové programování, WebAssembly, CLI, bezpečný kód',
    fileExt: '.rs',
    run: [
      'Nový projekt: cargo new projekt',
      'Spuštění: cargo run',
      'Kompilace: cargo build --release'
    ],
    tools: 'VS Code + rust-analyzer, RustRover',
    install: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh\nNebo na Windows: rustup-init.exe z rustup.rs',
    example: 'fn main() {\n    println!("Ahoj světe!");\n    \n    let cislo = 42;\n    println!("Odpověď je: {}", cislo);\n}',
    links: [
      { title: 'Rust Book', url: 'https://doc.rust-lang.org/book/' },
      { title: 'Rust by Example', url: 'https://doc.rust-lang.org/rust-by-example/' }
    ]
  },
  'PHP': {
    icon: '🐘',
    name: 'PHP',
    desc: 'Serverový skriptovací jazyk. Pohání WordPress, Laravel, a velkou část internetu. Snadný pro začátečníky.',
    difficulty: '🟢 Začátečník',
    useFor: 'Webové stránky, WordPress, e-shopy, CMS',
    fileExt: '.php',
    run: [
      'Lokálně: php soubor.php',
      'Webový server: XAMPP, WAMP, MAMP, Laragon',
      'Vestavěný server: php -S localhost:8000'
    ],
    tools: 'VS Code + PHP Intelephense, PhpStorm, XAMPP',
    install: 'Stáhni XAMPP z apachefriends.org (obsahuje PHP + MySQL + Apache)',
    example: '<?php\necho "Ahoj světe!";\n\n$jmeno = "Petr";\necho "Ahoj $jmeno!";\n?>',
    links: [
      { title: 'PHP.net', url: 'https://www.php.net/manual/en/' },
      { title: 'Laravel', url: 'https://laravel.com/docs' }
    ]
  },
  'Ruby': {
    icon: '💎',
    name: 'Ruby',
    desc: 'Elegantní dynamický jazyk. Známý díky Ruby on Rails frameworku pro rychlý vývoj webových aplikací.',
    difficulty: '🟡 Střední',
    useFor: 'Webové aplikace (Rails), automatizace, skripty',
    fileExt: '.rb',
    run: [
      'Spuštění: ruby soubor.rb',
      'Interaktivně: irb',
      'Rails: rails server'
    ],
    tools: 'VS Code + Ruby rozšíření, RubyMine',
    install: 'Windows: RubyInstaller.org\nmacOS/Linux: rbenv nebo rvm',
    example: 'puts "Ahoj světe!"\n\n5.times do |i|\n  puts "Číslo #{i}"\nend',
    links: [
      { title: 'Ruby Docs', url: 'https://www.ruby-lang.org/en/documentation/' },
      { title: 'Rails Guides', url: 'https://guides.rubyonrails.org/' }
    ]
  },
  'JSON': {
    icon: '📋',
    name: 'JSON (JavaScript Object Notation)',
    desc: 'Textový formát pro výměnu dat. Používá se pro konfigurace, API odpovědi, ukládání dat.',
    difficulty: '🟢 Začátečník',
    useFor: 'Konfigurace (package.json), API, datová výměna',
    fileExt: '.json',
    run: [
      'JSON není spustitelný - jsou to jen data',
      'Čte se jinými programy (JavaScript, Python, ...)',
      'Validace: jsonlint.com'
    ],
    tools: 'VS Code (formátování: Shift+Alt+F)',
    install: 'Není potřeba',
    example: '{\n  "jmeno": "Jan",\n  "vek": 25,\n  "programator": true,\n  "jazyky": ["JavaScript", "Python"]\n}',
    links: [
      { title: 'JSON.org', url: 'https://www.json.org/' },
      { title: 'JSON Lint', url: 'https://jsonlint.com/' }
    ]
  },
  'Markdown': {
    icon: '📝',
    name: 'Markdown',
    desc: 'Jednoduchý značkovací jazyk pro formátování textu. Používá se pro dokumentaci, README, poznámky.',
    difficulty: '🟢 Začátečník',
    useFor: 'README soubory, dokumentace, poznámky, blogy',
    fileExt: '.md, .markdown',
    run: [
      'GitHub automaticky zobrazí README.md',
      'VS Code: Ctrl+Shift+V pro náhled',
      'Export do HTML/PDF přes různé nástroje'
    ],
    tools: 'VS Code + Markdown Preview, Obsidian, Typora',
    install: 'Není potřeba',
    example: '# Nadpis\n\n## Podnadpis\n\n**Tučný text** a *kurzíva*\n\n- Položka 1\n- Položka 2\n\n```javascript\nconsole.log("Kód");\n```',
    links: [
      { title: 'Markdown Guide', url: 'https://www.markdownguide.org/' },
      { title: 'GitHub Markdown', url: 'https://docs.github.com/en/get-started/writing-on-github' }
    ]
  }
};

// Funkce pro otevření/zavření nápovědy
function openLanguageHelpModal() {
  document.getElementById('languageHelpModal').style.display = 'flex';
  renderLanguageHelpList();
}

function closeLanguageHelpModal() {
  document.getElementById('languageHelpModal').style.display = 'none';
}

function renderLanguageHelpList() {
  const container = document.getElementById('languageHelpContent');
  const languages = Object.keys(LANGUAGE_HELP);

  container.innerHTML = languages.map(lang => {
    const h = LANGUAGE_HELP[lang];
    return `
      <div class="lang-card" onclick="showLanguageDetail('${lang}')">
        <div class="lang-card-icon">${h.icon}</div>
        <div class="lang-card-info">
          <div class="lang-card-name">${lang}</div>
          <div class="lang-card-difficulty">${h.difficulty}</div>
        </div>
        <div class="lang-card-arrow">›</div>
      </div>
    `;
  }).join('');
}

function showLanguageDetail(lang) {
  const h = LANGUAGE_HELP[lang];
  const container = document.getElementById('languageHelpContent');

  container.innerHTML = `
    <button class="lang-back-btn" onclick="renderLanguageHelpList()">← Zpět na seznam</button>

    <div class="lang-detail">
      <div class="lang-detail-header">
        <span class="lang-detail-icon">${h.icon}</span>
        <div>
          <h3>${h.name}</h3>
          <span class="lang-detail-difficulty">${h.difficulty}</span>
        </div>
      </div>

      <p class="lang-detail-desc">${h.desc}</p>

      <div class="lang-detail-section">
        <h4>🎯 K čemu se používá</h4>
        <p>${h.useFor}</p>
      </div>

      <div class="lang-detail-section">
        <h4>📁 Přípony souborů</h4>
        <code>${h.fileExt}</code>
      </div>

      <div class="lang-detail-section">
        <h4>▶️ Jak spustit</h4>
        <ul>
          ${h.run.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>

      <div class="lang-detail-section">
        <h4>🛠️ Doporučené nástroje</h4>
        <p>${h.tools}</p>
      </div>

      <div class="lang-detail-section">
        <h4>📦 Instalace</h4>
        <pre>${h.install}</pre>
      </div>

      <div class="lang-detail-section">
        <h4>📝 Příklad kódu</h4>
        <pre class="code-example">${escapeHtml(h.example)}</pre>
      </div>

      <div class="lang-detail-section">
        <h4>🔗 Užitečné odkazy</h4>
        <div class="lang-links">
          ${h.links.map(l => `<a href="${l.url}" target="_blank">${l.title} ↗</a>`).join('')}
        </div>
      </div>
    </div>
  `;
}

const SEARCH_STATE = {
  type: 'code',  // Přednastaveno na kód
  query: '',
  filters: { language: 'HTML', extension: 'html' },  // Přednastaveno HTML
  page: 1,
  totalCount: 0,
  perPage: 15,
  filtersOpen: false
};

const SEARCH_FILTERS_CONFIG = {
  repositories: [
    { id: 'sort', label: 'Řadit', type: 'select', options: [
      { value: '', label: '⭐ Nejlepší shoda' },
      { value: 'stars', label: '🌟 Hvězdy' },
      { value: 'forks', label: '🍴 Forky' },
      { value: 'updated', label: '🕐 Aktualizace' }
    ]},
    { id: 'language', label: 'Jazyk', type: 'select', options: ['', 'HTML', 'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust', 'PHP', 'Ruby', 'CSS'] },
    { id: 'stars', label: 'Hvězdy min', type: 'number', placeholder: '100' },
    { id: 'user', label: 'Uživatel', type: 'text', placeholder: 'user' },
    { id: 'topic', label: 'Téma', type: 'text', placeholder: 'topic' }
  ],
  code: [
    { id: 'sort', label: 'Řadit', type: 'select', options: [
      { value: '', label: '⭐ Nejlepší shoda' },
      { value: 'indexed', label: '🕐 Nejnovější index' }
    ]},
    { id: 'language', label: 'Jazyk', type: 'select', options: ['HTML', 'JavaScript', 'TypeScript', 'CSS', 'Python', 'Java', 'JSON', 'Markdown'] },
    { id: 'extension', label: 'Přípona', type: 'text', placeholder: 'html' },
    { id: 'user', label: 'Uživatel', type: 'text', placeholder: 'user' },
    { id: 'repo', label: 'Repo', type: 'text', placeholder: 'user/repo' }
  ],
  issues: [
    { id: 'sort', label: 'Řadit', type: 'select', options: [
      { value: '', label: '⭐ Nejlepší shoda' },
      { value: 'comments', label: '💬 Komentáře' },
      { value: 'reactions', label: '👍 Reakce' },
      { value: 'created', label: '📅 Vytvořeno' },
      { value: 'updated', label: '🕐 Aktualizace' }
    ]},
    { id: 'state', label: 'Stav', type: 'select', options: ['', 'open', 'closed'] },
    { id: 'is', label: 'Typ', type: 'select', options: ['', 'issue', 'pr'] },
    { id: 'label', label: 'Label', type: 'text', placeholder: 'bug' }
  ],
  users: [
    { id: 'sort', label: 'Řadit', type: 'select', options: [
      { value: '', label: '⭐ Nejlepší shoda' },
      { value: 'followers', label: '👥 Followers' },
      { value: 'repositories', label: '📁 Repozitáře' },
      { value: 'joined', label: '📅 Registrace' }
    ]},
    { id: 'type', label: 'Typ', type: 'select', options: ['', 'user', 'org'] },
    { id: 'repos', label: 'Repo min', type: 'number', placeholder: '5' },
    { id: 'followers', label: 'Followers', type: 'number', placeholder: '100' },
    { id: 'language', label: 'Jazyk', type: 'text', placeholder: 'HTML' }
  ]
};

function toggleSearchFilters() {
  SEARCH_STATE.filtersOpen = !SEARCH_STATE.filtersOpen;
  const filters = document.getElementById('searchFilters');
  const toggle = document.getElementById('filtersToggle');
  if (SEARCH_STATE.filtersOpen) {
    filters.classList.add('open');
    toggle.classList.add('open');
  } else {
    filters.classList.remove('open');
    toggle.classList.remove('open');
  }
}

function renderSearchFilters() {
  const container = document.getElementById('searchFilters');
  const filters = SEARCH_FILTERS_CONFIG[SEARCH_STATE.type] || [];

  let html = filters.map(f => {
    let input = '';
    const isLanguageFilter = f.id === 'language' && f.type === 'select';

    if (f.type === 'select') {
      if (isLanguageFilter) {
        // Jazyk s ikonami
        input = `<select id="filter_${f.id}" onchange="updateSearchFilter('${f.id}', this.value)">
          ${f.options.map(o => {
            const help = LANGUAGE_HELP[o];
            const icon = help ? help.icon + ' ' : '';
            return `<option value="${o}" ${SEARCH_STATE.filters[f.id] === o ? 'selected' : ''}>${icon}${o || '-- vše --'}</option>`;
          }).join('')}
        </select>`;
      } else if (typeof f.options[0] === 'object') {
        // Objektové options (pro řazení apod.)
        input = `<select id="filter_${f.id}" onchange="updateSearchFilter('${f.id}', this.value)">
          ${f.options.map(o => `<option value="${o.value}" ${SEARCH_STATE.filters[f.id] === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>`;
      } else {
        input = `<select id="filter_${f.id}" onchange="updateSearchFilter('${f.id}', this.value)">
          ${f.options.map(o => `<option value="${o}" ${SEARCH_STATE.filters[f.id] === o ? 'selected' : ''}>${o || '-- vše --'}</option>`).join('')}
        </select>`;
      }
    } else if (f.type === 'number') {
      input = `<input type="number" id="filter_${f.id}" placeholder="${f.placeholder || ''}" value="${SEARCH_STATE.filters[f.id] || ''}" onchange="updateSearchFilter('${f.id}', this.value)" />`;
    } else {
      input = `<input type="text" id="filter_${f.id}" placeholder="${f.placeholder || ''}" value="${SEARCH_STATE.filters[f.id] || ''}" onchange="updateSearchFilter('${f.id}', this.value)" />`;
    }
    return `<div class="search-filter-group"><label>${f.label}</label>${input}</div>`;
  }).join('');

  // Přidat tlačítko nápovědy k jazykům (jen pro typy s jazykem)
  const hasLanguage = filters.some(f => f.id === 'language');
  if (hasLanguage) {
    html += `<button class="btn-secondary lang-help-btn" onclick="openLanguageHelpModal()">❓ Nápověda k jazykům</button>`;
  }

  container.innerHTML = html;
}

function updateSearchFilter(id, value) {
  if (value) {
    SEARCH_STATE.filters[id] = value;
  } else {
    delete SEARCH_STATE.filters[id];
  }

  // Automaticky nastavit příponu podle jazyka
  if (id === 'language' && SEARCH_STATE.type === 'code') {
    const help = LANGUAGE_HELP[value];
    if (help && help.fileExt) {
      // Vezmi první příponu (bez tečky)
      const ext = help.fileExt.split(',')[0].trim().replace('.', '');
      SEARCH_STATE.filters.extension = ext;
      const extInput = document.getElementById('filter_extension');
      if (extInput) extInput.value = ext;
    }
  }
}

function buildSearchQuery() {
  let q = SEARCH_STATE.query.trim();
  const filters = SEARCH_STATE.filters;
  const type = SEARCH_STATE.type;

  // Build query based on type
  if (type === 'repositories') {
    if (filters.language) q += ` language:${filters.language}`;
    if (filters.stars) q += ` stars:>=${filters.stars}`;
    if (filters.forks) q += ` forks:>=${filters.forks}`;
    if (filters.user) q += ` user:${filters.user}`;
    if (filters.topic) q += ` topic:${filters.topic}`;
    if (filters.license) q += ` license:${filters.license}`;
    if (filters.archived) q += ` archived:${filters.archived}`;
    if (filters.pushed) q += ` pushed:${filters.pushed}`;
  } else if (type === 'code') {
    if (filters.language) q += ` language:${filters.language}`;
    if (filters.repo) q += ` repo:${filters.repo}`;
    if (filters.path) q += ` path:${filters.path}`;
    if (filters.filename) q += ` filename:${filters.filename}`;
    if (filters.extension) q += ` extension:${filters.extension}`;
    if (filters.size) q += ` size:${filters.size}`;
    if (filters.user) q += ` user:${filters.user}`;
  } else if (type === 'issues') {
    if (filters.state) q += ` state:${filters.state}`;
    if (filters.is) q += ` is:${filters.is}`;
    if (filters.repo) q += ` repo:${filters.repo}`;
    if (filters.author) q += ` author:${filters.author}`;
    if (filters.assignee) q += ` assignee:${filters.assignee}`;
    if (filters.label) q += ` label:${filters.label}`;
    if (filters.comments) q += ` comments:>=${filters.comments}`;
    if (filters.created) q += ` created:${filters.created}`;
  } else if (type === 'users') {
    if (filters.type) q += ` type:${filters.type}`;
    if (filters.repos) q += ` repos:>=${filters.repos}`;
    if (filters.followers) q += ` followers:>=${filters.followers}`;
    if (filters.location) q += ` location:${filters.location}`;
    if (filters.language) q += ` language:${filters.language}`;
  }

  return q.trim();
}

function updateQueryPreview() {
  // Query preview removed from UI - function kept for compatibility
}

async function executeSearch() {
  const query = buildSearchQuery();
  if (!query) {
    toast('Zadej hledaný výraz', 'error');
    return;
  }

  const resultsEl = document.getElementById('searchResults');
  const statsEl = document.getElementById('searchStats');
  resultsEl.innerHTML = '<div class="search-empty"><div class="spinner"></div><p>Hledám...</p></div>';
  statsEl.textContent = '';

  try {
    let endpoint = `/search/${SEARCH_STATE.type}?q=${encodeURIComponent(query)}&per_page=${SEARCH_STATE.perPage}&page=${SEARCH_STATE.page}`;
    // Přidej řazení pokud je nastaveno
    if (SEARCH_STATE.filters.sort) {
      endpoint += `&sort=${SEARCH_STATE.filters.sort}&order=desc`;
    }
    // Pro code search přidáme Accept header pro text_matches (úryvky kódu)
    const options = SEARCH_STATE.type === 'code' ? { headers: { Accept: 'application/vnd.github.text-match+json' } } : {};
    const data = await ghFetch(endpoint, options);

    SEARCH_STATE.totalCount = data.total_count;
    const totalPages = Math.ceil(data.total_count / SEARCH_STATE.perPage);

    statsEl.textContent = `Nalezeno ${data.total_count.toLocaleString()} výsledků`;
    saveToSearchHistory(query, SEARCH_STATE.type);

    if (data.items.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty"><div class="icon">🔍</div><p>Žádné výsledky</p></div>';
      document.getElementById('searchPagination').style.display = 'none';
      return;
    }

    resultsEl.innerHTML = data.items.map(item => renderSearchResult(item)).join('');

    // Pagination
    const paginationEl = document.getElementById('searchPagination');
    paginationEl.style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('searchPageInfo').textContent = `${SEARCH_STATE.page} / ${totalPages}`;
    document.getElementById('searchPrevPage').disabled = SEARCH_STATE.page <= 1;
    document.getElementById('searchNextPage').disabled = SEARCH_STATE.page >= totalPages;

  } catch (e) {
    resultsEl.innerHTML = `<div class="search-empty"><div class="icon">⚠️</div><p>Chyba: ${e.message}</p></div>`;
  }
}

function renderSearchResult(item) {
  const type = SEARCH_STATE.type;
  const isHtml = SEARCH_STATE.filters.language === 'HTML' || /\.html?$/i.test(item.name || '');

  if (type === 'repositories') {
    const owner = item.owner?.login || item.full_name?.split('/')[0] || '';
    return `
      <div class="search-result-item" data-repo="${item.full_name}" data-owner="${owner}">
        <div class="search-result-icon">📁</div>
        <div class="search-result-content">
          <div class="search-result-title">${item.full_name}</div>
          <div class="search-result-desc">${item.description || 'Bez popisu'}</div>
          <div class="search-result-meta">
            <span>⭐ ${item.stargazers_count?.toLocaleString() || 0}</span>
            <span>💻 ${item.language || 'N/A'}</span>
          </div>
          <div class="search-result-actions">
            <button onclick="event.stopPropagation(); browseUserRepo('${owner}', '${item.name}')" class="primary">📂 Procházet</button>
            <button onclick="event.stopPropagation(); window.open('${item.html_url}', '_blank')">🔗 GitHub</button>
            <button class="star-btn" data-starred="false" onclick="event.stopPropagation(); toggleStarRepo('${owner}', '${item.name}', this)">☆ Star</button>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'code') {
    const repoFullName = item.repository?.full_name || '';
    const owner = repoFullName.split('/')[0];
    const repoName = repoFullName.split('/')[1];
    const filePath = item.path || '';
    const defaultBranch = item.repository?.default_branch || 'main';
    const isHtmlFile = /\.html?$/i.test(item.name || '');

    return `
      <div class="search-result-item">
        <div class="search-result-icon">${getFileIcon(item.name)}</div>
        <div class="search-result-content">
          <div class="search-result-title">${item.name}</div>
          <div class="search-result-desc">${repoFullName}/${filePath}</div>
          ${(() => {
            if (!item.text_matches || !item.text_matches.length) return '';
            const fragsHtml = item.text_matches.map(m => `<div class="search-code-snippet" style="margin-top:4px;">${escapeHtml(m.fragment || '').substring(0, 300)}</div>`).join('');
            const firstFrag = item.text_matches[0];
            const extraCount = item.text_matches.length - 1;
            const fragId = 'frags_' + (item.sha || Math.random().toString(36).slice(2));
            return `
              <div class="search-code-snippet">${escapeHtml(firstFrag.fragment || '').substring(0, 300)}</div>
              ${extraCount > 0 ? `
                <div id="${fragId}" style="display:none;">
                  ${item.text_matches.slice(1).map(m => `<div class="search-code-snippet" style="margin-top:4px;">${escapeHtml(m.fragment || '').substring(0, 300)}</div>`).join('')}
                </div>
                <button class="search-code-more-btn" onclick="event.stopPropagation(); toggleCodeFragments('${fragId}', this)">▼ ${extraCount} dalších shod</button>
              ` : ''}
            `;
          })()}
          <div class="search-result-actions">
            ${isHtmlFile ? `<button onclick="event.stopPropagation(); previewHtmlFile('${owner}', '${repoName}', '${filePath}', '${defaultBranch}')" class="primary">▶️ Spustit</button>` : ''}
            <button onclick="event.stopPropagation(); browseUserRepo('${owner}', '${repoName}', '${filePath}')">📂 Procházet</button>
            <button onclick="event.stopPropagation(); window.open('${item.html_url}', '_blank')">🔗 GitHub</button>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'issues') {
    const isPR = item.pull_request !== undefined;
    return `
      <div class="search-result-item" onclick="window.open('${item.html_url}', '_blank')">
        <div class="search-result-icon">${isPR ? '🔀' : (item.state === 'open' ? '🟢' : '🔴')}</div>
        <div class="search-result-content">
          <div class="search-result-title">${item.title}</div>
          <div class="search-result-desc">${item.repository_url?.split('/').slice(-2).join('/') || ''} #${item.number}</div>
          <div class="search-result-meta">
            <span>${isPR ? 'PR' : 'Issue'}</span>
            <span>👤 ${item.user?.login || ''}</span>
            <span>💬 ${item.comments || 0}</span>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'users') {
    return `
      <div class="search-result-item" data-user="${item.login}">
        <div class="search-result-icon"><img src="${item.avatar_url}" style="width:28px; height:28px; border-radius:50%;" /></div>
        <div class="search-result-content">
          <div class="search-result-title">${item.login}</div>
          <div class="search-result-desc">${item.type === 'Organization' ? '🏢 Organizace' : '👤 Uživatel'}</div>
          <div class="search-result-actions">
            <button onclick="event.stopPropagation(); showUserRepos('${item.login}')" class="primary">📁 Repozitáře</button>
            <button onclick="event.stopPropagation(); window.open('${item.html_url}', '_blank')">🔗 GitHub</button>
          </div>
        </div>
      </div>
    `;
  }
  return '';
}

// Zobrazit repozitáře uživatele přímo v search results
async function showUserRepos(username) {
  const resultsEl = document.getElementById('searchResults');
  const statsEl = document.getElementById('searchStats');
  resultsEl.innerHTML = '<div class="search-empty"><div class="spinner"></div><p>Načítám repozitáře...</p></div>';

  try {
    const repos = await ghFetch(`/users/${username}/repos?per_page=30&sort=updated`);
    statsEl.textContent = `📁 Repozitáře uživatele ${username} (${repos.length})`;

    if (repos.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty"><div class="icon">📭</div><p>Žádné repozitáře</p></div>';
      return;
    }

    resultsEl.innerHTML = `
      <button class="btn-secondary" onclick="executeSearch()" style="margin-bottom: 10px; font-size: 11px;">← Zpět na výsledky</button>
      ${repos.map(repo => `
        <div class="search-result-item">
          <div class="search-result-icon">📁</div>
          <div class="search-result-content">
            <div class="search-result-title">${repo.name}</div>
            <div class="search-result-desc">${repo.description || 'Bez popisu'}</div>
            <div class="search-result-meta">
              <span>⭐ ${repo.stargazers_count}</span>
              <span>💻 ${repo.language || 'N/A'}</span>
              <span>${repo.private ? '🔒' : '🌐'}</span>
            </div>
            <div class="search-result-actions">
              <button onclick="event.stopPropagation(); browseUserRepo('${username}', '${repo.name}')" class="primary">📂 Procházet</button>
              <button onclick="event.stopPropagation(); window.open('${repo.html_url}', '_blank')">🔗 GitHub</button>
            </div>
          </div>
        </div>
      `).join('')}
    `;
    document.getElementById('searchPagination').style.display = 'none';
  } catch (e) {
    resultsEl.innerHTML = `<div class="search-empty"><div class="icon">⚠️</div><p>Chyba: ${e.message}</p></div>`;
  }
}

// Procházet repo cizího uživatele
let BROWSE_USER = '';
let BROWSE_REPO = '';
let BROWSE_PATH = '';

// State pro kopírování
let COPY_QUEUE = []; // { srcOwner, srcRepo, srcPath, fileName, isDir }

async function browseUserRepo(owner, repoName, path = '') {
  BROWSE_USER = owner;
  BROWSE_REPO = repoName;
  BROWSE_PATH = path;

  const resultsEl = document.getElementById('searchResults');
  const statsEl = document.getElementById('searchStats');
  resultsEl.innerHTML = '<div class="search-empty"><div class="spinner"></div><p>Načítám...</p></div>';

  try {
    const repoInfo = await ghFetch(`/repos/${owner}/${repoName}`);
    const defaultBranch = repoInfo.default_branch || 'main';

    const endpoint = path
      ? `/repos/${owner}/${repoName}/contents/${path}`
      : `/repos/${owner}/${repoName}/contents`;
    const contents = await ghFetch(endpoint);

    if (!Array.isArray(contents)) {
      if (/\.html?$/i.test(contents.name)) {
        previewHtmlFile(owner, repoName, contents.path, defaultBranch);
      } else {
        window.open(contents.html_url, '_blank');
      }
      return;
    }

    const pathParts = path ? path.split('/') : [];
    const parentPath = pathParts.slice(0, -1).join('/');

    statsEl.textContent = `📂 ${owner}/${repoName}${path ? '/' + path : ''}`;

    resultsEl.innerHTML = `
      <div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; align-items: center;">
        <button class="btn-secondary" onclick="executeSearch()" style="font-size: 11px;">← Hledání</button>
        ${path ? `<button class="btn-secondary" onclick="browseUserRepo('${owner}', '${repoName}', '${parentPath}')" style="font-size: 11px;">↑ Nahoru</button>` : ''}
        <button class="btn-secondary" onclick="copyFolderToRepo('${owner}', '${repoName}', '${path}')" style="font-size:11px; color:var(--accent); border-color:var(--accent);">📦 Kopírovat celou složku</button>
      </div>
      ${contents.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      }).map(item => {
        const isDir = item.type === 'dir';
        const isHtml = /\.html?$/i.test(item.name);
        const safeOwner = owner.replace(/'/g, "\\'");
        const safeRepo = repoName.replace(/'/g, "\\'");
        const safePath = item.path.replace(/'/g, "\\'");
        const safeName = item.name.replace(/'/g, "\\'");
        return `
          <div class="search-result-item">
            <div class="search-result-icon">${isDir ? '📂' : getFileIcon(item.name)}</div>
            <div class="search-result-content">
              <div class="search-result-title">${item.name}</div>
              <div class="search-result-desc">${isDir ? 'Složka' : formatBytes(item.size)}</div>
              <div class="search-result-actions">
                ${isDir ? `
                  <button onclick="event.stopPropagation(); browseUserRepo('${safeOwner}', '${safeRepo}', '${safePath}')" class="primary">📂 Otevřít</button>
                  <button onclick="event.stopPropagation(); copyFolderToRepo('${safeOwner}', '${safeRepo}', '${safePath}')" style="color:var(--accent); border-color:var(--accent);">📦 Kopírovat složku</button>
                ` : `
                  ${isHtml ? `<button onclick="event.stopPropagation(); previewHtmlFile('${safeOwner}', '${safeRepo}', '${safePath}', '${defaultBranch}')" class="primary">▶️ Spustit</button>` : ''}
                  <button onclick="event.stopPropagation(); window.open('${item.html_url}', '_blank')">🔗 GitHub</button>
                  <button onclick="event.stopPropagation(); copyFileToRepo('${safeOwner}', '${safeRepo}', '${safePath}', '${safeName}')" style="color:var(--accent); border-color:var(--accent);">📋 Kopírovat</button>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;
    document.getElementById('searchPagination').style.display = 'none';
  } catch (e) {
    resultsEl.innerHTML = `<div class="search-empty"><div class="icon">⚠️</div><p>Chyba: ${e.message}</p></div>`;
  }
}

// ── Kopírování souborů z cizího repo do vlastního ──

function copyFileToRepo(srcOwner, srcRepo, srcPath, fileName) {
  openCopyToRepoModal([{ srcOwner, srcRepo, srcPath, fileName, isDir: false }], fileName);
}

function copyFolderToRepo(srcOwner, srcRepo, srcPath) {
  const folderName = srcPath ? srcPath.split('/').pop() : srcRepo;
  openCopyToRepoModal([{ srcOwner, srcRepo, srcPath, fileName: folderName, isDir: true }], `složka "${folderName}"`);
}

function openCopyToRepoModal(items, label) {
  if (!REPOS.length) {
    toast('Nemáš žádné vlastní repozitáře.', 'error');
    return;
  }

  // Sestav modal dynamicky
  const modal = document.getElementById('copyToRepoModal');
  document.getElementById('copyToRepoLabel').textContent = label;

  // Naplň select vlastními repozitáři
  const repoSelect = document.getElementById('copyTargetRepo');
  repoSelect.innerHTML = REPOS.map(r => `<option value="${r.name}">${r.name}</option>`).join('');

  // Nastav výchozí cestu na aktuální
  const pathInput = document.getElementById('copyTargetPath');
  pathInput.value = CURRENT_PATH || '';

  // Ulož co kopírujeme
  modal._items = items;

  modal.style.display = 'flex';
}

async function executeCopyToRepo() {
  const modal = document.getElementById('copyToRepoModal');
  const items = modal._items;
  const targetRepo = document.getElementById('copyTargetRepo').value;
  const targetPath = document.getElementById('copyTargetPath').value.trim().replace(/^\/|\/$/g, '');

  if (!targetRepo) { toast('Vyber cílové repo.', 'error'); return; }

  const confirmBtn = document.getElementById('confirmCopyToRepo');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Kopíruji...';

  let totalCopied = 0;
  let totalFailed = 0;

  for (const item of items) {
    if (item.isDir) {
      try {
        const files = await fetchAllFilesExternal(item.srcOwner, item.srcRepo, item.srcPath);
        const folderName = item.srcPath ? item.srcPath.split('/').pop() : item.srcRepo;
        const total = files.length;
        let done = 0;
        toast(`Načítám SHA cache...`, 'success', 60000);
        // Sestav SHA cache pro cílovou složku
        const shaCache = await buildShaCache(targetRepo, targetPath);
        toast(`Kopíruji složku... 0/${total}`, 'success', 60000);
        for (const f of files) {
          const relPath = f.path.replace(item.srcOwner + '/' + item.srcRepo + '/', '');
          const relToFolder = item.srcPath ? relPath.replace(item.srcPath + '/', folderName + '/') : relPath;
          const destPath = targetPath ? `${targetPath}/${relToFolder}` : relToFolder;
          try {
            await uploadFileWithCache(targetRepo, destPath, f.content.replace(/\n/g, ''), `Copy: ${relToFolder} from ${item.srcOwner}/${item.srcRepo}`, shaCache);
            done++;
            totalCopied++;
          } catch (e) {
            totalFailed++;
          }
          toast(`Kopíruji složku... ${done}/${total}`, 'success', 60000);
        }
      } catch (e) {
        toast('Chyba při kopírování složky: ' + e.message, 'error');
        totalFailed++;
      }
    } else {
      try {
        toast(`Kopíruji ${item.fileName}...`, 'success', 30000);
        const fileData = await ghFetch(`/repos/${item.srcOwner}/${item.srcRepo}/contents/${item.srcPath}`);
        const destPath = targetPath ? `${targetPath}/${item.fileName}` : item.fileName;
        // Pro jeden soubor stačí jednoduchý uploadFileToGitHub
        await uploadFileToGitHub(targetRepo, destPath, fileData.content.replace(/\n/g, ''), `Copy: ${item.fileName} from ${item.srcOwner}/${item.srcRepo}`);
        totalCopied++;
      } catch (e) {
        toast('Chyba: ' + e.message, 'error');
        totalFailed++;
      }
    }
  }

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Kopírovat';
  modal.style.display = 'none';

  if (totalCopied > 0) {
    toast(`✓ Zkopírováno ${totalCopied} soubor${totalCopied > 1 ? 'ů' : ''} do ${targetRepo}${targetPath ? '/' + targetPath : ''}!`);
    // Pokud jsme právě v cílovém repu, refreshni
    if (CURRENT_REPO === targetRepo) {
      openRepo(CURRENT_REPO, CURRENT_PATH);
    }
  }
  if (totalFailed > 0) {
    toast(`${totalFailed} soubor${totalFailed > 1 ? 'ů' : ''} se nepodařilo zkopírovat.`, 'error');
  }
}

// Fetch všech souborů z cizího (nebo vlastního) repo — bez BACKUP_CANCELLED
async function fetchAllFilesExternal(owner, repo, path = '') {
  const endpoint = path
    ? `/repos/${owner}/${repo}/contents/${path}`
    : `/repos/${owner}/${repo}/contents`;
  const items = await ghFetch(endpoint);
  let files = [];
  for (const item of items) {
    if (item.type === 'dir') {
      const sub = await fetchAllFilesExternal(owner, repo, item.path);
      files = files.concat(sub);
    } else {
      const fileData = await ghFetch(`/repos/${owner}/${repo}/contents/${item.path}`);
      files.push({ path: owner + '/' + repo + '/' + item.path, content: fileData.content });
    }
  }
  return files;
}

// Preview HTML souboru v iframe
function previewHtmlFile(owner, repo, path, branch = 'main') {
  // Otevře HTML soubor v novém okně prohlížeče přes htmlpreview.github.io
  // Funguje pro jakýkoliv veřejný repozitář, i bez GitHub Pages
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const previewUrl = `https://htmlpreview.github.io/?${githubUrl}`;
  window.open(previewUrl, '_blank');
}

// ═══════════════════════════════════════
//  SEARCH ENHANCEMENTS
// ═══════════════════════════════════════

// ── Rate Limit Display ──
function updateRateLimitDisplay() {
  const el = document.getElementById('rateLimitBadge');
  if (!el || RATE_LIMIT.remaining === null) return;
  const pct = RATE_LIMIT.limit ? RATE_LIMIT.remaining / RATE_LIMIT.limit : 1;
  const color = pct > 0.4 ? 'var(--accent)' : pct > 0.15 ? 'var(--yellow)' : 'var(--red)';
  const resetMin = RATE_LIMIT.reset
    ? Math.max(0, Math.ceil((RATE_LIMIT.reset * 1000 - Date.now()) / 60000))
    : '?';
  el.style.display = 'flex';
  el.innerHTML = `
    <span style="color:${color}; font-size:10px;">⬤</span>
    API: <strong style="color:${color}">${RATE_LIMIT.remaining}</strong><span style="opacity:.7;">/${RATE_LIMIT.limit}</span>
    <span style="opacity:.6; font-size:10px; margin-left:4px;">reset za ${resetMin} min</span>
  `;
}

// ── Search History ──
function loadSearchHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveToSearchHistory(query, type) {
  if (!query.trim()) return;
  let history = loadSearchHistory();
  history = history.filter(h => !(h.query === query && h.type === type));
  history.unshift({ query, type, ts: Date.now() });
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
}

function renderSearchHistoryDropdown() {
  const dropdown = document.getElementById('searchHistoryDropdown');
  const input = document.getElementById('searchQueryInput');
  if (!dropdown || !input) return;
  const history = loadSearchHistory();
  const val = input.value.toLowerCase();
  const filtered = val ? history.filter(h => h.query.toLowerCase().includes(val)) : history;
  if (!filtered.length) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = `
    <div class="search-history-header">
      🕐 Historie
      <button onmousedown="clearSearchHistory()" class="search-history-clear">Vymazat</button>
    </div>
    ${filtered.slice(0, 8).map(h => `
      <div class="search-history-item" onmousedown="applyHistoryItem(${JSON.stringify(h.query)}, '${h.type}')">
        <span class="search-history-text">${escapeHtml(h.query)}</span>
        <span class="search-history-type">${h.type}</span>
      </div>
    `).join('')}
  `;
  dropdown.style.display = 'block';
}

function applyHistoryItem(query, type) {
  document.getElementById('searchQueryInput').value = query;
  SEARCH_STATE.query = query;
  SEARCH_STATE.type = type;
  SEARCH_STATE.filters = type === 'code' ? { language: 'HTML' } : {};
  SEARCH_STATE.page = 1;
  document.querySelectorAll('.search-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  renderSearchFilters();
  const dd = document.getElementById('searchHistoryDropdown');
  if (dd) dd.style.display = 'none';
  executeSearch();
}

function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
  const dd = document.getElementById('searchHistoryDropdown');
  if (dd) dd.style.display = 'none';
}

// ── Saved Searches ──
function loadSavedSearches() {
  try { return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]'); } catch { return []; }
}

function saveCurrentSearch() {
  const query = SEARCH_STATE.query.trim();
  if (!query) { toast('Zadej nejdřív hledaný výraz', 'error'); return; }
  const searches = loadSavedSearches();
  if (searches.some(s => s.query === query && s.type === SEARCH_STATE.type)) {
    toast('Toto hledání je již uloženo', 'error'); return;
  }
  searches.unshift({
    label: query.length > 40 ? query.substring(0, 40) + '…' : query,
    query, type: SEARCH_STATE.type,
    filters: { ...SEARCH_STATE.filters },
    ts: Date.now()
  });
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
  renderSavedSearches();
  toast('Hledání uloženo 💾');
}

function applySavedSearch(index) {
  const s = loadSavedSearches()[index];
  if (!s) return;
  SEARCH_STATE.query = s.query;
  SEARCH_STATE.type = s.type;
  SEARCH_STATE.filters = { ...s.filters };
  SEARCH_STATE.page = 1;
  document.getElementById('searchQueryInput').value = s.query;
  document.querySelectorAll('.search-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === s.type));
  renderSearchFilters();
  executeSearch();
}

function deleteSavedSearch(index, e) {
  e.stopPropagation();
  const searches = loadSavedSearches();
  searches.splice(index, 1);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
  renderSavedSearches();
}

function renderSavedSearches() {
  const container = document.getElementById('savedSearchesList');
  if (!container) return;
  const searches = loadSavedSearches();
  const toggle = document.getElementById('savedSearchesToggle');
  if (toggle) {
    const label = toggle.querySelector('.saved-toggle-label');
    if (label) label.textContent = `🔖 Uložená hledání${searches.length ? ' (' + searches.length + ')' : ''}`;
  }
  if (!searches.length) {
    container.innerHTML = '<div class="saved-searches-empty">Uložená hledání jsou prázdná. Klikni 💾 pro uložení.</div>';
    return;
  }
  container.innerHTML = searches.map((s, i) => `
    <div class="saved-search-item" onclick="applySavedSearch(${i})">
      <span class="saved-search-type">${s.type}</span>
      <span class="saved-search-label">${escapeHtml(s.label)}</span>
      <button class="saved-search-del" onclick="deleteSavedSearch(${i}, event)" title="Smazat">✕</button>
    </div>
  `).join('');
}

function toggleSavedSearches() {
  const section = document.getElementById('savedSearchesList');
  const toggle = document.getElementById('savedSearchesToggle');
  if (!section) return;
  const open = section.style.display !== 'none';
  section.style.display = open ? 'none' : 'block';
  if (toggle) toggle.classList.toggle('open', !open);
}

// ── Code Fragments Toggle ──
function toggleCodeFragments(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  btn.textContent = open ? `▼ ${el.children.length} dalších shod` : '▲ Skrýt';
}

// ── Star / Unstar Repo ──
async function toggleStarRepo(owner, repo, btn) {
  if (!TOKEN) return;
  btn.disabled = true;
  const starred = btn.dataset.starred === 'true';
  try {
    await fetch(`${API}/user/starred/${owner}/${repo}`, {
      method: starred ? 'DELETE' : 'PUT',
      headers: {
        Authorization: 'token ' + TOKEN,
        Accept: 'application/vnd.github.v3+json',
        'Content-Length': '0'
      }
    });
    btn.dataset.starred = String(!starred);
    btn.textContent = starred ? '☆ Star' : '⭐ Starred';
    btn.classList.toggle('starred', !starred);
    toast(starred ? 'Hvězdička odebrána' : '⭐ Přidáno do oblíbených');
  } catch(e) {
    toast('Chyba: ' + e.message, 'error');
  }
  btn.disabled = false;
}

// Search modal event listeners
document.getElementById('searchBtn').onclick = () => {
  document.getElementById('searchModal').style.display = 'flex';
  // Přednastavit code + HTML
  SEARCH_STATE.type = 'code';
  SEARCH_STATE.filters = { language: 'HTML' };
  document.querySelectorAll('.search-type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.type === 'code');
  });
  renderSearchFilters();
  renderSavedSearches();
  document.getElementById('searchQueryInput').focus();
};

document.getElementById('closeSearchModal').onclick = () => {
  document.getElementById('searchModal').style.display = 'none';
};

document.getElementById('searchModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('searchModal')) {
    document.getElementById('searchModal').style.display = 'none';
  }
});

// Search type tabs
document.querySelectorAll('.search-type-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.search-type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    SEARCH_STATE.type = tab.dataset.type;
    // Přednastavit HTML pro code
    SEARCH_STATE.filters = tab.dataset.type === 'code' ? { language: 'HTML' } : {};
    SEARCH_STATE.page = 1;
    renderSearchFilters();
    document.getElementById('searchResults').innerHTML = '<div class="search-empty"><div class="icon">🔎</div><p>Zadej hledaný výraz</p></div>';
    document.getElementById('searchStats').textContent = '';
    document.getElementById('searchPagination').style.display = 'none';
  });
});

// Execute search
document.getElementById('executeSearchBtn').onclick = () => {
  SEARCH_STATE.page = 1;
  executeSearch();
};

document.getElementById('searchQueryInput').addEventListener('input', (e) => {
  SEARCH_STATE.query = e.target.value;
  renderSearchHistoryDropdown();
  // Auto-search s debounce pro ne-code typy (sníſení počtu API volání)
  if (SEARCH_STATE.type !== 'code' && e.target.value.length >= 3) {
    clearTimeout(SEARCH_DEBOUNCE_TIMER);
    SEARCH_DEBOUNCE_TIMER = setTimeout(() => {
      SEARCH_STATE.page = 1;
      executeSearch();
    }, 700);
  }
});

document.getElementById('searchQueryInput').addEventListener('focus', () => {
  renderSearchHistoryDropdown();
});

document.getElementById('searchQueryInput').addEventListener('blur', () => {
  setTimeout(() => {
    const dd = document.getElementById('searchHistoryDropdown');
    if (dd) dd.style.display = 'none';
  }, 200);
});

document.getElementById('searchQueryInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    SEARCH_STATE.page = 1;
    executeSearch();
  }
});

// Pagination
document.getElementById('searchPrevPage').onclick = () => {
  if (SEARCH_STATE.page > 1) {
    SEARCH_STATE.page--;
    executeSearch();
  }
};

document.getElementById('searchNextPage').onclick = () => {
  const totalPages = Math.ceil(SEARCH_STATE.totalCount / SEARCH_STATE.perPage);
  if (SEARCH_STATE.page < totalPages) {
    SEARCH_STATE.page++;
    executeSearch();
  }
};

// ═══════════════════════════════════════
//  MOUSE BACK BUTTON NAVIGATION
// ═══════════════════════════════════════
// Boční tlačítko myši (button 3 = back) → navigace o složku výš
// POZOR: browser může button 3 interpretovat různě:
// - Chrome/Edge: button 3 = back mouse button (Mouse4)
// - Firefox: stejně
// mouseup zachytíme před contextmenu eventem
let _mouseBackHandled = false;

document.addEventListener("mousedown", (e) => {
  _mouseBackHandled = false;
  if (e.button === 3) {
    e.preventDefault();
    _mouseBackHandled = true;
    if (CURRENT_REPO && CURRENT_PATH) {
      const parts = CURRENT_PATH.split("/");
      const parentPath = parts.slice(0, -1).join("/");
      openRepo(CURRENT_REPO, parentPath);
    } else if (CURRENT_REPO && !CURRENT_PATH) {
      showHomeView();
    }
  }
});

// Zabránit výchozímu kontextovému menu pro boční tlačítka
document.addEventListener("contextmenu", (e) => {
  if (_mouseBackHandled) {
    e.preventDefault();
    _mouseBackHandled = false;
  }
});

document.addEventListener("auxclick", (e) => {
  if (e.button === 3 || e.button === 4) {
    e.preventDefault();
  }
});
document.addEventListener("keydown", (e) => {
  // Ctrl+Shift+F - Otevřít GitHub Search
  if (e.ctrlKey && e.shiftKey && e.key === 'F' && TOKEN) {
    e.preventDefault();
    document.getElementById('searchBtn').click();
  }
  // Ctrl+F - Fokus na filtrování
  if (e.ctrlKey && e.key === "f" && CURRENT_REPO) {
    e.preventDefault();
    document.getElementById("fileFilterInput").focus();
  }

  // Delete - Smazat vybrané soubory (v contextu repozitáře)
  if (e.key === "Delete" && CURRENT_REPO) {
    const selectedRows = document.querySelectorAll(".row-checkbox:checked");
    if (selectedRows.length > 0) {
      e.preventDefault();
      deleteSelectedItems(CURRENT_REPO, CURRENT_PATH);
    }
  }

  // F2 - Přejmenovat první vybraný soubor
  if (e.key === "F2" && CURRENT_REPO) {
    e.preventDefault();
    const selectedRow = document.querySelector(".row-checkbox:checked");
    if (selectedRow) {
      const row = selectedRow.closest(".file-row");
      if (row) {
        const name = row.dataset.name;
        const path = row.dataset.path;
        const type = row.dataset.type;
        openFileContext(
          name,
          path,
          type,
          row.dataset.size || 0,
          CURRENT_REPO,
        );
        // Automaticky otevřít rename
        setTimeout(() => {
          const renameBtn = document.getElementById("ctxRename");
          if (renameBtn) renameBtn.click();
        }, 100);
      }
    }
  }

  // Escape - Zavřít modaly
  if (e.key === "Escape") {
    document.getElementById("fileViewerModal").style.display = "none";
    document.getElementById("ctxModal").style.display = "none";
    document.getElementById("newFileModal").style.display = "none";
    document.getElementById("newRepoModal").style.display = "none";
    document.getElementById("repoCtxModal").style.display = "none";
    document.getElementById("editDescModal").style.display = "none";
    document.getElementById("searchModal").style.display = "none";
    document.getElementById("copyToRepoModal").style.display = "none";
    document.getElementById("syncModal").style.display = "none";
    document.getElementById("cloneModal").style.display = "none";
  }
});

// ═══════════════════════════════════════
//  COPY TO REPO MODAL
// ═══════════════════════════════════════
document.getElementById('cancelCopyToRepo').onclick = () => {
  document.getElementById('copyToRepoModal').style.display = 'none';
};
document.getElementById('copyToRepoModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('copyToRepoModal')) {
    document.getElementById('copyToRepoModal').style.display = 'none';
  }
});

// ═══════════════════════════════════════
//  SYNC — lokální složka ↔ GitHub repo
// ═══════════════════════════════════════

let SYNC_DIR_HANDLE = null;   // FileSystemDirectoryHandle
let SYNC_ANALYSIS = null;     // výsledek porovnání

// Otevřít sync modal
document.getElementById("syncBtn").addEventListener("click", () => {
  if (!REPOS.length) { toast("Nejdřív se přihlas.", "error"); return; }
  const sel = document.getElementById("syncTargetRepo");
  sel.innerHTML = REPOS.map(r => `<option value="${r.name}">${r.name}</option>`).join("");
  // Předvyplň aktuální repo pokud je otevřené
  if (CURRENT_REPO) sel.value = CURRENT_REPO;
  document.getElementById("syncRepoPath").value = CURRENT_PATH || "";
  resetSyncUI();
  document.getElementById("syncModal").style.display = "flex";
});

document.getElementById("closeSyncModal").addEventListener("click", () => {
  document.getElementById("syncModal").style.display = "none";
});
document.getElementById("syncModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("syncModal"))
    document.getElementById("syncModal").style.display = "none";
});

function resetSyncUI() {
  SYNC_ANALYSIS = null;
  document.getElementById("syncStatusPanel").style.display = "none";
  document.getElementById("syncStatusList").innerHTML = "";
  document.getElementById("syncCommitArea").style.display = "none";
  document.getElementById("syncPushBtn").style.display = "none";
  document.getElementById("syncPullBtn").style.display = "none";
}

// Výběr lokální složky přes File System Access API
document.getElementById("syncPickFolderBtn").addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    toast("Tvůj prohlížeč nepodporuje File System Access API. Použij Chrome nebo Edge.", "error", 5000);
    return;
  }
  try {
    SYNC_DIR_HANDLE = await window.showDirectoryPicker({ mode: "readwrite" });
    document.getElementById("syncLocalFolderName").value = SYNC_DIR_HANDLE.name;
    resetSyncUI();
    toast(`Složka "${SYNC_DIR_HANDLE.name}" vybrána`);
  } catch (e) {
    if (e.name !== "AbortError") toast("Chyba při výběru složky: " + e.message, "error");
  }
});

// Rekurzivně načte všechny soubory z lokální složky → Map<relativePath, File>
async function readLocalFiles(dirHandle, prefix = "") {
  const result = new Map();
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      result.set(prefix + name, { handle, file, mtime: file.lastModified });
    } else if (handle.kind === "directory") {
      const sub = await readLocalFiles(handle, prefix + name + "/");
      sub.forEach((v, k) => result.set(k, v));
    }
  }
  return result;
}

// Rekurzivně načte všechny soubory z GitHub repo → Map<relativePath, {sha, size}>
async function readGitHubFiles(repo, repoPath = "") {
  const result = new Map();
  async function scan(path) {
    const endpoint = path
      ? `/repos/${USERNAME}/${repo}/contents/${path}`
      : `/repos/${USERNAME}/${repo}/contents`;
    let items;
    try { items = await ghFetch(endpoint); } catch { return; }
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item.type === "dir") {
        await scan(item.path);
      } else {
        // Relativní cesta vůči repoPath
        const rel = repoPath ? item.path.replace(repoPath + "/", "") : item.path;
        result.set(rel, { sha: item.sha, size: item.size, fullPath: item.path });
      }
    }
  }
  await scan(repoPath);
  return result;
}

// Porovnej lokální vs GitHub
document.getElementById("syncAnalyzeBtn").addEventListener("click", async () => {
  if (!SYNC_DIR_HANDLE) { toast("Nejdřív vyber lokální složku.", "error"); return; }
  const repo = document.getElementById("syncTargetRepo").value;
  const repoPath = document.getElementById("syncRepoPath").value.trim().replace(/^\/|\/$/g, "");

  const btn = document.getElementById("syncAnalyzeBtn");
  btn.disabled = true;
  btn.textContent = "🔍 Porovnávám...";
  resetSyncUI();

  try {
    toast("Načítám lokální soubory...", "success", 30000);
    const localFiles = await readLocalFiles(SYNC_DIR_HANDLE);

    toast("Načítám GitHub soubory...", "success", 30000);
    const ghFiles = await readGitHubFiles(repo, repoPath);

    // Porovnej — pro každý lokální soubor zjisti SHA obsahu
    // GitHub SHA = sha1("blob " + size + "\0" + content)
    const analysis = { toUpload: [], toDownload: [], same: [], conflict: [] };

    // Lokální → GitHub
    for (const [relPath, localInfo] of localFiles) {
      const ghInfo = ghFiles.get(relPath);
      if (!ghInfo) {
        analysis.toUpload.push({ relPath, localInfo, reason: "nový lokálně" });
      } else {
        // Porovnej SHA obsahu
        const localSha = await computeGitBlobSha(localInfo.file);
        if (localSha !== ghInfo.sha) {
          analysis.toUpload.push({ relPath, localInfo, ghInfo, reason: "změněn lokálně" });
        } else {
          analysis.same.push(relPath);
        }
        ghFiles.delete(relPath); // odznač jako zpracovaný
      }
    }

    // Co zbyde v ghFiles = existuje na GitHubu ale ne lokálně
    for (const [relPath, ghInfo] of ghFiles) {
      analysis.toDownload.push({ relPath, ghInfo, reason: "chybí lokálně" });
    }

    SYNC_ANALYSIS = { analysis, repo, repoPath, localFiles };

    // Zobraz výsledek
    renderSyncAnalysis(analysis);

  } catch (e) {
    toast("Chyba při analýze: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "🔍 Porovnat";
  }
});

// Výpočet Git blob SHA (sha1 of "blob <size>\0<content>")
async function computeGitBlobSha(file) {
  const buffer = await file.arrayBuffer();
  const header = new TextEncoder().encode(`blob ${buffer.byteLength}\0`);
  const combined = new Uint8Array(header.byteLength + buffer.byteLength);
  combined.set(header, 0);
  combined.set(new Uint8Array(buffer), header.byteLength);
  const hashBuffer = await crypto.subtle.digest("SHA-1", combined);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function renderSyncAnalysis(analysis) {
  const panel = document.getElementById("syncStatusPanel");
  const list = document.getElementById("syncStatusList");
  panel.style.display = "block";

  const total = analysis.toUpload.length + analysis.toDownload.length + analysis.same.length;
  let html = `<div style="margin-bottom:8px; color:var(--text-dim);">Celkem souborů: ${total} · `;
  html += `<span style="color:var(--accent);">↑ ${analysis.toUpload.length} k nahrání</span> · `;
  html += `<span style="color:var(--blue);">↓ ${analysis.toDownload.length} ke stažení</span> · `;
  html += `<span style="color:var(--text-dim);">${analysis.same.length} shodných</span></div>`;

  if (analysis.toUpload.length) {
    html += `<div style="color:var(--accent); margin-bottom:4px;">⬆️ K nahrání na GitHub:</div>`;
    analysis.toUpload.forEach(f => {
      html += `<div style="padding:2px 0 2px 12px; color:var(--text);">📄 ${f.relPath} <span style="color:var(--text-dim); font-size:10px;">(${f.reason})</span></div>`;
    });
  }
  if (analysis.toDownload.length) {
    html += `<div style="color:var(--blue); margin-top:8px; margin-bottom:4px;">⬇️ Ke stažení z GitHubu:</div>`;
    analysis.toDownload.forEach(f => {
      html += `<div style="padding:2px 0 2px 12px; color:var(--text);">📄 ${f.relPath} <span style="color:var(--text-dim); font-size:10px;">(${f.reason})</span></div>`;
    });
  }
  if (analysis.toUpload.length === 0 && analysis.toDownload.length === 0) {
    html += `<div style="color:var(--accent); text-align:center; padding:8px;">✓ Vše je synchronizované!</div>`;
  }

  list.innerHTML = html;

  // Zobraz tlačítka
  const pushBtn = document.getElementById("syncPushBtn");
  const pullBtn = document.getElementById("syncPullBtn");
  const commitArea = document.getElementById("syncCommitArea");

  pushBtn.style.display = analysis.toUpload.length > 0 ? "block" : "none";
  pushBtn.textContent = `⬆️ Push (${analysis.toUpload.length} souborů)`;
  pullBtn.style.display = analysis.toDownload.length > 0 ? "block" : "none";
  pullBtn.textContent = `⬇️ Pull (${analysis.toDownload.length} souborů)`;
  commitArea.style.display = analysis.toUpload.length > 0 ? "block" : "none";
  document.getElementById("syncCommitMsg").value =
    `Sync: ${analysis.toUpload.length} changed, ${analysis.toDownload.length} new local`;
}

// PUSH — nahraje změněné/nové lokální soubory na GitHub
document.getElementById("syncPushBtn").addEventListener("click", async () => {
  if (!SYNC_ANALYSIS) return;
  const { analysis, repo, repoPath } = SYNC_ANALYSIS;
  const commitMsg = document.getElementById("syncCommitMsg").value.trim() || "Sync update";
  const btn = document.getElementById("syncPushBtn");
  btn.disabled = true;

  const files = analysis.toUpload;
  const total = files.length;
  let done = 0;
  let failed = 0;

  // Sestav SHA cache pro cílovou cestu
  showUploadProgress("Načítám SHA cache...", 0, files.length);
  const shaCache = await buildShaCache(repo, repoPath);
  showUploadProgress("Push na GitHub...", 0, total);

  for (const f of files) {
    updateUploadProgressFile(f.relPath);
    try {
      const content = await readFileAsBase64(f.localInfo.file);
      const uploadPath = repoPath ? `${repoPath}/${f.relPath}` : f.relPath;
      await uploadFileWithCache(repo, uploadPath, content, `${commitMsg}: ${f.relPath}`, shaCache);
      done++;
    } catch (e) {
      failed++;
      console.error("Push chyba:", f.relPath, e);
    }
    showUploadProgress("Push na GitHub...", done + failed, total);
  }

  hideUploadProgress();
  btn.disabled = false;
  if (failed > 0) {
    toast(`Push hotov: ${done}/${total} úspěšně, ${failed} selhalo.`, "error");
  } else {
    toast(`✓ Push hotov: ${done} souborů nahráno na GitHub!`);
  }
  // Znovu analyzuj
  document.getElementById("syncAnalyzeBtn").click();
  if (CURRENT_REPO === repo) openRepo(repo, CURRENT_PATH);
});

// PULL — stáhne soubory z GitHubu do lokální složky
document.getElementById("syncPullBtn").addEventListener("click", async () => {
  if (!SYNC_ANALYSIS || !SYNC_DIR_HANDLE) return;
  const { analysis, repo } = SYNC_ANALYSIS;
  const btn = document.getElementById("syncPullBtn");
  btn.disabled = true;

  const files = analysis.toDownload;
  const total = files.length;
  let done = 0;
  let failed = 0;

  showUploadProgress("Pull z GitHubu...", 0, total);

  for (const f of files) {
    updateUploadProgressFile(f.relPath);
    try {
      // Stáhni obsah z GitHubu
      const fileData = await ghFetch(`/repos/${USERNAME}/${repo}/contents/${f.ghInfo.fullPath}`);
      const binaryStr = atob(fileData.content.replace(/\n/g, ""));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // Zapiš do lokální složky (vytvoř podsložky pokud chybí)
      const parts = f.relPath.split("/");
      let dirHandle = SYNC_DIR_HANDLE;
      for (let i = 0; i < parts.length - 1; i++) {
        dirHandle = await dirHandle.getDirectoryHandle(parts[i], { create: true });
      }
      const fileName = parts[parts.length - 1];
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      done++;
    } catch (e) {
      failed++;
      console.error("Pull chyba:", f.relPath, e);
    }
    showUploadProgress("Pull z GitHubu...", done + failed, total);
  }

  hideUploadProgress();
  btn.disabled = false;
  if (failed > 0) {
    toast(`Pull hotov: ${done}/${total} staženo, ${failed} selhalo.`, "error");
  } else {
    toast(`✓ Pull hotov: ${done} souborů staženo do lokální složky!`);
  }
  document.getElementById("syncAnalyzeBtn").click();
});
(async () => {
  const saved = loadToken();
  if (!saved) return;
  TOKEN = saved;
  try {
    const user = await ghFetch("/user");
    USERNAME = user.login;
    await loadRepos();
    document.getElementById("loginPanel").style.display = "none";
    document.getElementById("sidebar").style.display = "flex";
    document.getElementById("mainContent").style.display = "block";
    document.getElementById("statusDot").classList.add("connected");
    document.getElementById("statusLabel").textContent = USERNAME;
    document.getElementById("logoutBtn").style.display = "inline-block";
    document.getElementById("searchBtn").style.display = "inline-block";
    document.getElementById("logoutArea").style.display = "block";
    document.getElementById("sidebarGreeting").innerHTML = `👋 Ahoj, ${USERNAME}!<div class="sidebar-sub">Tvoje repozitáře</div>`;
    showHomeView();
    initMobileTabs();
  } catch (e) {
    clearToken();
    TOKEN = "";
  }
})();

// ═══════════════════════════════════════
//  CLONE MODAL
// ═══════════════════════════════════════
function openCloneModal(repoName, cloneUrl, sshUrl) {
  document.getElementById("cloneRepoTitle").textContent = repoName;
  document.getElementById("cloneCmdHttps").textContent = `git clone ${cloneUrl}`;
  document.getElementById("cloneCmdSsh").textContent = `git clone ${sshUrl}`;
  document.getElementById("cloneCmdInit").textContent = `git init\ngit remote add origin ${cloneUrl}\ngit pull origin main`;
  document.getElementById("cloneModal").style.display = "flex";
}

function copyCloneCmd(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    toast("Zkopírováno do schránky!");
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("Zkopírováno!");
  });
}

const _closeCloneBtn = document.getElementById("closeCloneModal");
if (_closeCloneBtn) _closeCloneBtn.addEventListener("click", () => {
  document.getElementById("cloneModal").style.display = "none";
});
const _cloneModalEl = document.getElementById("cloneModal");
if (_cloneModalEl) _cloneModalEl.addEventListener("click", (e) => {
  if (e.target === _cloneModalEl) _cloneModalEl.style.display = "none";
});
