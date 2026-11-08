import React from "react";
import { Settings as SettingsIcon, Save, RotateCcw, Shield, Network, Server, HardDrive } from "lucide-react";

interface SettingsViewProps {
  rpcUrl: string;
  onSaveRpcUrl: (url: string) => void;
  autoLockMinutes: number;
  onSaveAutoLockMinutes: (mins: number) => void;
  nodeDatadir: string;
  nodeHttpPort: number;
  nodeWsPort: number;
  nodeP2pPort: number;
  nodeBootnodes: string;
  onSaveNodeConfig: (config: {
    datadir: string;
    httpPort: number;
    wsPort: number;
    p2pPort: number;
    bootnodes: string;
  }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  rpcUrl,
  onSaveRpcUrl,
  autoLockMinutes,
  onSaveAutoLockMinutes,
  nodeDatadir,
  nodeHttpPort,
  nodeWsPort,
  nodeP2pPort,
  nodeBootnodes,
  onSaveNodeConfig,
}) => {
  const [localRpc, setLocalRpc] = React.useState(rpcUrl);
  const [localLock, setLocalLock] = React.useState(autoLockMinutes);
  const [datadir, setDatadir] = React.useState(nodeDatadir);
  const [httpPort, setHttpPort] = React.useState(nodeHttpPort);
  const [wsPort, setWsPort] = React.useState(nodeWsPort);
  const [p2pPort, setP2pPort] = React.useState(nodeP2pPort);
  const [bootnodes, setBootnodes] = React.useState(nodeBootnodes);
  const [saved, setSaved] = React.useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRpcUrl(localRpc);
    onSaveAutoLockMinutes(localLock);
    onSaveNodeConfig({
      datadir,
      httpPort,
      wsPort,
      p2pPort,
      bootnodes,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetDefaults = () => {
    setLocalRpc("http://127.0.0.1:38849");
    setLocalLock(15);
    setDatadir("./nodes-local/node-desktop");
    setHttpPort(38849);
    setWsPort(38850);
    setP2pPort(38890);
    setBootnodes(
      "enode://3bfcd978ea35fc817c5573b03e7b76cb7367720d4ff7a1fdb7ddcb83ec2ad6cba997029305678d49e1dbfccc83a20ecea0d4920a483a8e4d86ebe212b06bcefc@127.0.0.1:38888"
    );
  };

  const syncRpcWithNodePort = () => {
    setLocalRpc(`http://127.0.0.1:${httpPort}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-rose-500" />
            <h1 className="text-sm font-bold text-white uppercase tracking-wider">Client & Node Configuration</h1>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">Chain ID: 800055 (Rogue Signal)</span>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Internal Geth Node Subprocess Configuration */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-rose-400">
              <Server className="w-4 h-4" />
              <span>Independent Desktop Node (Subprocess Launcher)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">P2P Network Port</label>
                <input
                  type="number"
                  value={p2pPort}
                  onChange={(e) => setP2pPort(parseInt(e.target.value) || 38890)}
                  placeholder="38890"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">DevP2P gossip (Default: 38890)</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">HTTP RPC Port</label>
                <input
                  type="number"
                  value={httpPort}
                  onChange={(e) => {
                    const port = parseInt(e.target.value) || 38849;
                    setHttpPort(port);
                  }}
                  placeholder="38849"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Local API (Default: 38849)</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">WebSocket Port</label>
                <input
                  type="number"
                  value={wsPort}
                  onChange={(e) => setWsPort(parseInt(e.target.value) || 38850)}
                  placeholder="38850"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Events stream (Default: 38850)</span>
              </div>
            </div>

            {/* Datadir */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Node Blockchain Data Directory (--datadir)</span>
              </label>
              <input
                type="text"
                value={datadir}
                onChange={(e) => setDatadir(e.target.value)}
                placeholder="./nodes-local/node-desktop"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Dedicated directory for chaindata, keystore, and logs of the desktop client node.
              </span>
            </div>

            {/* Bootnodes */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <Network className="w-3.5 h-3.5 text-amber-400" />
                <span>Network Bootnodes (Enode URLs)</span>
              </label>
              <input
                type="text"
                value={bootnodes}
                onChange={(e) => setBootnodes(e.target.value)}
                placeholder="enode://..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Comma-separated enodes used to discover peers upon startup.
              </span>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-4">
            {/* Dashboard RPC Connection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <span>Dashboard RPC Target Endpoint</span>
                </div>
                <button
                  type="button"
                  onClick={syncRpcWithNodePort}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  Sync to local port ({httpPort})
                </button>
              </div>
              <div>
                <input
                  type="text"
                  value={localRpc}
                  onChange={(e) => setLocalRpc(e.target.value)}
                  placeholder="http://127.0.0.1:38849"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3.5 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  The JSON-RPC URL that this desktop interface polls for balance, height, and mining control.
                </span>
              </div>
            </div>

            {/* Security and Auto-Lock Section */}
            <div className="space-y-2 pt-2">
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
          </div>

          <div className="flex items-center space-x-3 pt-3 border-t border-zinc-800">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
            >
              <Save className="w-4 h-4" />
              <span>{saved ? "Saved Successfully" : "Save Changes"}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
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
