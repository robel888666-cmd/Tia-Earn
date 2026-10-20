
"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

const publicDir = path.join(__dirname, "public");

app.use(
  express.static(publicDir, {
    index: "index.html",
    extensions: false
  })
);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: true }
          : undefined,
      max: 4,
      connectionTimeoutMillis: 10000
    })
  : null;

const botToken = process.env.BOT_TOKEN || "";
const sessionSecret =
  process.env.SESSION_SECRET || "";

const adminIds = new Set(
  (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

function query(sql, params = []) {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured"
    );
  }

  return pool.query(sql, params);
}

function fail(res, status, message) {
  return res.status(status).json({ message });
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next))
      .catch(next);
  };
}

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
}

function sign(value) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(value)
    .digest("base64url");
}

function issueToken(id) {
  const payload = Buffer.from(
    JSON.stringify({
      id: String(id),
      exp: Date.now() + 7 * 86400000
    })
  ).toString("base64url");

  return payload + "." + sign(payload);
}

function readToken(token) {
  if (
    !sessionSecret ||
    !token ||
    !token.includes(".")
  ) {
    return null;
  }

  const [payload, signature] =
    token.split(".");

  if (!safeEqual(signature, sign(payload))) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(
        payload,
        "base64url"
      ).toString()
    );

    if (
      data.exp > Date.now() &&
      /^\d+$/.test(data.id)
    ) {
      return data.id;
    }
  } catch {
    return null;
  }

  return null;
}

