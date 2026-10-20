
/* ==========================================
   TIA EARN - ADMIN PANEL JAVASCRIPT
   File: public/admin.js

   Telegram Mini App Authentication
   Admin Dashboard
   User Management
   Task Management
   Withdrawal Management
   Settings
   Audit Logs
   Mobile Navigation
   Error Handling
========================================== */

"use strict";

(() => {

  /* ========================================
     1. CONFIGURATION
  ======================================== */

  const API = Object.freeze({
    auth: "/api/auth/telegram",

    overview: "/api/admin/overview",

    users: "/api/admin/users",

    tasks: "/api/admin/tasks",

    withdrawals: "/api/admin/withdrawals",

    settings: "/api/admin/settings",

    audit: "/api/admin/audit"
  });

  const PAGE_TITLES = Object.freeze({
    dashboard: "Dashboard",
    users: "Users",
    tasks: "Tasks",
    withdrawals: "Withdrawals",
    settings: "Settings",
    audit: "Audit Logs"
  });

  const PAGE_NAMES = Object.keys(PAGE_TITLES);

  const REQUEST_TIMEOUT = 20000;

  const SEARCH_DELAY = 250;

  const MAX_DISPLAY_ROWS = 200;

  const state = {
    token: null,
    user: null,
    authenticated: false,

    activePage: "dashboard",

    busyCount: 0,
    toastTimer: null,
    searchTimers: {},

    pendingConfirmation: null,

    users: [],
    tasks: [],
    submissions: [],
    withdrawals: [],
    audit: [],

    settings: {},

    overview: {},

    loginInProgress: false
  };


  /* ========================================
     2. DOM HELPERS
  ======================================== */

  function $(id) {
    return document.getElementById(id);
  }

  function $all(selector) {
    return Array.from(
      document.querySelectorAll(selector)
    );
  }

  function setText(id, value) {
    const element = $(id);

    if (!element) return;

    element.textContent =
      value === null ||
      value === undefined ||
      value === ""
        ? "—"
        : String(value);
  }

  function setValue(id, value) {
    const element = $(id);

    if (!element) return;

    element.value =
      value === null ||
      value === undefined
        ? ""
        : String(value);
  }

  function show(id) {
    const element = $(id);

    if (element) {
      element.hidden = false;
    }
  }

  function hide(id) {
    const element = $(id);

    if (element) {
      element.hidden = true;
    }
  }

  function createElement(
    tag,
    className = "",
    text = null
  ) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function createCell(value, className = "") {
    const cell = createElement(
      "td",
      className,
      value
    );

    return cell;
  }

  function clearElement(element) {
    if (!element) return;

    element.replaceChildren();
  }

  function appendEmptyRow(
    tbody,
    colspan,
    message
  ) {
    if (!tbody) return;

    clearElement(tbody);

    const row = createElement("tr");

    const cell = createElement(
      "td",
      "empty-state",
      message
    );

    cell.colSpan = colspan;

    row.appendChild(cell);

    tbody.appendChild(row);
  }

  function normalizeString(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function safeString(value) {
    return value === null ||
      value === undefined
      ? ""
      : String(value);
  }

  function getErrorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }

    return "অজানা সমস্যা হয়েছে।";
  }


  /* ========================================
     3. FORMATTING
  ======================================== */

  function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return new Intl.NumberFormat(
      "en-US",
      {
        maximumFractionDigits: 0
      }
    ).format(number);
  }

  function formatMoney(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "৳0.00";
    }

    return "৳" +
      new Intl.NumberFormat(
        "en-US",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      ).format(number);
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString(
      "en-GB",
      {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  function firstDefined(object, keys, fallback = null) {
    if (!object || typeof object !== "object") {
      return fallback;
    }

    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(
          object,
          key
        ) &&
        object[key] !== null &&
        object[key] !== undefined
      ) {
        return object[key];
      }
    }

    return fallback;
  }

  function extractArray(
    payload,
    keys = []
  ) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (
      !payload ||
      typeof payload !== "object"
    ) {
      return [];
    }

    for (const key of keys) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }

    if (
      payload.data &&
      typeof payload.data === "object"
    ) {
      if (Array.isArray(payload.data)) {
        return payload.data;
      }

      for (const key of keys) {
        if (
          Array.isArray(
            payload.data[key]
          )
        ) {
          return payload.data[key];
        }
      }
    }

    return [];
  }

  function extractObject(
    payload,
    keys = []
  ) {
    if (
      !payload ||
      typeof payload !== "object"
    ) {
      return {};
    }

    for (const key of keys) {
      const value = payload[key];

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        return value;
      }
    }

    return payload;
  }

  function getRecordId(record) {
    return firstDefined(
      record,
      ["id", "user_id", "task_id", "withdrawal_id"]
    );
  }

  function getTelegramId(record) {
    return firstDefined(
      record,
      [
        "telegram_id",
        "telegramId",
        "telegram_user_id"
      ],
      ""
    );
  }

  function getUserName(record) {
    const directName = firstDefined(
      record,
      [
        "name",
        "full_name",
        "fullName",
        "display_name"
      ]
    );

    if (directName) {
      return String(directName);
    }

    const firstName = firstDefined(
      record,
      ["first_name", "firstName"],
      ""
    );

    const lastName = firstDefined(
      record,
      ["last_name", "lastName"],
      ""
    );

    const combined = [
      firstName,
      lastName
    ].filter(Boolean).join(" ").trim();

    if (combined) {
      return combined;
    }

    const username = firstDefined(
      record,
      ["username"],
      ""
    );

    return username
      ? "@" + username
      : "Unknown User";
  }

  function normalizeStatus(value) {
    return normalizeString(value) || "unknown";
  }


  /* ========================================
     4. TOAST NOTIFICATIONS
  ======================================== */

  function toast(
    message,
    type = "success",
    duration = 4000
  ) {
    const element = $("toast");

    if (!element) return;

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }

    element.textContent = String(message);

    element.className =
      "toast " + type;

    element.hidden = false;

    state.toastTimer = setTimeout(() => {
      element.hidden = true;
      state.toastTimer = null;
    }, duration);
  }


  /* ========================================
     5. LOADING MANAGEMENT
  ======================================== */

  function beginLoading() {
    state.busyCount += 1;

    show("loadingOverlay");
  }

  function endLoading() {
    state.busyCount = Math.max(
      0,
      state.busyCount - 1
    );

    if (state.busyCount === 0) {
      hide("loadingOverlay");
    }
  }

  async function withLoading(callback) {
    beginLoading();

    try {
      return await callback();
    } finally {
      endLoading();
    }
  }


  /* ========================================
     6. TELEGRAM INTEGRATION
  ======================================== */

  function getTelegramApp() {
    return window.Telegram?.WebApp || null;
  }

  function setupTelegram() {
    const telegram = getTelegramApp();

    if (!telegram) {
      return;
    }

    try {
      telegram.ready();
      telegram.expand();

      if (
        typeof telegram.setHeaderColor ===
        "function"
      ) {
        telegram.setHeaderColor("#07875c");
      }

      if (
        typeof telegram.setBackgroundColor ===
        "function"
      ) {
        telegram.setBackgroundColor("#f4f7f6");
      }

    } catch (error) {
      console.warn(
        "Telegram UI setup:",
        getErrorMessage(error)
      );
    }
  }

  function getTelegramInitData() {
    const telegram = getTelegramApp();

    return telegram?.initData || "";
  }

  function getTelegramUser() {
    const telegram = getTelegramApp();

    return telegram?.initDataUnsafe?.user ||
      null;
  }

  function updateAdminIdentity() {
    const user = state.user || {};

    const telegramUser = getTelegramUser();

    const displayName =
      getUserName(user) !== "Unknown User"
        ? getUserName(user)
        : (
          telegramUser?.first_name ||
          "Administrator"
        );

    const telegramId =
      getTelegramId(user) ||
      telegramUser?.id ||
      "—";

    const initial =
      String(displayName)
        .trim()
        .charAt(0)
        .toUpperCase() || "A";

    setText("adminName", displayName);

    setText(
      "adminTelegramId",
      "Telegram ID: " + telegramId
    );

    setText("adminAvatar", initial);

    setText("headerAvatar", initial);
  }


  /* ========================================
     7. API CLIENT
  ======================================== */

  async function apiRequest(
    path,
    options = {}
  ) {
    const {
      method = "GET",
      body = undefined,
      authenticated = true
    } = options;

    if (authenticated && !state.token) {
      throw new Error(
        "সেশন নেই। আবার Telegram দিয়ে লগইন করুন।"
      );
    }

    const controller =
      new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT);

    const headers = {
      Accept: "application/json"
    };

    if (body !== undefined) {
      headers["Content-Type"] =
        "application/json";
    }

    if (authenticated) {
      headers.Authorization =
        "Bearer " + state.token;
    }

    try {
      const response = await fetch(path, {
        method,
        headers,
        body: body === undefined
          ? undefined
          : JSON.stringify(body),

        signal: controller.signal,

        credentials: "same-origin",

        cache: "no-store"
      });

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let payload = {};

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        payload = await response.json();
      } else {
        const text = await response.text();

        if (text) {
          payload = {
            message: text.slice(0, 300)
          };
        }
      }

      if (!response.ok) {
        const serverMessage =
          payload?.error?.message ||
          (
            typeof payload?.error ===
            "string"
              ? payload.error
              : null
          ) ||
          payload?.message;

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          if (authenticated) {
            handleUnauthorized(
              response.status
            );
          }
        }

        throw new Error(
          serverMessage ||
          `Request failed (${response.status})`
        );
      }

      return payload;

    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(
          "সার্ভার সাড়া দিতে দেরি করছে। আবার চেষ্টা করুন।"
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "সার্ভারের সাথে সংযোগ করা যাচ্ছে না।"
        );
      }

      throw error;

    } finally {
      clearTimeout(timeoutId);
    }
  }

  function handleUnauthorized(status) {
    state.token = null;
    state.authenticated = false;

    hide("adminApp");
    show("loginScreen");

    setText(
      "loginStatus",
      status === 403
        ? "এই Telegram Account-এর Admin অনুমতি নেই।"
        : "সেশন শেষ হয়েছে। আবার লগইন করুন।"
    );

    setServerStatus(false);
  }


  /* ========================================
     8. LOGIN / LOGOUT
  ======================================== */

  async function loginAdmin() {
    if (state.loginInProgress) {
      return;
    }

    const initData = getTelegramInitData();

    if (!initData) {
      setText(
        "loginStatus",
        "Telegram Mini App-এর ভেতর থেকে Admin Panel খুলুন। সাধারণ ব্রাউজারে Telegram পরিচয় যাচাই করা যাবে না।"
      );

      toast(
        "Telegram Mini App থেকে খুলুন।",
        "warning"
      );

      return;
    }

    state.loginInProgress = true;

    const loginButton =
      $("adminLoginButton");

    if (loginButton) {
      loginButton.disabled = true;
    }

    setText(
      "loginStatus",
      "Telegram পরিচয় যাচাই করা হচ্ছে..."
    );

    try {
      await withLoading(async () => {

        const result = await apiRequest(
          API.auth,
          {
            method: "POST",
            body: {
              initData
            },
            authenticated: false
          }
        );

        const token =
          result?.token ||
          result?.data?.token;

        if (
          !token ||
          typeof token !== "string"
        ) {
          throw new Error(
            "সার্ভার থেকে বৈধ Session Token পাওয়া যায়নি।"
          );
        }

        state.token = token;

        state.user =
          result?.user ||
          result?.data?.user ||
          getTelegramUser() ||
          {};

        /*
         * A valid Telegram session is not
         * automatically an admin session.
         *
         * The protected overview endpoint
         * must authorize the user.
         */

        const overview = await apiRequest(
          API.overview
        );

        state.overview = extractObject(
          overview,
          ["overview", "stats"]
        );

        state.authenticated = true;

        updateAdminIdentity();

        hide("loginScreen");
        show("adminApp");

        setServerStatus(true);

        renderDashboard();

        navigateTo("dashboard", false);

        toast(
          "Admin Login সফল হয়েছে।",
          "success"
        );
      });

    } catch (error) {
      state.token = null;
      state.authenticated = false;

      hide("adminApp");
      show("loginScreen");

      setText(
        "loginStatus",
        getErrorMessage(error)
      );

      toast(
        getErrorMessage(error),
        "error",
        6000
      );

    } finally {
      state.loginInProgress = false;

      if (loginButton) {
        loginButton.disabled = false;
      }
    }
  }

  function logoutAdmin() {
    state.token = null;
    state.user = null;
    state.authenticated = false;

    state.users = [];
    state.tasks = [];
    state.submissions = [];
    state.withdrawals = [];
    state.audit = [];

    state.settings = {};
    state.overview = {};

    hide("adminApp");
    show("loginScreen");

    closeSidebar();

    setText(
      "loginStatus",
      "আপনি লগআউট করেছেন। আবার Telegram দিয়ে লগইন করুন।"
    );

    setServerStatus(false);

    toast(
      "লগআউট হয়েছে।",
      "success"
    );
  }


  /* ========================================
     9. SERVER STATUS
  ======================================== */

  function setServerStatus(online) {
    const element = $("serverStatus");

    if (!element) return;

    element.classList.remove(
      "online",
      "offline"
    );

    if (online) {
      element.classList.add("online");
      element.textContent = "● Online";
    } else {
      element.classList.add("offline");
      element.textContent = "● Offline";
    }
  }


  /* ========================================
     10. SIDEBAR
  ======================================== */

  function openSidebar() {
    const sidebar = $("sidebar");

    if (sidebar) {
      sidebar.classList.add("open");
    }

    show("sidebarOverlay");

    const menuButton = $("menuButton");

    if (menuButton) {
      menuButton.setAttribute(
        "aria-expanded",
        "true"
      );
    }
  }

  function closeSidebar() {
    const sidebar = $("sidebar");

    if (sidebar) {
      sidebar.classList.remove("open");
    }

    hide("sidebarOverlay");

    const menuButton = $("menuButton");

    if (menuButton) {
      menuButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }


  /* ========================================
     11. PAGE NAVIGATION
  ======================================== */

  function navigateTo(
    page,
    fetchData = true
  ) {
    if (!state.authenticated) {
      return;
    }

    if (!PAGE_NAMES.includes(page)) {
      return;
    }

    state.activePage = page;

    $all(".admin-page").forEach(
      section => {
        const active =
          section.dataset.page === page;

        section.classList.toggle(
          "active",
          active
        );

        section.hidden = !active;
      }
    );

    $all(".nav-link").forEach(
      button => {
        const active =
          button.dataset.page === page;

        button.classList.toggle(
          "active",
          active
        );

        if (active) {
          button.setAttribute(
            "aria-current",
            "page"
          );
        } else {
          button.removeAttribute(
            "aria-current"
          );
        }
      }
    );

    setText(
      "currentPageTitle",
      PAGE_TITLES[page]
    );

    closeSidebar();

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });

    if (fetchData) {
      void loadPage(page);
    }
  }

  async function loadPage(page) {
    try {
      await withLoading(async () => {
        switch (page) {

          case "dashboard":
            await loadDashboard();
            break;

          case "users":
            await loadUsers();
            break;

          case "tasks":
            await loadTasks();
            break;

          case "withdrawals":
            await loadWithdrawals();
            break;

          case "settings":
            await loadSettings();
            break;

          case "audit":
            await loadAudit();
            break;

          default:
            break;
        }
      });

      setServerStatus(true);

    } catch (error) {
      toast(
        getErrorMessage(error),
        "error",
        6000
      );
    }
  }


  /* ========================================
     12. DASHBOARD
  ======================================== */

  async function loadDashboard() {
    const result = await apiRequest(
      API.overview
    );

    state.overview = extractObject(
      result,
      ["overview", "stats"]
    );

    renderDashboard();
  }

  function renderDashboard() {
    const data = state.overview || {};

    const totalUsers = firstDefined(
      data,
      [
        "totalUsers",
        "total_users",
        "users"
      ],
      0
    );

    const pendingWithdrawals =
      firstDefined(
        data,
        [
          "pendingWithdrawals",
          "pending_withdrawals"
        ],
        0
      );

    const pendingTasks = firstDefined(
      data,
      [
        "pendingTasks",
        "pending_tasks",
        "pendingSubmissions",
        "pending_submissions"
      ],
      0
    );

    const walletLiability = firstDefined(
      data,
      [
        "walletLiability",
        "wallet_liability",
        "totalWalletBalance",
        "total_wallet_balance"
      ],
      0
    );

    const pendingAmount = firstDefined(
      data,
      [
        "pendingWithdrawalAmount",
        "pending_withdrawal_amount"
      ],
      0
    );

    setText(
      "totalUsers",
      formatNumber(totalUsers)
    );

    setText(
      "pendingWithdrawals",
      formatNumber(pendingWithdrawals)
    );

    setText(
      "pendingTasks",
      formatNumber(pendingTasks)
    );

    setText(
      "walletLiability",
      formatMoney(walletLiability)
    );

    setText(
      "pendingWithdrawalAmount",
      formatMoney(pendingAmount)
    );
  }


  /* ========================================
     13. USER MANAGEMENT
  ======================================== */

  async function loadUsers() {
    const result = await apiRequest(
      API.users
    );

    state.users = extractArray(
      result,
      ["users", "items", "results"]
    );

    renderUsers();
  }

  function renderUsers() {
    const tbody = $("usersTableBody");

    if (!tbody) return;

    const search = normalizeString(
      $("userSearch")?.value
    );

    const filter =
      $("userStatusFilter")?.value ||
      "all";

    const filtered = state.users.filter(
      user => {
        const status = normalizeStatus(
          firstDefined(
            user,
            ["status"],
            user.is_blocked
              ? "blocked"
              : "active"
          )
        );

        const searchable = [
          getUserName(user),
          getTelegramId(user),
          user.username,
          user.id
        ].map(safeString)
          .join(" ")
          .toLowerCase();

        const searchMatches =
          !search ||
          searchable.includes(search);

        const statusMatches =
          filter === "all" ||
          status === filter;

        return (
          searchMatches &&
          statusMatches
        );
      }
    );

    setText(
      "usersCount",
      `${filtered.length} users`
    );

    clearElement(tbody);

    if (!filtered.length) {
      appendEmptyRow(
        tbody,
        5,
        "কোনো ইউজার পাওয়া যায়নি।"
      );

      return;
    }

    for (
      const user of filtered.slice(
        0,
        MAX_DISPLAY_ROWS
      )
    ) {
      const id = getRecordId(user);

      const status = normalizeStatus(
        firstDefined(
          user,
          ["status"],
          user.is_blocked
            ? "blocked"
            : "active"
        )
      );

      const row = createElement("tr");

      const nameCell = createCell(
        getUserName(user)
      );

      const username = safeString(
        user.username
      );

      if (username) {
        nameCell.appendChild(
          createElement(
            "div",
            "muted",
            "@" + username
          )
        );
      }

      row.appendChild(nameCell);

      row.appendChild(
        createCell(
          getTelegramId(user) || "—"
        )
      );

      const statusCell =
        createElement("td");

      statusCell.appendChild(
        makeStatusBadge(status)
      );

      row.appendChild(statusCell);

      row.appendChild(
        createCell(
          formatDate(
            firstDefined(
              user,
              [
                "created_at",
                "createdAt",
                "joined_at"
              ]
            )
          )
        )
      );

      const actionCell =
        createElement("td");

      const nextStatus =
        status === "blocked"
          ? "active"
          : "blocked";

      const button = makeActionButton(
        nextStatus === "blocked"
          ? "Block"
          : "Unblock",

        nextStatus === "blocked"
          ? "btn btn-danger btn-sm"
          : "btn btn-success btn-sm",

        () => confirmUserStatus(
          user,
          nextStatus
        )
      );

      if (
        id === null ||
        id === undefined
      ) {
        button.disabled = true;
      }

      actionCell.appendChild(button);

      row.appendChild(actionCell);

      tbody.appendChild(row);
    }
  }

  function confirmUserStatus(
    user,
    newStatus
  ) {
    const id = getRecordId(user);

    if (
      id === null ||
      id === undefined
    ) {
      toast(
        "User ID পাওয়া যায়নি।",
        "error"
      );

      return;
    }

    const isBlock =
      newStatus === "blocked";

    openConfirmation({
      title: isBlock
        ? "Block User"
        : "Unblock User",

      message:
        `${getUserName(user)}-এর অ্যাকাউন্ট ` +
        (
          isBlock
            ? "Block"
            : "Active"
        ) +
        " করতে চান?",

      confirmLabel: isBlock
        ? "Block"
        : "Unblock",

      onConfirm: async () => {
        await apiRequest(
          API.users +
          "/" +
          encodeURIComponent(id) +
          "/status",
          {
            method: "PATCH",
            body: {
              status: newStatus
            }
          }
        );

        toast(
          "User Status আপডেট হয়েছে।"
        );

        await loadUsers();
      }
    });
  }


  /* ========================================
     14. TASK MANAGEMENT
  ======================================== */

  async function loadTasks() {
    const result = await apiRequest(
      API.tasks
    );

    state.tasks = extractArray(
      result,
      ["tasks", "items", "results"]
    );

    /*
     * The earlier server.js exposes:
     *
     * GET  /api/admin/tasks
     * POST /api/admin/tasks
     *
     * It does not expose a documented
     * task-submission review endpoint.
     *
     * Do not invent one.
     */

    state.submissions = [];

    renderTasks();
    renderSubmissionsUnavailable();
  }

  function renderTasks() {
    const tbody =
      $("adminTasksTableBody");

    if (!tbody) return;

    clearElement(tbody);

    const tasks = state.tasks;

    const activeTasks = tasks.filter(
      task => {
        const status = normalizeStatus(
          task.status
        );

        return (
          status === "active" ||
          task.is_active === true
        );
      }
    );

    setText(
      "adminTotalTasks",
      formatNumber(tasks.length)
    );

    setText(
      "adminActiveTasks",
      formatNumber(activeTasks.length)
    );

    setText(
      "adminPendingSubmissions",
      "—"
    );

    setText(
      "taskListCount",
      formatNumber(tasks.length)
    );

    if (!tasks.length) {
      appendEmptyRow(
        tbody,
        4,
        "এখনো কোনো টাস্ক নেই।"
      );

      return;
    }

    for (
      const task of tasks.slice(
        0,
        MAX_DISPLAY_ROWS
      )
    ) {
      const row = createElement("tr");

      row.appendChild(
        createCell(
          getRecordId(task) ?? "—"
        )
      );

      row.appendChild(
        createCell(
          firstDefined(
            task,
            ["title", "name"],
            "Untitled Task"
          )
        )
      );

      row.appendChild(
        createCell(
          formatMoney(
            firstDefined(
              task,
              [
                "reward",
                "reward_amount",
                "rewardAmount"
              ],
              0
            )
          )
        )
      );

      const statusCell =
        createElement("td");

      const status = normalizeStatus(
        firstDefined(
          task,
          ["status"],
          task.is_active
            ? "active"
            : "inactive"
        )
      );

      statusCell.appendChild(
        makeStatusBadge(status)
      );

      row.appendChild(statusCell);

      tbody.appendChild(row);
    }
  }

  function renderSubmissionsUnavailable() {
    const tbody =
      $("taskSubmissionsTableBody");

    setText(
      "submissionCount",
      "—"
    );

    appendEmptyRow(
      tbody,
      5,
      "Task Submission Review API এখনো server.js-এ যুক্ত নেই। অনুমোদন/বাতিলের জন্য নতুন Backend Endpoint প্রয়োজন।"
    );
  }

  async function createTask(event) {
    event.preventDefault();

    const title =
      $("taskTitle")?.value.trim() || "";

    const description =
      $("taskDescription")?.value.trim() ||
      "";

    const reward = Number(
      $("taskReward")?.value
    );

    if (
      title.length < 3 ||
      title.length > 160
    ) {
      toast(
        "Task Title ৩–১৬০ অক্ষরের হতে হবে।",
        "warning"
      );

      return;
    }

    if (
      !Number.isFinite(reward) ||
      reward <= 0 ||
      reward > 1000
    ) {
      toast(
        "Reward ০-এর বেশি এবং সর্বোচ্চ ৳১০০০ হতে হবে।",
        "warning"
      );

      return;
    }

    const button =
      $("createTaskButton");

    if (button) {
      button.disabled = true;
    }

    try {
      await withLoading(async () => {

        await apiRequest(
          API.tasks,
          {
            method: "POST",
            body: {
              title,
              description,
              reward
            }
          }
        );

        $("createTaskForm")?.reset();

        toast(
          "নতুন Task তৈরি হয়েছে।"
        );

        await loadTasks();
      });

    } catch (error) {
      toast(
        getErrorMessage(error),
        "error",
        6000
      );

    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }


  /* ========================================
     15. WITHDRAWAL MANAGEMENT
  ======================================== */

  async function loadWithdrawals() {
    const result = await apiRequest(
      API.withdrawals
    );

    state.withdrawals = extractArray(
      result,
      [
        "withdrawals",
        "items",
        "results"
      ]
    );

    renderWithdrawals();
  }

  function renderWithdrawals() {
    const tbody =
      $("withdrawalsTableBody");

    if (!tbody) return;

    const search = normalizeString(
      $("withdrawalSearch")?.value
    );

    const filter =
      $("withdrawalStatusFilter")?.value ||
      "all";

    const filtered =
      state.withdrawals.filter(
        withdrawal => {
          const status = normalizeStatus(
            withdrawal.status
          );

          const searchable = [
            withdrawal.id,
            withdrawal.user_id,
            withdrawal.telegram_id,
            withdrawal.method,
            withdrawal.account_number
          ].map(safeString)
            .join(" ")
            .toLowerCase();

          return (
            (
              !search ||
              searchable.includes(search)
            ) &&
            (
              filter === "all" ||
              status === filter
            )
          );
        }
      );

    setText(
      "withdrawalsCount",
      `${filtered.length} withdrawals`
    );

    clearElement(tbody);

    if (!filtered.length) {
      appendEmptyRow(
        tbody,
        9,
        "কোনো Withdrawal পাওয়া যায়নি।"
      );

      return;
    }

    for (
      const withdrawal of filtered.slice(
        0,
        MAX_DISPLAY_ROWS
      )
    ) {
      const id = getRecordId(
        withdrawal
      );

      const status = normalizeStatus(
        withdrawal.status
      );

      const amount = Number(
        firstDefined(
          withdrawal,
          ["amount", "gross_amount"],
          0
        )
      );

      const fee = Number(
        firstDefined(
          withdrawal,
          ["fee", "fee_amount"],
          0
        )
      );

      const net = Number(
        firstDefined(
          withdrawal,
          [
            "net_amount",
            "netAmount",
            "payable_amount"
          ],
          amount - fee
        )
      );

      const row = createElement("tr");

      row.appendChild(
        createCell(id ?? "—")
      );

      row.appendChild(
        createCell(
          firstDefined(
            withdrawal,
            [
              "telegram_id",
              "user_id"
            ],
            "—"
          )
        )
      );

      row.appendChild(
        createCell(
          firstDefined(
            withdrawal,
            ["method", "payment_method"],
            "—"
          )
        )
      );

      row.appendChild(
        createCell(
          firstDefined(
            withdrawal,
            [
              "account_number",
              "account",
              "wallet_address",
              "destination"
            ],
            "—"
          )
        )
      );

      row.appendChild(
        createCell(
          formatMoney(amount)
        )
      );

      row.appendChild(
        createCell(
          formatMoney(fee)
        )
      );

      row.appendChild(
        createCell(
          formatMoney(net)
        )
      );

      const statusCell =
        createElement("td");

      statusCell.appendChild(
        makeStatusBadge(status)
      );

      row.appendChild(statusCell);

      const actionCell =
        createElement("td");

      if (
        status === "pending" &&
        id !== null &&
        id !== undefined
      ) {
        const actions =
          createElement(
            "div",
            "table-actions"
          );

        actions.appendChild(
          makeActionButton(
            "Paid",
            "btn btn-success btn-sm",
            () => confirmWithdrawal(
              withdrawal,
              "paid"
            )
          )
        );

        actions.appendChild(
          makeActionButton(
            "Reject",
            "btn btn-danger btn-sm",
            () => confirmWithdrawal(
              withdrawal,
              "rejected"
            )
          )
        );

        actionCell.appendChild(actions);

      } else {
        actionCell.textContent = "—";
      }

      row.appendChild(actionCell);

      tbody.appendChild(row);
    }
  }

  function confirmWithdrawal(
    withdrawal,
    decision
  ) {
    const id = getRecordId(
      withdrawal
    );

    if (
      id === null ||
      id === undefined
    ) {
      toast(
        "Withdrawal ID পাওয়া যায়নি।",
        "error"
      );

      return;
    }

    const isPaid =
      decision === "paid";

    openConfirmation({
      title: isPaid
        ? "Mark Withdrawal Paid"
        : "Reject Withdrawal",

      message: isPaid
        ? (
          `Withdrawal #${id}: ` +
          "আপনি কি নিশ্চিত যে প্রকৃত পেমেন্ট সম্পন্ন হয়েছে এবং ট্রানজ্যাকশন যাচাই করেছেন? এই বাটন টাকা পাঠাবে না।"
        )
        : (
          `Withdrawal #${id} বাতিল করতে চান?`
        ),

      confirmLabel: isPaid
        ? "Mark Paid"
        : "Reject",

      onConfirm: async () => {

        await apiRequest(
          API.withdrawals +
          "/" +
          encodeURIComponent(id) +
          "/decision",
          {
            method: "POST",
            body: {
              decision
            }
          }
        );

        toast(
          isPaid
            ? "Withdrawal Paid হিসেবে চিহ্নিত হয়েছে।"
            : "Withdrawal বাতিল হয়েছে।"
        );

        await loadWithdrawals();
      }
    });
  }


  /* ========================================
     16. SETTINGS MANAGEMENT
  ======================================== */

  const SETTINGS_FIELDS = [
    {
      id: "minWithdrawal",
      keys: [
        "minWithdrawal",
        "min_withdrawal"
      ]
    },
    {
      id: "withdrawalFeePercent",
      keys: [
        "withdrawalFeePercent",
        "withdrawal_fee_percent"
      ]
    },
    {
      id: "dailyAdLimit",
      keys: [
        "dailyAdLimit",
        "daily_ad_limit"
      ]
    },
    {
      id: "adCooldownSeconds",
      keys: [
        "adCooldownSeconds",
        "ad_cooldown_seconds"
      ]
    },
    {
      id: "referralBonus",
      keys: [
        "referralBonus",
        "referral_bonus"
      ]
    },
    {
      id: "referralCommissionPercent",
      keys: [
        "referralCommissionPercent",
        "referral_commission_percent"
      ]
    }
  ];

  async function loadSettings() {
    const result = await apiRequest(
      API.settings
    );

    state.settings = extractObject(
      result,
      ["settings"]
    );

    renderSettings();
  }

  function renderSettings() {
    for (const field of SETTINGS_FIELDS) {
      const value = firstDefined(
        state.settings,
        field.keys,
        ""
      );

      setValue(field.id, value);
    }
  }

  function getSettingsFormData() {
    const values = {};

    for (const field of SETTINGS_FIELDS) {
      const input = $(field.id);

      if (!input) {
        throw new Error(
          "Settings Input পাওয়া যায়নি: " +
          field.id
        );
      }

      if (input.value.trim() === "") {
        throw new Error(
          "সব Settings Field পূরণ করুন।"
        );
      }

      const value = Number(
        input.value
      );

      if (!Number.isFinite(value)) {
        throw new Error(
          "Settings-এ সঠিক সংখ্যা লিখুন।"
        );
      }

      values[field.id] = value;
    }

    return values;
  }

  async function saveSettings(event) {
    event.preventDefault();

    const form = $("settingsForm");

    if (
      form &&
      !form.reportValidity()
    ) {
      return;
    }

    let values;

    try {
      values = getSettingsFormData();
    } catch (error) {
      toast(
        getErrorMessage(error),
        "warning"
      );

      return;
    }

    /*
     * Preserve settings not displayed
     * in the form.
     */

    const payload = {
      ...state.settings,
      ...values
    };

    openConfirmation({
      title: "Save Settings",

      message:
        "আপনি কি Application Settings পরিবর্তন করতে চান?",

      confirmLabel: "Save",

      onConfirm: async () => {

        await apiRequest(
          API.settings,
          {
            method: "PUT",
            body: payload
          }
        );

        toast(
          "Settings সংরক্ষণ হয়েছে।"
        );

        await loadSettings();
      }
    });
  }


  /* ========================================
     17. AUDIT LOGS
  ======================================== */

  async function loadAudit() {
    const result = await apiRequest(
      API.audit
    );

    state.audit = extractArray(
      result,
      [
        "logs",
        "audit",
        "auditLogs",
        "items",
        "results"
      ]
    );

    renderAudit();
  }

  function renderAudit() {
    const tbody = $("auditTableBody");

    if (!tbody) return;

    const search = normalizeString(
      $("auditSearch")?.value
    );

    const filtered = state.audit.filter(
      log => {
        const searchable = [
          log.id,
          log.actor_id,
          log.actor_telegram_id,
          log.action,
          log.entity_type,
          log.entity_id
        ].map(safeString)
          .join(" ")
          .toLowerCase();

        return (
          !search ||
          searchable.includes(search)
        );
      }
    );

    setText(
      "auditCount",
      `${filtered.length} logs`
    );

    clearElement(tbody);

    if (!filtered.length) {
      appendEmptyRow(
        tbody,
        5,
        "কোনো Audit Log পাওয়া যায়নি।"
      );

      return;
    }

    for (
      const log of filtered.slice(
        0,
        MAX_DISPLAY_ROWS
      )
    ) {
      const row = createElement("tr");

      row.appendChild(
        createCell(
          firstDefined(
            log,
            ["id"],
            "—"
          )
        )
      );

      row.appendChild(
        createCell(
          firstDefined(
            log,
            [
              "actor_telegram_id",
              "actor_id",
              "admin_id"
            ],
            "—"
          )
        )
      );

      row.appendChild(
        createCell(
          firstDefined(
            log,
            ["action", "event"],
            "—"
          )
        )
      );

      let details = firstDefined(
        log,
        [
          "details",
          "metadata",
          "description"
        ],
        "—"
      );

      if (
        details &&
        typeof details === "object"
      ) {
        details = JSON.stringify(
          details
        );
      }

      row.appendChild(
        createCell(
          String(details).slice(
            0,
            300
          )
        )
      );

      row.appendChild(
        createCell(
          formatDate(
            firstDefined(
              log,
              [
                "created_at",
                "createdAt",
                "timestamp"
              ]
            )
          )
        )
      );

      tbody.appendChild(row);
    }
  }


  /* ========================================
     18. STATUS BADGE
  ======================================== */

  function makeStatusBadge(status) {
    const normalized =
      normalizeStatus(status);

    const badge = createElement(
      "span",
      "status-badge " + normalized,
      normalized.toUpperCase()
    );

    return badge;
  }


  /* ========================================
     19. ACTION BUTTON
  ======================================== */

  function makeActionButton(
    label,
    className,
    callback
  ) {
    const button = createElement(
      "button",
      className,
      label
    );

    button.type = "button";

    button.addEventListener(
      "click",
      callback
    );

    return button;
  }


  /* ========================================
     20. CONFIRMATION MODAL
  ======================================== */

  function openConfirmation({
    title,
    message,
    confirmLabel = "Confirm",
    onConfirm
  }) {
    const dialog =
      $("confirmDialog");

    if (!dialog) {
      toast(
        "Confirmation Dialog পাওয়া যায়নি।",
        "error"
      );

      return;
    }

    if (
      typeof onConfirm !== "function"
    ) {
      return;
    }

    state.pendingConfirmation =
      onConfirm;

    setText(
      "confirmTitle",
      title
    );

    setText(
      "confirmMessage",
      message
    );

    setText(
      "confirmActionButton",
      confirmLabel
    );

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function closeConfirmation() {
    const dialog =
      $("confirmDialog");

    state.pendingConfirmation = null;

    if (dialog?.open) {
      dialog.close();
    }
  }

  async function executeConfirmation() {
    const callback =
      state.pendingConfirmation;

    if (
      typeof callback !== "function"
    ) {
      return;
    }

    state.pendingConfirmation = null;

    const button =
      $("confirmActionButton");

    if (button) {
      button.disabled = true;
    }

    try {
      await withLoading(
        callback
      );

      closeConfirmation();

    } catch (error) {
      closeConfirmation();

      toast(
        getErrorMessage(error),
        "error",
        6000
      );

    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }


  /* ========================================
     21. SEARCH DEBOUNCE
  ======================================== */

  function debounceSearch(
    key,
    callback
  ) {
    if (state.searchTimers[key]) {
      clearTimeout(
        state.searchTimers[key]
      );
    }

    state.searchTimers[key] =
      setTimeout(() => {
        callback();
      }, SEARCH_DELAY);
  }


  /* ========================================
     22. REFRESH
  ======================================== */

  async function refreshCurrentPage() {
    if (!state.authenticated) {
      return;
    }

    await loadPage(
      state.activePage
    );
  }


  /* ========================================
     23. EVENT LISTENERS
  ======================================== */

  function bindEvents() {

    /* LOGIN */

    $("adminLoginButton")
      ?.addEventListener(
        "click",
        loginAdmin
      );


    /* LOGOUT */

    $("logoutButton")
      ?.addEventListener(
        "click",
        () => {
          openConfirmation({
            title: "Logout",

            message:
              "Admin Panel থেকে লগআউট করতে চান?",

            confirmLabel: "Logout",

            onConfirm: async () => {
              logoutAdmin();
            }
          });
        }
      );


    /* MOBILE SIDEBAR */

    $("menuButton")
      ?.addEventListener(
        "click",
        openSidebar
      );

    $("closeSidebarButton")
      ?.addEventListener(
        "click",
        closeSidebar
      );

    $("sidebarOverlay")
      ?.addEventListener(
        "click",
        closeSidebar
      );


    /* NAVIGATION */

    $all("[data-page]").forEach(
      element => {
        element.addEventListener(
          "click",
          () => {
            navigateTo(
              element.dataset.page
            );
          }
        );
      }
    );


    /* REFRESH BUTTONS */

    const refreshButtons = [
      "refreshAllButton",
      "headerRefreshButton",
      "dashboardRefreshButton",
      "usersRefreshButton",
      "tasksRefreshButton",
      "withdrawalsRefreshButton",
      "settingsRefreshButton",
      "auditRefreshButton"
    ];

    for (const id of refreshButtons) {
      $(id)?.addEventListener(
        "click",
        refreshCurrentPage
      );
    }


    /* USER SEARCH */

    $("userSearch")
      ?.addEventListener(
        "input",
        () => {
          debounceSearch(
            "users",
            renderUsers
          );
        }
      );

    $("userStatusFilter")
      ?.addEventListener(
        "change",
        renderUsers
      );


    /* TASK CREATE */

    $("createTaskForm")
      ?.addEventListener(
        "submit",
        createTask
      );


    /* WITHDRAWAL SEARCH */

    $("withdrawalSearch")
      ?.addEventListener(
        "input",
        () => {
          debounceSearch(
            "withdrawals",
            renderWithdrawals
          );
        }
      );

    $("withdrawalStatusFilter")
      ?.addEventListener(
        "change",
        renderWithdrawals
      );


    /* SETTINGS */

    $("settingsForm")
      ?.addEventListener(
        "submit",
        saveSettings
      );

    $("resetSettingsButton")
      ?.addEventListener(
        "click",
        () => {
          void loadPage("settings");
        }
      );


    /* AUDIT SEARCH */

    $("auditSearch")
      ?.addEventListener(
        "input",
        () => {
          debounceSearch(
            "audit",
            renderAudit
          );
        }
      );


    /* CONFIRMATION */

    $("confirmCancelButton")
      ?.addEventListener(
        "click",
        closeConfirmation
      );

    $("confirmActionButton")
      ?.addEventListener(
        "click",
        executeConfirmation
      );

    $("confirmDialog")
      ?.addEventListener(
        "cancel",
        () => {
          state.pendingConfirmation =
            null;
        }
      );


    /* ESCAPE KEY */

    document.addEventListener(
      "keydown",
      event => {
        if (event.key === "Escape") {
          closeSidebar();
        }
      }
    );


    /* WINDOW RESIZE */

    window.addEventListener(
      "resize",
      () => {
        if (
          window.innerWidth > 991
        ) {
          closeSidebar();
        }
      }
    );
  }


  /* ========================================
     24. INITIALIZATION
  ======================================== */

  function initialize() {
    setupTelegram();

    bindEvents();

    hide("adminApp");

    show("loginScreen");

    hide("loadingOverlay");

    hide("toast");

    setServerStatus(false);

    const initData =
      getTelegramInitData();

    if (initData) {
      setText(
        "loginStatus",
        "Telegram Mini App শনাক্ত হয়েছে। লগইন করতে বাটনে চাপুন।"
      );

      /*
       * Automatically verify when
       * Telegram initData is available.
       */

      void loginAdmin();

    } else {
      setText(
        "loginStatus",
        "Telegram Mini App-এর ভেতর থেকে Admin Panel খুলুন।"
      );
    }
  }


  /* ========================================
     25. START APPLICATION
  ======================================== */

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );

  } else {
    initialize();
  }

})();
