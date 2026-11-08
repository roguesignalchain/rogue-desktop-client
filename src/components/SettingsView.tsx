import React from "react";
import { Settings as SettingsIcon, Save, RotateCcw, Shield, Network } from "lucide-react";

interface SettingsViewProps {
  rpcUrl: string;
  onSaveRpcUrl: (url: string) => void;
  autoLockMinutes: number;
  onSaveAutoLockMinutes: (mins: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  rpcUrl,
  onSaveRpcUrl,
  autoLockMinutes,
  onSaveAutoLockMinutes,
}) => {
  const [localRpc, setLocalRpc] = React.useState(rpcUrl);
  const [localLock, setLocalLock] = React.useState(autoLockMinutes);
  const [saved, setSaved] = React.useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRpcUrl(localRpc);
    onSaveAutoLockMinutes(localLock);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setLocalRpc("http://127.0.0.1:38845");
    setLocalLock(15);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6">
        <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800">
          <SettingsIcon className="w-5 h-5 text-rose-500" />
          <h1 className="text-sm font-bold text-white uppercase tracking-wider">Client Configuration</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Network and RPC Section */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
              <Network className="w-4 h-4 text-cyan-400" />
              <span>Node RPC Endpoint</span>
            </div>
            <div>
              <input
                type="text"
                value={localRpc}
                onChange={(e) => setLocalRpc(e.target.value)}
                placeholder="http://127.0.0.1:38845"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3.5 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">
                Standard Rogue Signal port: 38845 (HTTP) / 38846 (WS) / 38888 (P2P).
              </span>
            </div>
          </div>

          {/* Security and Auto-Lock Section */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Security & Auto-Lock Inactivity Period</span>
            </div>
            <select
              value={localLock}
              onChange={(e) => setLocalLock(parseInt(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes (Recommended)</option>
              <option value={30}>30 minutes</option>
              <option value={0}>Never lock automatically</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
            >
              <Save className="w-4 h-4" />
              <span>{saved ? "Saved Successfully" : "Save Changes"}</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center space-x-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restore Defaults</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

