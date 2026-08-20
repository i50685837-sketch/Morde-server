const mpesa = require("./mpesa.service"); // copy from beacon-backend/services/mpesa.service.js
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const { MIN_DEPOSIT } = require("../controllers/bot.controller");

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, balance: 0 });
  return wallet;
}

// GET /api/wallet
exports.getWallet = async (req, res) => {
  const wallet = await getOrCreateWallet(req.user.id);
  res.json({ balance: wallet.balance });
};

// POST /api/wallet/deposit  { phone, amount }
exports.initiateDeposit = async (req, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) {
      return res.status(400).json({ message: "Phone and amount are required" });
    }
    if (amount < MIN_DEPOSIT) {
      return res.status(400).json({ message: `Minimum deposit is KES ${MIN_DEPOSIT}` });
    }

    const stk = await mpesa.initiateStkPush({
      phone,
      amount,
      accountRef: `BOTNEST-${req.user.id.toString().slice(-6)}`,
      description: "Wallet Deposit",
    });

    if (stk.ResponseCode !== "0") {
      return res.status(400).json({ message: stk.ResponseDescription || "STK push failed" });
    }

    const tx = await Transaction.create({
      user: req.user.id,
      type: "deposit",
      label: "M-Pesa Deposit",
      amount,
      status: "pending",
      mpesa: {
        checkoutRequestId: stk.CheckoutRequestID,
        merchantRequestId: stk.MerchantRequestID,
        phoneNumber: mpesa.formatPhone(phone),
      },
    });

    res.json({
      message: "STK push sent. Enter your M-Pesa PIN to complete the deposit.",
      checkoutRequestId: stk.CheckoutRequestID,
      transactionId: tx._id,
    });
  } catch (err) {
    console.error("initiateDeposit error:", err.response?.data || err.message);
    res.status(500).json({ message: "Could not initiate deposit" });
  }
};

// POST /api/wallet/mpesa/callback
exports.mpesaCallback = async (req, res) => {
  const ack = { ResultCode: 0, ResultDesc: "Accepted" };
  try {
    const result = mpesa.parseStkCallback(req.body);
    if (!result) return res.json(ack);

    const tx = await Transaction.findOne({ "mpesa.checkoutRequestId": result.checkoutRequestId });
    if (!tx || tx.status !== "pending") return res.json(ack);

    if (result.success) {
      tx.status = "completed";
      tx.amount = result.amount ?? tx.amount;
      tx.mpesa.mpesaReceiptNumber = result.mpesaReceiptNumber;
      await tx.save();
      await Wallet.updateOne({ user: tx.user }, { $inc: { balance: tx.amount } }, { upsert: true });
    } else {
      tx.status = "failed";
      await tx.save();
    }

    res.json(ack);
  } catch (err) {
    console.error("mpesaCallback error:", err.message);
    res.json(ack);
  }
};

// GET /api/wallet/transactions
exports.getTransactions = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const tx = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(limit);
  res.json(tx);
};
      