async function auth(req, res, next) {
  const token = (
    req.headers.authorization || ""
  ).match(/^Bearer (.+)$/i)?.[1];

  const id = readToken(token);

  if (!id) {
    return fail(
      res,
      401,
      "Telegram থেকে আবার লগইন করুন।"
    );
  }

  try {
    const result = await query(
      `SELECT id, telegram_id, first_name,
              username, status, created_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    const user = result.rows[0];

    if (!user || user.status !== "active") {
      return fail(
        res,
        403,
        "অ্যাকাউন্ট ব্যবহার করা যাচ্ছে না।"
      );
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function admin(req, res, next) {
  if (
    !adminIds.has(
      String(req.user.telegram_id)
    )
  ) {
    return fail(
      res,
      403,
      "Admin access denied"
    );
  }

  next();
}

function verifyTelegram(initData) {
  if (
    !botToken ||
    typeof initData !== "string" ||
    initData.length > 8192
  ) {
    return null;
  }

  const params = new URLSearchParams(
    initData
  );

  const hash = params.get("hash");
  const authDate = Number(
    params.get("auth_date")
  );

  if (
    !hash ||
    !/^[a-f0-9]{64}$/i.test(hash) ||
    !authDate ||
    Math.abs(
      Date.now() / 1000 - authDate
    ) > 86400
  ) {
    return null;
  }

  const checkString = [
    ...params.entries()
  ]
    .filter(
      ([key]) =>
        key !== "hash" &&
        key !== "signature"
    )
    .sort(
      ([a], [b]) => a.localeCompare(b)
    )
    .map(
      ([key, value]) =>
        `${key}=${value}`
    )
    .join("\n");

  const secret = crypto
    .createHmac(
      "sha256",
      "WebAppData"
    )
    .update(botToken)
    .digest();

  const expected = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  if (
    !safeEqual(
      hash.toLowerCase(),
      expected
    )
  ) {
    return null;
  }

  try {
    const user = JSON.parse(
      params.get("user") || "{}"
    );

    if (
      Number.isSafeInteger(user.id) &&
      user.id > 0
    ) {
      return user;
    }
  } catch {
    return null;
  }

  return null;
}

async function getSettings() {
  const result = await query(
    "SELECT key, value FROM settings"
  );

  return Object.fromEntries(
    result.rows.map(
      (row) => [row.key, row.value]
    )
  );
}

function number(value) {
  return Number(value || 0);
}

function money(value) {
  return Math.round(
    (number(value) + Number.EPSILON) * 100
  ) / 100;
}

/* TELEGRAM LOGIN */

app.post(
  "/api/auth/telegram",
  asyncRoute(async (req, res) => {
    if (!sessionSecret || !botToken) {
      return fail(
        res,
        503,
        "Server configuration incomplete"
      );
    }

    const telegramUser = verifyTelegram(
      req.body?.initData
    );

    if (!telegramUser) {
      return fail(
        res,
        401,
        "Telegram authentication failed"
      );
    }

    if (!pool) {
      return fail(
        res,
        503,
        "Database is not configured"
      );
    }

    const startParam =
      new URLSearchParams(
        req.body.initData
      ).get("start_param") || "";

    const referralId =
      /^ref_(\d+)$/.exec(
        startParam
      )?.[1] || null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const found = await client.query(
        `SELECT id FROM users
         WHERE telegram_id = $1`,
        [String(telegramUser.id)]
      );

      let userId;

      if (found.rows.length) {
        userId = found.rows[0].id;

        await client.query(
          `UPDATE users
           SET first_name = $2,
               username = $3
           WHERE id = $1`,
          [
            userId,
            String(
              telegramUser.first_name || ""
            ).slice(0, 100),
            String(
              telegramUser.username || ""
            ).slice(0, 100)
          ]
        );
      } else {
        const referrer = referralId
          ? await client.query(
              `SELECT id FROM users
               WHERE telegram_id = $1`,
              [referralId]
            )
          : { rows: [] };

        const inserted =
          await client.query(
            `INSERT INTO users
             (
               telegram_id,
               first_name,
               username,
               referrer_id
             )
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (telegram_id)
             DO UPDATE SET
               first_name =
                 EXCLUDED.first_name,
               username =
                 EXCLUDED.username
             RETURNING id`,
            [
              String(telegramUser.id),
              String(
                telegramUser.first_name || ""
              ).slice(0, 100),
              String(
                telegramUser.username || ""
              ).slice(0, 100),
              referrer.rows[0]?.id || null
            ]
          );

        userId = inserted.rows[0].id;
      }

      await client.query(
        `INSERT INTO wallets (user_id)
         VALUES ($1)
         ON CONFLICT (user_id)
         DO NOTHING`,
        [userId]
      );

      const result = await client.query(
        `SELECT id, telegram_id,
                first_name, username,
                status, created_at
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const user = result.rows[0];

      if (user.status !== "active") {
        await client.query("ROLLBACK");

        return fail(
          res,
          403,
          "Account blocked"
        );
      }

      await client.query("COMMIT");

      return res.json({
        token: issueToken(userId),
        user
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/* HEALTH CHECK */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "tia-earn"
  });
});

/* SETTINGS */

app.get(
  "/api/settings",
  asyncRoute(async (req, res) => {
    res.json({
      settings: await getSettings()
    });
  })
);

/* DASHBOARD */

app.get(
  "/api/dashboard",
  auth,
  asyncRoute(async (req, res) => {
    const id = req.user.id;

    const [
      wallet,
      earnings,
      ads,
      referrals,
      tasks,
      rank
    ] = await Promise.all([
      query(
        `SELECT balance FROM wallets
         WHERE user_id = $1`,
        [id]
      ),

      query(
        `SELECT
           COALESCE(
             SUM(
               CASE
                 WHEN amount > 0
                 THEN amount
                 ELSE 0
               END
             ), 0
           ) AS total,
           COALESCE(
             SUM(
               CASE
                 WHEN amount > 0
                  AND created_at >= CURRENT_DATE
                 THEN amount
                 ELSE 0
               END
             ), 0
           ) AS today
         FROM ledger
         WHERE user_id = $1`,
        [id]
      ),

      query(
        `SELECT COUNT(*)::int AS count
         FROM ad_sessions
         WHERE user_id = $1
           AND status = 'verified'
           AND created_at >= CURRENT_DATE`,
        [id]
      ),

      query(
        `SELECT COUNT(*)::int AS count
         FROM users
         WHERE referrer_id = $1`,
        [id]
      ),

      query(
        `SELECT COUNT(*)::int AS count
         FROM task_submissions
         WHERE user_id = $1
           AND status = 'approved'`,
        [id]
      ),

      query(
        `SELECT COUNT(*)::int + 1 AS rank
         FROM wallets
         WHERE balance >
           (
             SELECT COALESCE(balance, 0)
             FROM wallets
             WHERE user_id = $1
           )`,
        [id]
      )
    ]);

    res.json({
      balance: number(
        wallet.rows[0]?.balance
      ),
      todayEarnings: number(
        earnings.rows[0].today
      ),
      totalEarnings: number(
        earnings.rows[0].total
      ),
      adsToday: ads.rows[0].count,
      referralCount:
        referrals.rows[0].count,
      completedTasks:
        tasks.rows[0].count,
      rank: rank.rows[0].rank
    });
  })
);

/* ADVERTISEMENTS */

app.get(
  "/api/ads/status",
  auth,
  asyncRoute(async (req, res) => {
    const settings = await getSettings();

    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM ad_sessions
       WHERE user_id = $1
         AND status = 'verified'
         AND created_at >= CURRENT_DATE`,
      [req.user.id]
    );

    const networks = [
      "monetag",
      "adsgram",
      "gigapub"
    ].map((id) => ({
      id,
      name:
        id === "gigapub"
          ? "GigaPub"
          : id === "adsgram"
            ? "Adsgram"
            : "Monetag",
      enabled: false,
      verificationSupported: false,
      description:
        "নিরাপদ বিজ্ঞাপন যাচাইকরণ এখনো চালু হয়নি।"
    }));

    res.json({
      watchedToday:
        result.rows[0].count,
      dailyLimit: number(
        settings.dailyAdLimit
      ),
      cooldownUntil: 0,
      networks
    });
  })
);

app.post(
  "/api/ads/session",
  auth,
  (req, res) => {
    fail(
      res,
      503,
      "Verified ad network is not configured"
    );
  }
);

/* TASKS */

app.get(
  "/api/tasks",
  auth,
  asyncRoute(async (req, res) => {
    const filter = String(
      req.query.filter || "available"
    );

    if (
      ![
        "available",
        "pending",
        "completed"
      ].includes(filter)
    ) {
      return fail(
        res,
        400,
        "Invalid filter"
      );
    }

    let sql;
    let params;

    if (filter === "available") {
      sql = `
        SELECT
          t.id,
          t.title,
          t.description,
          t.reward
        FROM tasks t
        WHERE t.active = true
          AND NOT EXISTS (
            SELECT 1
            FROM task_submissions s
            WHERE s.task_id = t.id
              AND s.user_id = $1
          )
        ORDER BY t.created_at DESC
        LIMIT 100
      `;

      params = [req.user.id];
    } else {
      sql = `
        SELECT
          t.id,
          t.title,
          t.description,
          t.reward
        FROM task_submissions s
        JOIN tasks t
          ON t.id = s.task_id
        WHERE s.user_id = $1
          AND s.status = $2
        ORDER BY s.submitted_at DESC
        LIMIT 100
      `;

      params = [
        req.user.id,
        filter === "completed"
          ? "approved"
          : "pending"
      ];
    }

    const result = await query(
      sql,
      params
    );

    res.json({
      tasks: result.rows
    });
  })
);

app.post(
  "/api/tasks/:id/submit",
  auth,
  asyncRoute(async (req, res) => {
    const taskId = req.params.id;

    if (!/^\d+$/.test(taskId)) {
      return fail(
        res,
        400,
        "Invalid task"
      );
    }

    const result = await query(
      `INSERT INTO task_submissions
       (task_id, user_id)
       SELECT id, $2
       FROM tasks
       WHERE id = $1
         AND active = true
       ON CONFLICT (task_id, user_id)
       DO NOTHING
       RETURNING id`,
      [taskId, req.user.id]
    );

    if (!result.rows.length) {
      return fail(
        res,
        409,
        "টাস্কটি পাওয়া যায়নি অথবা আগে জমা হয়েছে।"
      );
    }

    res.json({
      message:
        "টাস্ক যাচাইয়ের জন্য জমা হয়েছে।"
    });
  })
);

/* REFERRALS */

app.get(
  "/api/referrals",
  auth,
  asyncRoute(async (req, res) => {
    const [
      referrals,
      rewards
    ] = await Promise.all([
      query(
        `SELECT
           first_name AS name,
           status,
           created_at
         FROM users
         WHERE referrer_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [req.user.id]
      ),

      query(
        `SELECT
           COALESCE(
             SUM(amount), 0
           ) AS earnings
         FROM referral_rewards
         WHERE referrer_id = $1
           AND status = 'approved'`,
        [req.user.id]
      )
    ]);

    const botUsername = (
      process.env.BOT_USERNAME || ""
    ).replace(/^@/, "");

    const referralLink = botUsername
      ? `https://t.me/${botUsername}?startapp=ref_${req.user.telegram_id}`
      : "";

    res.json({
      earnings: number(
        rewards.rows[0].earnings
      ),
      verifiedCount:
        referrals.rows.filter(
          (item) =>
            item.status === "active"
        ).length,
      referrals: referrals.rows,
      referralLink,
      rules:
        "রেফার বোনাস শুধু অনুমোদিত যাচাইকরণের পর যোগ হবে।"
    });
  })
);

