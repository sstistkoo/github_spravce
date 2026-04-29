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
      </div>
    </div>
    <div class="toolbar-actions">
      <button class="btn-secondary" id="uploadFilesBtn">
        <span>📤</span> Nahrát soubory
      </button>
      <button class="btn-secondary" id="selectAllBtn">
        <span>☑️</span> Vybrat vše
      </button>
      <button class="btn-secondary" id="deselectAllBtn" style="display:none;">
        <span>⬜</span> Zrušit výběr
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
  html += "</tbody></table>";
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

  function updateSelectionUI() {
    const checkedCount = Array.from(rowCheckboxes).filter(
      (cb) => cb.checked,
    ).length;
    if (checkedCount > 0) {
      deselectAllBtn.style.display = "inline-flex";
      selectAllBtn.style.display = "none";
      selectAllCb.checked = checkedCount === rowCheckboxes.length;
    } else {
      deselectAllBtn.style.display = "none";
      selectAllBtn.style.display = "inline-flex";
      selectAllCb.checked = false;
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

  rowCheckboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      updateSelectionUI();
    });
    // Zabránit kliknutí na checkbox od otevření souboru
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
let VIEWER_ORIGINAL_CONTENT = "";
let VIEWER_SEARCH_MATCHES = [];
let VIEWER_CURRENT_MATCH = -1;

async function openFileViewer(name, path, repo) {
  VIEWER_FILE = { name, path, repo };
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
            method: "POST",
            body: JSON.stringify({
              message: `rename: ${CTX_FILE.name} → ${newName}`,
              content: fileData.content,
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

// recursively delete a folder (GitHub has no folder-delete endpoint)
async function deleteDir(repo, dirPath) {
  const items = await ghFetch(
    `/repos/${USERNAME}/${repo}/contents/${dirPath}`,
  );
  for (const item of items) {
    if (item.type === "dir") {
      await deleteDir(repo, item.path);
    } else {
      await ghFetch(`/repos/${USERNAME}/${repo}/contents/${item.path}`, {
        method: "DELETE",
        body: JSON.stringify({
          message: `delete: ${item.path}`,
          sha: item.sha,
        }),
      });
    }
  }
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
function openFileUploadDialog(repo, path) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    toast(
      `Nahrávám ${files.length} soubor${files.length > 1 ? "ů" : ""}...`,
    );

    let uploaded = 0;
    for (const file of files) {
      try {
        const content = await readFileAsBase64(file);
        const uploadPath = path ? `${path}/${file.name}` : file.name;

        await ghFetch(
          `/repos/${USERNAME}/${repo}/contents/${uploadPath}`,
          {
            method: "PUT",
            body: JSON.stringify({
              message: `Upload: ${file.name}`,
              content: content,
            }),
          },
        );
        uploaded++;
      } catch (err) {
        toast(`Chyba při nahrání ${file.name}: ${err.message}`, "error");
      }
    }

    if (uploaded > 0) {
      toast(
        `Nahráno ${uploaded} z ${files.length} soubor${uploaded > 1 ? "ů" : ""}!`,
      );
      openRepo(repo, path);
    }
  };
  input.click();
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
function setupDragAndDrop() {
  const overlay = document.getElementById("dragDropOverlay");
  const content = document.getElementById("mainContent");
  let dragCounter = 0;

  // Prevent default drag behaviors
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Show overlay when dragging over
  document.body.addEventListener("dragenter", (e) => {
    // Only activate if user is logged in and viewing a repo
    if (!CURRENT_REPO) return;

    dragCounter++;
    overlay.classList.add("active");
    if (content) content.classList.add("drag-over");
  });

  document.body.addEventListener("dragleave", (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      overlay.classList.remove("active");
      if (content) content.classList.remove("drag-over");
    }
  });

  // Handle drop
  document.body.addEventListener("drop", async (e) => {
    dragCounter = 0;
    overlay.classList.remove("active");
    if (content) content.classList.remove("drag-over");

    // Only process if user is logged in and viewing a repo
    if (!CURRENT_REPO) return;

    const items = e.dataTransfer.items;
    const files = [];

    // Process dropped items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await processEntry(entry, "", files);
        }
      }
    }

    if (files.length > 0) {
      await uploadFilesFromDrop(files);
    }
  });

  // Process directory entry recursively
  async function processEntry(entry, path, files) {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          files.push({ file, path: path + file.name });
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise((resolve) => {
        dirReader.readEntries(async (entries) => {
          for (const entry of entries) {
            await processEntry(entry, path + entry.name + "/", files);
          }
          resolve();
        });
      });
    }
  }

  // Upload files from drop
  async function uploadFilesFromDrop(files) {
    toast(
      `Nahrávám ${files.length} soubor${files.length > 1 ? "ů" : ""}...`,
    );
    let uploaded = 0;

    for (const { file, path: filePath } of files) {
      try {
        const content = await readFileAsBase64(file);
        const uploadPath = CURRENT_PATH
          ? `${CURRENT_PATH}/${filePath}`
          : filePath;

        await ghFetch(
          `/repos/${USERNAME}/${CURRENT_REPO}/contents/${uploadPath}`,
          {
            method: "PUT",
            body: JSON.stringify({
              message: `Upload: ${filePath}`,
              content: content,
            }),
          },
        );
        uploaded++;
      } catch (err) {
        toast(`Chyba při nahrání ${filePath}: ${err.message}`, "error");
      }
    }

    if (uploaded > 0) {
      toast(
        `Nahráno ${uploaded} z ${files.length} soubor${uploaded > 1 ? "ů" : ""}!`,
      );
      openRepo(CURRENT_REPO, CURRENT_PATH);
    }
  }
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

