const mongoose = require("mongoose");
const crypto = require("crypto");
const Bot = require("../models/Bot");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const botManager = require("../services/botManager.client");

const DEPLOY_FEE = 10; // KES per bot
const MIN_DEPOSIT = 60; // KES, enforced in wallet.controller.js on deposit

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
  return wallet;
}

// POST /api/bots/deploy  { name }
exports.deployBot = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Bot name is required" });
    }

    const wallet = await getOrCreateWallet(req.user.id);
    if (wallet.balance < DEPLOY_FEE) {
      return res.status(400).json({
        message: `Insufficient balance. Deploying a bot costs KES ${DEPLOY_FEE}.`,
      });
    }

    const sessionId = crypto.randomUUID();
    let bot;

    // Deduct the fee and create the bot record atomically, before ever
    // touching the Java service — if Docker fails to start the container,
    // we refund in a separate step rather than leaving a half-charged state.
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Wallet.updateOne(
        { user: req.user.id },
        { $inc: { balance: -DEPLOY_FEE } },
        { session }
      );

      const created = await Bot.create(
        [{ owner: req.user.id, name: name.trim(), sessionId, status: "pending" }],
        { session }
      );
      bot = created[0];

      await Transaction.create(
        [
          {
            user: req.user.id,
            type: "bot_deploy",
            label: `Deployed bot: ${bot.name}`,
            amount: -DEPLOY_FEE,
            status: "completed",
            bot: bot._id,
          },
        ],
        { session }
      );
    });
    session.endSession();

    // Now actually start the container via the Java microservice
    try {
      const instance = await botManager.startBot({
        botId: bot._id.toString(),
        ownerId: req.user.id,
        sessionId,
      });

      bot.status = instance.status === "RUNNING" ? "running" : "failed";
      bot.lastError = instance.lastError || null;
      await bot.save();

      if (bot.status === "failed") {
        await refund(req.user.id, bot, "Bot failed to start — fee refunded");
      }
    } catch (err) {
      console.error("botManager.startBot error:", err.response?.data || err.message);
      bot.status = "failed";
      bot.lastError = "Could not reach bot manager service";
      await bot.save();
      await refund(req.user.id, bot, "Bot manager unreachable — fee refunded");
    }

    res.status(201).json(bot);
  } catch (err) {
    console.error("deployBot error:", err.message);
    res.status(500).json({ message: "Could not deploy bot" });
  }
};

async function refund(userId, bot, label) {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await Wallet.updateOne({ user: userId }, { $inc: { balance: DEPLOY_FEE } }, { session });
    await Transaction.create(
      [
        {
          user: userId,
          type: "bot_refund",
          label,
          amount: DEPLOY_FEE,
          status: "completed",
          bot: bot._id,
        },
      ],
      { session }
    );
  });
  session.endSession();
}

// POST /api/bots/:id/stop
exports.stopBot = async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user.id });
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    await botManager.stopBot(bot._id.toString());
    bot.status = "stopped";
    bot.stoppedAt = new Date();
    await bot.save();

    res.json(bot);
  } catch (err) {
    console.error("stopBot error:", err.response?.data || err.message);
    res.status(500).json({ message: "Could not stop bot" });
  }
};

// GET /api/bots
exports.listBots = async (req, res) => {
  const bots = await Bot.find({ owner: req.user.id }).sort({ createdAt: -1 });
  res.json(bots);
};

// GET /api/bots/:id/status  (refreshes from the Java manager)
exports.refreshStatus = async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user.id });
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    const instance = await botManager.getBotStatus(bot._id.toString());
    bot.status = instance.status.toLowerCase();
    bot.lastError = instance.lastError || null;
    await bot.save();

    res.json(bot);
  } catch (err) {
    console.error("refreshStatus error:", err.response?.data || err.message);
    res.status(500).json({ message: "Could not refresh bot status" });
  }
};

module.exports.DEPLOY_FEE = DEPLOY_FEE;
module.exports.MIN_DEPOSIT = MIN_DEPOSIT;