/* WALLET */

app.get(
  "/api/wallet",
  auth,
  asyncRoute(async (req, res) => {
    const [
      wallet,
      payments,
      transactions,
      settings
    ] = await Promise.all([
      query(
        `SELECT balance
         FROM wallets
         WHERE user_id = $1`,
        [req.user.id]
      ),

      query(
        `SELECT
           id, method, amount,
           fee, status, created_at
         FROM withdrawals
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id]
      ),

      query(
        `SELECT
           id, type, amount, created_at
         FROM ledger
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id]
      ),

      getSettings()
    ]);

    res.json({
      balance: number(
        wallet.rows[0]?.balance
      ),
      minWithdrawal: number(
        settings.minWithdrawal
      ),
      payments: payments.rows,
      transactions: transactions.rows
    });
  })
);

/* WITHDRAWALS */

app.post(
  "/api/withdrawals",
  auth,
  asyncRoute(async (req, res) => {
    const {
      method,
      account
    } = req.body || {};

    const amount = Number(
      req.body?.amount
    );

    if (
      !["bkash", "binance"].includes(method) ||
      typeof account !== "string" ||
      !account.trim() ||
      account.length > 120 ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(amount * 100)
    ) {
      return fail(
        res,
        400,
        "সঠিক উত্তোলন তথ্য দিন।"
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const settingsResult =
        await client.query(
          `SELECT key, value
           FROM settings
           WHERE key IN (
             'minWithdrawal',
             'withdrawalFeePercent'
           )`
        );

      const settings =
        Object.fromEntries(
          settingsResult.rows.map(
            (row) => [
              row.key,
              row.value
            ]
          )
        );

      if (
        amount <
        number(settings.minWithdrawal)
      ) {
        await client.query("ROLLBACK");

        return fail(
          res,
          400,
          "সর্বনিম্ন উত্তোলনের চেয়ে কম।"
        );
      }

      const feePercent = number(
        settings.withdrawalFeePercent
      );

      if (
        feePercent < 0 ||
        feePercent > 100
      ) {
        throw new Error(
          "Invalid withdrawal fee"
        );
      }

      const fee = money(
        amount * feePercent / 100
      );

      const wallet =
        await client.query(
          `SELECT balance
           FROM wallets
           WHERE user_id = $1
           FOR UPDATE`,
          [req.user.id]
        );

      if (
        number(
          wallet.rows[0]?.balance
        ) < amount
      ) {
        await client.query("ROLLBACK");

        return fail(
          res,
          400,
          "পর্যাপ্ত ব্যালেন্স নেই।"
        );
      }

      const recent =
        await client.query(
          `SELECT 1
           FROM withdrawals
           WHERE user_id = $1
             AND created_at >= CURRENT_DATE
           LIMIT 1`,
          [req.user.id]
        );

      if (recent.rows.length) {
        await client.query("ROLLBACK");

        return fail(
          res,
          409,
          "আজ ইতোমধ্যে উত্তোলনের আবেদন করেছেন।"
        );
      }

      const created =
        await client.query(
          `INSERT INTO withdrawals
           (
             user_id,
             method,
             account,
             amount,
             fee
           )
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            req.user.id,
            method,
            account.trim(),
            amount,
            fee
          ]
        );

      await client.query(
        `UPDATE wallets
         SET balance = balance - $2
         WHERE user_id = $1`,
        [req.user.id, amount]
      );

      await client.query(
        `INSERT INTO ledger
         (
           user_id,
           type,
           amount,
           reference
         )
         VALUES ($1, $2, $3, $4)`,
        [
          req.user.id,
          "withdrawal_hold",
          -amount,
          `withdrawal:${created.rows[0].id}`
        ]
      );

      await client.query("COMMIT");

      res.json({
        message:
          "উত্তোলনের আবেদন জমা হয়েছে।",
        id: created.rows[0].id
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/* LEADERBOARD */

app.get(
  "/api/leaderboard",
  auth,
  asyncRoute(async (req, res) => {
    const type =
      req.query.type === "referrals"
        ? "referrals"
        : "earnings";

    let sql;

    if (type === "referrals") {
      sql = `
        SELECT
          u.first_name AS name,
          COUNT(r.id)::int AS referrals
        FROM users u
        LEFT JOIN users r
          ON r.referrer_id = u.id
        GROUP BY u.id
        ORDER BY referrals DESC, u.id
        LIMIT 50
      `;
    } else {
      sql = `
        SELECT
          u.first_name AS name,
          COALESCE(
            SUM(
              CASE
                WHEN l.amount > 0
                THEN l.amount
                ELSE 0
              END
            ), 0
          ) AS earnings
        FROM users u
        LEFT JOIN ledger l
          ON l.user_id = u.id
        GROUP BY u.id
        ORDER BY earnings DESC, u.id
        LIMIT 50
      `;
    }

    const result = await query(sql);

    res.json({
      users: result.rows
    });
  })
);

/* SPIN - DISABLED */

app.get(
  "/api/spin/status",
  auth,
  (req, res) => {
    res.json({
      entryFee: 0,
      remaining: 0,
      enabled: false
    });
  }
);

/* LOTTERY - DISABLED */

app.get(
  "/api/lottery",
  auth,
  (req, res) => {
    res.json({
      draws: [],
      enabled: false
    });
  }
);

/* ADMIN OVERVIEW */

app.get(
  "/api/admin/overview",
  auth,
  admin,
  asyncRoute(async (req, res) => {
    const [
      users,
      tasks,
      withdrawals
    ] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS count
         FROM users`
      ),

      query(
        `SELECT COUNT(*)::int AS count
         FROM tasks`
      ),

      query(
        `SELECT COUNT(*)::int AS count
         FROM withdrawals
         WHERE status = 'pending'`
      )
    ]);

    res.json({
      users: users.rows[0].count,
      tasks: tasks.rows[0].count,
      pendingWithdrawals:
        withdrawals.rows[0].count
    });
  })
);

