import { useState, useEffect, useCallback } from "react";
import { Bot, Zap, Plus, RefreshCw, Square, Wallet } from "lucide-react";

const fmt = (n) => "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2 });
const MIN_DEPOSIT = 60;
const DEPLOY_FEE = 10;

const api = {
  base: import.meta?.env?.VITE_API_URL || "http://localhost:5000/api",
  async call(path, opts = {}) {
    const res = await fetch(`${this.base}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  },
};

const statusColor = {
  running: "#2F7A4D",
  pending: "#C9A227",
  stopped: "#7C8AA0",
  failed: "#B3554A",
};

export default function BotNestDashboard() {
  const [balance, setBalance] = useState(0);
  const [bots, setBots] = useState([]);
  const [modal, setModal] = useState(null); // 'deposit' | 'deploy'
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [botName, setBotName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadData = useCallback(async () => {
    try {
      const [w, b] = await Promise.all([api.call("/wallet"), api.call("/bots")]);
      setBalance(w.balance);
      setBots(b);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const closeModal = () => {
    setModal(null);
    setPhone("");
    setAmount("");
    setBotName("");
    setError(null);
  };

  const handleDeposit = async () => {
    setError(null);
    const v = parseFloat(amount);
    if (!phone || !v) return setError("Enter phone and amount");
    if (v < MIN_DEPOSIT) return setError(`Minimum deposit is ${fmt(MIN_DEPOSIT)}`);

    setBusy(true);
    try {
      const res = await api.call("/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({ phone, amount: v }),
      });
      notify(res.message || "STK push sent — enter your M-Pesa PIN");
      closeModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeploy = async () => {
    setError(null);
    if (!botName.trim()) return setError("Give your bot a name");
    if (balance < DEPLOY_FEE) return setError(`You need at least ${fmt(DEPLOY_FEE)} to deploy`);

    setBusy(true);
    try {
      const bot = await api.call("/bots/deploy", {
        method: "POST",
        body: JSON.stringify({ name: botName.trim() }),
      });
      notify(
        bot.status === "running"
          ? `${bot.name} is live 🎉`
          : `${bot.name} failed to start — fee refunded`
      );
      closeModal();
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (id) => {
    try {
      await api.call(`/bots/${id}/stop`, { method: "POST" });
      notify("Bot stopped");
      await loadData();
    } catch (err) {
      notify(err.message);
    }
  };

  const handleRefresh = async (id) => {
    try {
      await api.call(`/bots/${id}/status`);
      await loadData();
    } catch (err) {
      notify(err.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: "#0B1220", fontFamily: "Inter, sans-serif" }}>
      <div className="w-full max-w-md px-4 pb-10 pt-6 relative">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ color: "#7C8AA0" }} className="text-xs tracking-widest uppercase">BotNest</p>
            <h1 style={{ color: "#F5F1E8" }} className="text-lg font-semibold">WhatsApp Bot Hosting</h1>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1E2A3D" }}>
            <Bot size={16} color="#C9A227" />
          </div>
        </div>

        {/* Balance card */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: "linear-gradient(135deg, #16233A 0%, #0F1A2C 100%)", border: "1px solid #223252" }}
        >
          <p style={{ color: "#7C8AA0" }} className="text-xs uppercase tracking-wide mb-1">Wallet balance</p>
          <p style={{ color: "#F5F1E8", fontFamily: "Georgia, serif" }} className="text-3xl font-semibold mb-1">
            {fmt(balance)}
          </p>
          <p style={{ color: "#7C8AA0" }} className="text-xs mb-4">
            Min deposit {fmt(MIN_DEPOSIT)} · {fmt(DEPLOY_FEE)} per bot deployed
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setModal("deposit")}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium"
              style={{ background: "#C9A227", color: "#0B1220" }}
            >
              <Wallet size={15} /> Deposit
            </button>
            <button
              onClick={() => setModal("deploy")}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium"
              style={{ background: "transparent", color: "#F5F1E8", border: "1px solid #2C3B57" }}
            >
              <Plus size={15} /> Deploy bot
            </button>
          </div>
        </div>

        {/* Bots list */}
        <h2 style={{ color: "#F5F1E8" }} className="text-sm font-semibold uppercase tracking-wide mb-3 mt-6">
          Your Bots
        </h2>

        {bots.length === 0 && (
          <div className="rounded-2xl p-5 text-center" style={{ background: "#131F33", border: "1px dashed #2C3B57" }}>
            <p style={{ color: "#7C8AA0" }} className="text-sm">No bots deployed yet. Deploy one for {fmt(DEPLOY_FEE)}.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {bots.map((bot) => (
            <div key={bot._id} className="rounded-2xl p-4" style={{ background: "#131F33", border: "1px solid #1E2A3D" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap size={15} color={statusColor[bot.status] || "#7C8AA0"} />
                  <p style={{ color: "#F5F1E8" }} className="text-sm font-medium truncate">{bot.name}</p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full capitalize"
                  style={{ color: statusColor[bot.status] || "#7C8AA0", background: "rgba(124,138,160,0.12)" }}
                >
                  {bot.status}
                </span>
              </div>
              {bot.lastError && (
                <p style={{ color: "#B3554A" }} className="text-xs mb-2">{bot.lastError}</p>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleRefresh(bot._id)}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs"
                  style={{ background: "#0B1220", color: "#F5F1E8", border: "1px solid #223252" }}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
                {bot.status !== "stopped" && (
                  <button
                    onClick={() => handleStop(bot._id)}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs"
                    style={{ background: "#0B1220", color: "#B3554A", border: "1px solid #3A2323" }}
                  >
                    <Square size={12} /> Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm z-50" style={{ background: "#F5F1E8", color: "#0B1220" }}>
            {toast}
          </div>
        )}

        {modal && (
          <div className="fixed inset-0 flex items-end sm:items-center justify-center z-40" style={{ background: "rgba(0,0,0,0.6)" }} onClick={closeModal}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" style={{ background: "#101A2C", border: "1px solid #223252" }}>
              <h3 style={{ color: "#F5F1E8" }} className="text-base font-semibold mb-4">
                {modal === "deposit" ? "Deposit via M-Pesa" : "Deploy a WhatsApp Bot"}
              </h3>

              {modal === "deposit" ? (
                <div className="flex flex-col gap-3">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="M-Pesa phone number"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#0B1220", border: "1px solid #223252", color: "#F5F1E8" }}
                  />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Amount (min ${MIN_DEPOSIT})`}
                    type="number"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#0B1220", border: "1px solid #223252", color: "#F5F1E8" }}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <input
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="Bot name, e.g. Customer Support"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "#0B1220", border: "1px solid #223252", color: "#F5F1E8" }}
                  />
                  <p style={{ color: "#7C8AA0" }} className="text-xs">
                    Deploying costs {fmt(DEPLOY_FEE)}, deducted from your wallet balance ({fmt(balance)} available).
                  </p>
                </div>
              )}

              {error && <p style={{ color: "#B3554A" }} className="text-xs mt-2">{error}</p>}

              <button
                onClick={modal === "deposit" ? handleDeposit : handleDeploy}
                disabled={busy}
                className="w-full rounded-xl py-2.5 text-sm font-medium mt-4"
                style={{ background: "#C9A227", color: "#0B1220", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Please wait…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