async function browseUserRepo(owner, repoName, path = '') {
  BROWSE_USER = owner;
  BROWSE_REPO = repoName;
  BROWSE_PATH = path;

  const resultsEl = document.getElementById('searchResults');
  const statsEl = document.getElementById('searchStats');
  resultsEl.innerHTML = '<div class="search-empty"><div class="spinner"></div><p>Načítám...</p></div>';

  try {
    // Získat info o repo pro default branch
    const repoInfo = await ghFetch(`/repos/${owner}/${repoName}`);
    const defaultBranch = repoInfo.default_branch || 'main';

    const endpoint = path
      ? `/repos/${owner}/${repoName}/contents/${path}`
      : `/repos/${owner}/${repoName}/contents`;
    const contents = await ghFetch(endpoint);

    // Pokud je to soubor, zobraz ho
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
      <div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <button class="btn-secondary" onclick="executeSearch()" style="font-size: 11px;">← Hledání</button>
        ${path ? `<button class="btn-secondary" onclick="browseUserRepo('${owner}', '${repoName}', '${parentPath}')" style="font-size: 11px;">↑ Nahoru</button>` : ''}
      </div>
      ${contents.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      }).map(item => {
        const isDir = item.type === 'dir';
        const isHtml = /\.html?$/i.test(item.name);
        return `
          <div class="search-result-item">
            <div class="search-result-icon">${isDir ? '📂' : getFileIcon(item.name)}</div>
            <div class="search-result-content">
              <div class="search-result-title">${item.name}</div>
              <div class="search-result-desc">${isDir ? 'Složka' : formatBytes(item.size)}</div>
              <div class="search-result-actions">
                ${isDir ? `
                  <button onclick="event.stopPropagation(); browseUserRepo('${owner}', '${repoName}', '${item.path}')" class="primary">📂 Otevřít</button>
                ` : `
                  ${isHtml ? `<button onclick="event.stopPropagation(); previewHtmlFile('${owner}', '${repoName}', '${item.path}', '${defaultBranch}')" class="primary">▶️ Spustit</button>` : ''}
                  <button onclick="event.stopPropagation(); window.open('${item.html_url}', '_blank')">🔗 GitHub</button>
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
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════
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
    const selectedRows = document.querySelectorAll(
      ".row-checkbox:checked",
    );
    if (selectedRows.length > 0) {
      e.preventDefault();
      if (confirm(`Smazat ${selectedRows.length} vybraných položek?`)) {
        selectedRows.forEach(async (checkbox) => {
          const row = checkbox.closest(".file-row");
          if (row) {
            const name = row.dataset.name;
            const path = row.dataset.path;
            const type = row.dataset.type;
            try {
              if (type === "dir") {
                await deleteDir(CURRENT_REPO, path);
              } else {
                const fileData = await ghFetch(
                  `/repos/${USERNAME}/${CURRENT_REPO}/contents/${path}`,
                );
                await ghFetch(
                  `/repos/${USERNAME}/${CURRENT_REPO}/contents/${path}`,
                  {
                    method: "DELETE",
                    body: JSON.stringify({
                      message: `Delete: ${name}`,
                      sha: fileData.sha,
                    }),
                  },
                );
              }
            } catch (err) {
              toast(`Chyba při mazání ${name}: ${err.message}`, "error");
            }
          }
        });
        setTimeout(() => openRepo(CURRENT_REPO, CURRENT_PATH), 1000);
      }
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
  }
});

// ═══════════════════════════════════════
//  AUTO LOGIN (page load)
// ═══════════════════════════════════════
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
    showHomeView();
    initMobileTabs();
  } catch (e) {
    clearToken();
    TOKEN = "";
  }
})();