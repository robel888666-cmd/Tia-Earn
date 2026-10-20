
/*
 * TIA EARN - TELEGRAM MINI APP
 * File: public/app.js
 * Version: 1.0
 *
 * Frontend only.
 * All financial operations must be verified
 * by the backend.
 */

"use strict";

(() => {
  const tg = window.Telegram?.WebApp || null;

  const state = {
    token: null,
    user: null,
    settings: {},
    balance: 0,
    page: "home",
    taskFilter: "available",
    leaderboardType: "earnings",
    loading: false,
    adBusy: false,
    cooldownUntil: 0
  };

  const API = "/api";

  const $ = (id) => document.getElementById(id);

  const all = (selector) =>
    Array.from(document.querySelectorAll(selector));

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = String(value);
  }

  function money(value) {
    const number = Number(value);
    return "৳" + (
      Number.isFinite(number) ? number : 0
    ).toFixed(2);
  }

  function safeText(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  function toast(message) {
    const element = $("toast");
    if (!element) return;

    element.textContent = message;
    element.hidden = false;

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.hidden = true;
    }, 3500);
  }

  function loading(show) {
    state.loading = Boolean(show);

    const element = $("loadingOverlay");
    if (element) element.hidden = !show;
  }

  async function request(
    path,
    options = {}
  ) {
    const headers = {
      Accept: "application/json",
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    };

    if (state.token) {
      headers.Authorization =
        "Bearer " + state.token;
    }

    const response = await fetch(API + path, {
      ...options,
      headers,
      credentials: "same-origin"
    });

    const data = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "সার্ভারে সমস্যা হয়েছে।"
      );
    }

    return data;
  }

  function notifyError(error) {
    console.error(error);
    toast(error.message || "একটি সমস্যা হয়েছে।");
  }

  /*
   * TELEGRAM AUTHENTICATION
   */

  async function login() {
    if (!tg?.initData) {
      setText(
        "accountStatus",
        "Telegram থেকে অ্যাপ খুলুন"
      );

      toast(
        "Telegram Mini App-এর ভেতর থেকে খুলুন।"
      );

      return false;
    }

    try {
      loading(true);

      const result = await request("/auth/telegram", {
        method: "POST",
        body: JSON.stringify({
          initData: tg.initData
        })
      });

      if (!result.token) {
        throw new Error(
          "সার্ভার লগইন টোকেন দেয়নি।"
        );
      }

      state.token = result.token;
      state.user = result.user || null;

      renderUser();

      return true;
    } catch (error) {
      notifyError(error);
      return false;
    } finally {
      loading(false);
    }
  }

  function renderUser() {
    const user = state.user || {};

    const name =
      user.first_name ||
      user.firstName ||
      user.name ||
      "ব্যবহারকারী";

    const initial =
      String(name).charAt(0).toUpperCase();

    setText("userName", name);
    setText("profileName", name);
    setText("avatarInitial", initial);
    setText("profileAvatar", initial);

    setText(
      "profileUsername",
      user.username
        ? "@" + user.username
        : "Telegram User"
    );

    setText(
      "profileTelegramId",
      user.telegram_id ||
      user.telegramId ||
      "—"
    );

    setText(
      "accountStatus",
      user.status || "Active"
    );

    setText(
      "joinedDate",
      user.created_at
        ? new Date(
            user.created_at
          ).toLocaleDateString("bn-BD")
        : "—"
    );
  }

  /*
   * PAGE NAVIGATION
   */

  const pages = new Set([
    "home",
    "ads",
    "tasks",
    "referral",
    "spin",
    "lottery",
    "wallet",
    "leaderboard",
    "profile"
  ]);

  function navigate(page) {
    if (!pages.has(page)) return;

    state.page = page;

    all(".page").forEach((element) => {
      const active =
        element.dataset.page === page;

      element.hidden = !active;
      element.classList.toggle(
        "active",
        active
      );
    });

    all(".nav-item").forEach((button) => {
      const active =
        button.dataset.go === page;

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
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    if (!state.token) return;

    const loaders = {
      home: loadDashboard,
      ads: loadAds,
      tasks: loadTasks,
      referral: loadReferrals,
      wallet: loadWallet,
      leaderboard: loadLeaderboard,
      spin: loadSpin,
      lottery: loadLottery
    };

    if (loaders[page]) {
      loaders[page]().catch(notifyError);
    }
  }

  function setupNavigation() {
    all("[data-go]").forEach((button) => {
      button.addEventListener("click", () => {
        navigate(button.dataset.go);
      });
    });

    $("profileButton")?.addEventListener(
      "click",
      () => navigate("profile")
    );

    $("notificationButton")?.addEventListener(
      "click",
      () => toast(
        "নোটিফিকেশন সিস্টেম প্রস্তুত করা হচ্ছে।"
      )
    );
  }

  /*
   * DASHBOARD
   */

  async function loadDashboard() {
    const data = await request("/dashboard");

    state.balance = Number(
      data.balance || 0
    );

    setText(
      "balanceAmount",
      money(state.balance)
    );

    setText(
      "todayEarnings",
      money(data.todayEarnings)
    );

    setText(
      "totalEarnings",
      money(data.totalEarnings)
    );

    setText(
      "adsToday",
      data.adsToday || 0
    );

    setText(
      "referralCount",
      data.referralCount || 0
    );

    setText(
      "completedTasks",
      data.completedTasks || 0
    );

    setText(
      "myRank",
      data.rank || "—"
    );
  }

  /*
   * SETTINGS
   */

  async function loadSettings() {
    const data = await request("/settings");

    state.settings = data.settings || data;

    const settings = state.settings;

    const channel = $("officialChannelLink");
    const channelNote =
      $("channelNotConfigured");

    if (
      channel &&
      /^https:\/\/t\.me\/[A-Za-z0-9_+/]+/.test(
        settings.officialChannel || ""
      )
    ) {
      channel.href = settings.officialChannel;
      channel.hidden = false;

      if (channelNote) {
        channelNote.hidden = true;
      }
    }

    const support = $("supportLink");
    const supportNote =
      $("supportNotConfigured");

    if (
      support &&
      /^https:\/\/t\.me\/[A-Za-z0-9_+/]+/.test(
        settings.supportLink || ""
      )
    ) {
      support.href = settings.supportLink;
      support.hidden = false;

      if (supportNote) {
        supportNote.hidden = true;
      }
    }

    setText(
      "minWithdrawal",
      money(settings.minWithdrawal)
    );
  }

  /*
   * ADVERTISEMENT SYSTEM
   *
   * Never credit rewards on the client.
   * Only the backend may credit rewards
   * after trusted network verification.
   */

  function renderAdNetworks(networks) {
    const container = $("adNetworkList");
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(networks)) return;

    for (const network of networks) {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const heading = document.createElement(
        "h3"
      );

      heading.textContent =
        network.name || "Advertisement";

      const description =
        document.createElement("p");

      description.textContent =
        network.description ||
        "বিজ্ঞাপন দেখে রিওয়ার্ড পান।";

      const button = document.createElement(
        "button"
      );

      button.type = "button";
      button.className = "button full-width";

      const enabled =
        network.enabled === true &&
        network.verificationSupported === true;

      button.disabled = !enabled;

      button.textContent = enabled
        ? "বিজ্ঞাপন দেখুন"
        : "এখন উপলব্ধ নয়";

      button.addEventListener("click", () => {
        startAd(network.id);
      });

      card.append(
        heading,
        description,
        button
      );

      container.appendChild(card);
    }
  }

  async function loadAds() {
    const data = await request("/ads/status");

    setText(
      "adWatchedCount",
      data.watchedToday || 0
    );

    setText(
      "adDailyLimit",
      data.dailyLimit ?? "—"
    );

    state.cooldownUntil =
      Number(data.cooldownUntil || 0);

    renderCooldown();

    if (Array.isArray(data.networks)) {
      renderAdNetworks(data.networks);
    }
  }

  function renderCooldown() {
    const remaining = Math.max(
      0,
      Math.ceil(
        (state.cooldownUntil - Date.now()) /
        1000
      )
    );

    setText(
      "adCooldownText",
      remaining > 0
        ? remaining + " সেকেন্ড"
        : "প্রস্তুত"
    );
  }

  async function startAd(networkId) {
    if (state.adBusy) return;

    if (Date.now() < state.cooldownUntil) {
      toast("বিজ্ঞাপনের বিরতি শেষ হয়নি।");
      return;
    }

    try {
      state.adBusy = true;

      /*
       * Backend must create a one-time
       * ad session and return an approved
       * network SDK configuration.
       */

      const result = await request(
        "/ads/session",
        {
          method: "POST",
          body: JSON.stringify({
            networkId
          })
        }
      );

      /*
       * No simulated completion.
       * No automatic credit.
       * No forced ad clicking.
       */

      if (
        result.enabled !== true ||
        !result.sessionId
      ) {
        throw new Error(
          "এই বিজ্ঞাপন এখন চালু নেই।"
        );
      }

      toast(
        "অনুমোদিত বিজ্ঞাপন SDK সংযোগ প্রয়োজন।"
      );

      /*
       * Actual SDK integration must be
       * implemented using the provider's
       * official documented methods.
       *
       * Reward verification belongs to
       * the backend webhook/callback.
       */

    } catch (error) {
      notifyError(error);
    } finally {
      state.adBusy = false;
    }
  }

  /*
   * TASK SYSTEM
   */

  async function loadTasks() {
    const data = await request(
      "/tasks?filter=" +
      encodeURIComponent(state.taskFilter)
    );

    const container = $("taskList");
    if (!container) return;

    container.replaceChildren();

    const tasks = data.tasks || [];

    if (!tasks.length) {
      container.textContent =
        "এই বিভাগে কোনো টাস্ক নেই।";
      return;
    }

    for (const task of tasks) {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const title = document.createElement(
        "h3"
      );

      title.textContent = task.title;

      const description =
        document.createElement("p");

      description.textContent =
        task.description || "";

      const reward = document.createElement(
        "strong"
      );

      reward.textContent =
        money(task.reward);

      card.append(
        title,
        description,
        reward
      );

      if (state.taskFilter === "available") {
        const button =
          document.createElement("button");

        button.type = "button";
        button.className = "button full-width";
        button.textContent = "টাস্ক শুরু করুন";

        button.addEventListener(
          "click",
          () => submitTask(task.id)
        );

        card.appendChild(button);
      }

      container.appendChild(card);
    }
  }

  async function submitTask(taskId) {
    try {
      const result = await request(
        "/tasks/" +
        encodeURIComponent(taskId) +
        "/submit",
        {
          method: "POST",
          body: JSON.stringify({})
        }
      );

      toast(
        result.message ||
        "টাস্ক যাচাইয়ের জন্য জমা হয়েছে।"
      );

      await loadTasks();
    } catch (error) {
      notifyError(error);
    }
  }

  function setupTaskFilters() {
    all("[data-task-filter]").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            state.taskFilter =
              button.dataset.taskFilter;

            all("[data-task-filter]").forEach(
              (item) => {
                item.classList.toggle(
                  "active",
                  item === button
                );
              }
            );

            if (state.token) {
              loadTasks().catch(notifyError);
            }
          }
        );
      }
    );
  }

  /*
   * REFERRAL SYSTEM
   */

  async function loadReferrals() {
    const data = await request("/referrals");

    setText(
      "referralEarnings",
      money(data.earnings)
    );

    setText(
      "verifiedReferrals",
      data.verifiedCount || 0
    );

    if ($("referralLink")) {
      $("referralLink").value =
        data.referralLink || "";
    }

    if (data.rules) {
      setText("referralRules", data.rules);
    }

    const container = $("referralList");
    if (!container) return;

    container.replaceChildren();

    const referrals = data.referrals || [];

    if (!referrals.length) {
      container.textContent =
        "এখনো কোনো রেফার নেই।";
      return;
    }

    referrals.forEach((referral) => {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const name = document.createElement(
        "strong"
      );

      name.textContent =
        referral.name || "Telegram User";

      const status = document.createElement(
        "p"
      );

      status.textContent =
        referral.status || "Pending";

      card.append(name, status);
      container.appendChild(card);
    });
  }

  async function copyReferral() {
    const link = $("referralLink")?.value;

    if (!link) {
      toast("রেফার লিংক পাওয়া যায়নি।");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast("রেফার লিংক কপি হয়েছে।");
    } catch {
      toast("লিংক কপি করা যায়নি।");
    }
  }

  function shareReferral() {
    const link = $("referralLink")?.value;

    if (!link) {
      toast("রেফার লিংক পাওয়া যায়নি।");
      return;
    }

    const shareUrl =
      "https://t.me/share/url?url=" +
      encodeURIComponent(link) +
      "&text=" +
      encodeURIComponent(
        "Tia Earn-এ যোগ দিন!"
      );

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(
        shareUrl,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }

  /*
   * WALLET
   */

  async function loadWallet() {
    const data = await request("/wallet");

    state.balance = Number(
      data.balance || 0
    );

    setText(
      "walletBalance",
      money(state.balance)
    );

    setText(
      "minWithdrawal",
      money(
        data.minWithdrawal ??
        state.settings.minWithdrawal
      )
    );

    renderPayments(data.payments || []);
    renderTransactions(
      data.transactions || []
    );

    updateWithdrawalPreview();
  }

  function renderPayments(payments) {
    const container = $("paymentHistory");
    if (!container) return;

    container.replaceChildren();

    if (!payments.length) {
      container.textContent =
        "কোনো পেমেন্ট হিস্টরি নেই।";
      return;
    }

    payments.forEach((payment) => {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const title = document.createElement(
        "strong"
      );

      title.textContent =
        money(payment.amount);

      const detail = document.createElement(
        "p"
      );

      detail.textContent =
        (payment.method || "Payment") +
        " — " +
        (payment.status || "Pending");

      card.append(title, detail);
      container.appendChild(card);
    });
  }

  function renderTransactions(transactions) {
    const container =
      $("walletTransactions");

    if (!container) return;

    container.replaceChildren();

    if (!transactions.length) {
      container.textContent =
        "কোনো লেনদেন নেই।";
      return;
    }

    transactions.forEach((transaction) => {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const title = document.createElement(
        "strong"
      );

      title.textContent =
        transaction.type || "Transaction";

      const amount = document.createElement(
        "p"
      );

      amount.textContent =
        money(transaction.amount);

      card.append(title, amount);
      container.appendChild(card);
    });
  }

  function updateWithdrawalPreview() {
    const amount = Math.max(
      0,
      Number($("withdrawAmount")?.value || 0)
    );

    const feePercent = Number(
      state.settings.withdrawalFeePercent || 0
    );

    const fee = amount * feePercent / 100;

    setText(
      "withdrawFeePreview",
      money(fee)
    );

    setText(
      "withdrawNetPreview",
      money(Math.max(0, amount - fee))
    );
  }

  async function submitWithdrawal(event) {
    event.preventDefault();

    const method =
      $("withdrawMethod")?.value;

    const account =
      $("withdrawAccount")?.value.trim();

    const amount = Number(
      $("withdrawAmount")?.value
    );

    if (!["bkash", "binance"].includes(method)) {
      toast("পেমেন্ট পদ্ধতি নির্বাচন করুন।");
      return;
    }

    if (!account || !Number.isFinite(amount)) {
      toast("সঠিক তথ্য লিখুন।");
      return;
    }

    if (amount <= 0) {
      toast("সঠিক পরিমাণ লিখুন।");
      return;
    }

    const minimum = Number(
      state.settings.minWithdrawal || 0
    );

    if (amount < minimum) {
      toast(
        "সর্বনিম্ন উত্তোলন " +
        money(minimum)
      );
      return;
    }

    if (amount > state.balance) {
      toast("পর্যাপ্ত ব্যালেন্স নেই।");
      return;
    }

    try {
      loading(true);

      const result = await request(
        "/withdrawals",
        {
          method: "POST",
          body: JSON.stringify({
            method,
            account,
            amount
          })
        }
      );

      toast(
        result.message ||
        "উত্তোলনের আবেদন জমা হয়েছে।"
      );

      $("withdrawForm")?.reset();

      await loadWallet();
      await loadDashboard();
    } catch (error) {
      notifyError(error);
    } finally {
      loading(false);
    }
  }

  /*
   * LEADERBOARD
   */

  async function loadLeaderboard() {
    const data = await request(
      "/leaderboard?type=" +
      encodeURIComponent(
        state.leaderboardType
      )
    );

    const container =
      $("leaderboardList");

    if (!container) return;

    container.replaceChildren();

    const users = data.users || [];

    if (!users.length) {
      container.textContent =
        "লিডারবোর্ডে তথ্য নেই।";
      return;
    }

    users.forEach((user, index) => {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const name = document.createElement(
        "strong"
      );

      name.textContent =
        (index + 1) +
        ". " +
        (user.name || "User");

      const score = document.createElement(
        "p"
      );

      score.textContent =
        state.leaderboardType === "earnings"
          ? money(user.earnings)
          : (user.referrals || 0) +
            " রেফার";

      card.append(name, score);
      container.appendChild(card);
    });
  }

  function setupLeaderboardFilters() {
    all("[data-leaderboard-type]").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            state.leaderboardType =
              button.dataset.leaderboardType;

            all("[data-leaderboard-type]").forEach(
              (item) => {
                item.classList.toggle(
                  "active",
                  item === button
                );
              }
            );

            if (state.token) {
              loadLeaderboard().catch(
                notifyError
              );
            }
          }
        );
      }
    );
  }

  /*
   * SPIN
   */

  async function loadSpin() {
    const data = await request("/spin/status");

    setText(
      "spinEntryFee",
      money(data.entryFee)
    );

    setText(
      "spinRemaining",
      data.remaining ?? 0
    );

    const button = $("spinButton");

    if (button) {
      /*
       * Paid spin stays disabled until
       * legal and backend approval.
       */
      button.disabled = true;
      button.textContent =
        "স্পিন বর্তমানে বন্ধ আছে";
    }
  }

  /*
   * LOTTERY
   */

  async function loadLottery() {
    const data = await request("/lottery");

    const container = $("lotteryList");

    if (!container) return;

    container.replaceChildren();

    const draws = data.draws || [];

    if (!draws.length) {
      container.textContent =
        "বর্তমানে কোনো ড্র চালু নেই।";
      return;
    }

    draws.forEach((draw) => {
      const card = document.createElement(
        "article"
      );

      card.className = "info-card";

      const title = document.createElement(
        "h3"
      );

      title.textContent =
        draw.title || "Lottery";

      const detail = document.createElement(
        "p"
      );

      detail.textContent =
        "এন্ট্রি ফি: " +
        money(draw.entryFee);

      const status = document.createElement(
        "p"
      );

      status.textContent =
        "অংশগ্রহণ বর্তমানে বন্ধ আছে।";

      card.append(title, detail, status);
      container.appendChild(card);
    });
  }

  /*
   * EVENT BINDINGS
   */

  function setupEvents() {
    setupNavigation();
    setupTaskFilters();
    setupLeaderboardFilters();

    $("copyReferralButton")?.addEventListener(
      "click",
      copyReferral
    );

    $("shareReferralButton")?.addEventListener(
      "click",
      shareReferral
    );

    $("withdrawAmount")?.addEventListener(
      "input",
      updateWithdrawalPreview
    );

    $("withdrawForm")?.addEventListener(
      "submit",
      submitWithdrawal
    );

    $("dialogCancel")?.addEventListener(
      "click",
      () => $("appDialog")?.close()
    );

    $("dialogConfirm")?.addEventListener(
      "click",
      () => $("appDialog")?.close()
    );

    setInterval(renderCooldown, 1000);
  }

  /*
   * APPLICATION START
   */

  async function init() {
    try {
      if (tg) {
        tg.ready();
        tg.expand();

        if (tg.setHeaderColor) {
          tg.setHeaderColor("#0b8f61");
        }
      }

      setupEvents();
      navigate("home");

      const authenticated = await login();

      if (!authenticated) return;

      await Promise.allSettled([
        loadSettings(),
        loadDashboard()
      ]);

      renderUser();
    } catch (error) {
      notifyError(error);
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