/* ADMIN WITHDRAWALS */

app.get(
  "/api/admin/withdrawals",
  auth,
  admin,
  asyncRoute(async (req, res) => {
    const result = await query(
      `SELECT
         w.id,
         w.method,
         w.account,
         w.amount,
         w.fee,
         w.status,
         w.created_at,
         u.telegram_id,
         u.first_name
       FROM withdrawals w
       JOIN users u
         ON u.id = w.user_id
       ORDER BY w.created_at DESC
       LIMIT 100`
    );

    res.json({
      withdrawals: result.rows
    });
  })
);

/* ADMIN TASKS */

app.get(
  "/api/admin/tasks",
  auth,
  admin,
  asyncRoute(async (req, res) => {
    const result = await query(
      `SELECT
         id,
         title,
         description,
         reward,
         active,
         created_at
       FROM tasks
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({
      tasks: result.rows
    });
  })
);

/* ADMIN USERS */

app.get(
  "/api/admin/users",
  auth,
  admin,
  asyncRoute(async (req, res) => {
    const result = await query(
      `SELECT
         u.id,
         u.telegram_id,
         u.first_name,
         u.username,
         u.status,
         u.created_at,
         COALESCE(
           w.balance, 0
         ) AS balance
       FROM users u
       LEFT JOIN wallets w
         ON w.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 100`
    );

    res.json({
      users: result.rows
    });
  })
);

/* STATIC PAGES */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      publicDir,
      "index.html"
    )
  );
});

/* NOT FOUND */

app.use("/api", (req, res) => {
  fail(
    res,
    404,
    "API route not found"
  );
});

app.use((req, res) => {
  fail(
    res,
    404,
    "Page not found"
  );
});

/* ERROR HANDLER */

app.use((error, req, res, next) => {
  console.error(
    "Server error:",
    error
  );

  res.status(500).json({
    message:
      "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।"
  });
});

/* VERCEL EXPORT */

module.exports = app;

/* LOCAL SERVER */

if (require.main === module) {
  const port = Number(
    process.env.PORT || 3000
  );

  app.listen(port, () => {
    console.log(
      `Tia Earn running on port ${port}`
    );
  });
}
