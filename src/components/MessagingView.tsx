import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  Reply,
} from "lucide-react";

const DEFAULT_NATS_URL = "nats://127.0.0.1:4222";
const NATS_URL_STORAGE_KEY = "rogue_nats_server_url";

interface ChannelMeta {
  name: string;
  topic: string;
  system: boolean;
  gated: boolean;
  min_level: number;
  admin_only_write: boolean;
  pinned: boolean;
  created_by: string;
  created_at: number;
}

interface RoomSummary extends ChannelMeta {
  member_count: number;
}

interface ChatMessageEnvelope {
  v: number;
  id: string;
  seq: number;
  room: string;
  sender: string;
  level: number;
  kind: string;
  text: string;
  reply_to?: string;
  ts: number;
}

interface DeleteMessageEvent {
  room: string;
  seq: number;
  deleted_by: string;
  ts: number;
}

interface ErrorEvent {
  code: string;
  message: string;
  room?: string;
  ts: number;
}

interface PresenceRecord {
  address: string;
  active_room: string;
  level: number;
  updated_at: number;
}

interface DecryptedDM {
  id: string;
  sender: string;
  dest: string;
  text: string;
  ts: number;
}

interface MessagingStatus {
  status: "disconnected" | "connecting" | "connected" | "reconnecting" | "auth_error";
  address?: string | null;
  server_url?: string | null;
  miner_level?: number | null;
  error?: string | null;
}

interface MessagingViewProps {
  unlockedAddress: string | null;
  balance: string;
  minerLevel: number;
  onOpenWalletModal: (mode?: "create" | "unlock") => void;
}

const shortAddr = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const MessagingView: React.FC<MessagingViewProps> = ({
  unlockedAddress,
  balance,
  minerLevel,
  onOpenWalletModal,
}) => {
  const [serverUrl, setServerUrl] = useState<string>(
    () => localStorage.getItem(NATS_URL_STORAGE_KEY) || DEFAULT_NATS_URL
  );
  const [status, setStatus] = useState<MessagingStatus>({ status: "disconnected" });
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<string>("general");
  const [mode, setMode] = useState<"room" | "dm">("room");
  const [activePeer, setActivePeer] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessageEnvelope[]>([]);
  const [dms, setDms] = useState<DecryptedDM[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PresenceRecord[]>([]);
  const [unreadRooms, setUnreadRooms] = useState<Record<string, number>>({});
  const [unreadDMs, setUnreadDMs] = useState<Record<string, number>>({});
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageEnvelope | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [newDmPeer, setNewDmPeer] = useState("");
  const [showNewDmModal, setShowNewDmModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRoomRef = useRef(activeRoom);
  const modeRef = useRef(mode);
  const activePeerRef = useRef(activePeer);
  activeRoomRef.current = activeRoom;
  modeRef.current = mode;
  activePeerRef.current = activePeer;

  const selfAddress = (status.address || unlockedAddress || "").toLowerCase();

  const saveAndConnect = async (urlToUse = serverUrl) => {
    localStorage.setItem(NATS_URL_STORAGE_KEY, urlToUse);
    setBannerError(null);
    try {
      const st = await invoke<MessagingStatus>("messaging_connect", { serverUrl: urlToUse });
      setStatus(st);
      await refreshSidebarData();
      await loadRoomHistory(activeRoomRef.current);
    } catch (err: any) {
      setBannerError(String(err));
    }
  };

  const refreshSidebarData = async () => {
    const [roomsRes, onlineRes, dmsRes] = await Promise.allSettled([
      invoke<RoomSummary[]>("messaging_list_rooms"),
      invoke<PresenceRecord[]>("messaging_list_online", { room: activeRoomRef.current }),
      invoke<DecryptedDM[]>("messaging_list_dms"),
    ]);
    if (roomsRes.status === "fulfilled") {
      setRooms(roomsRes.value);
    }
    if (onlineRes.status === "fulfilled") {
      setOnlineUsers(onlineRes.value);
    }
    if (dmsRes.status === "fulfilled") {
      setDms(dmsRes.value);
    }
  };

  const loadRoomHistory = async (room: string, beforeSeq?: number) => {
    try {
      await invoke("messaging_set_active_room", { room });
      const hist = await invoke<ChatMessageEnvelope[]>("messaging_read_history", {
        room,
        limit: 200,
        beforeSeq: beforeSeq ?? null,
      });
      if (beforeSeq) {
        setMessages((prev) => [...hist, ...prev]);
      } else {
        setMessages(hist);
      }
      setUnreadRooms((prev) => ({ ...prev, [room]: 0 }));
    } catch (err: any) {
      setBannerError(String(err));
    }
  };

  // Auto-reconnect when active wallet changes.
  useEffect(() => {
    if (!unlockedAddress) {
      invoke("messaging_disconnect").catch(() => {});
      return;
    }
    if (status.address && status.address.toLowerCase() !== unlockedAddress.toLowerCase()) {
      saveAndConnect(serverUrl);
    } else if (status.status === "disconnected") {
      saveAndConnect(serverUrl);
    }
  }, [unlockedAddress]);

  // Listen to Tauri backend events.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<MessagingStatus>("messaging://status", (e) => {
      setStatus(e.payload);
    }).then((u) => unlisteners.push(u));

    listen<ChatMessageEnvelope>("messaging://chat", (e) => {
      const msg = e.payload;
      if (modeRef.current === "room" && msg.room === activeRoomRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } else {
        setUnreadRooms((prev) => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
      }
    }).then((u) => unlisteners.push(u));

    listen<DeleteMessageEvent>("messaging://delete", (e) => {
      const ev = e.payload;
      if (ev.room === activeRoomRef.current) {
        setMessages((prev) => prev.filter((m) => m.seq !== ev.seq));
      }
    }).then((u) => unlisteners.push(u));

    listen<DecryptedDM>("messaging://dm", (e) => {
      const dm = e.payload;
      setDms((prev) => (prev.some((x) => x.id === dm.id) ? prev : [...prev, dm]));
      const peer = dm.sender.toLowerCase() === selfAddress ? dm.dest.toLowerCase() : dm.sender.toLowerCase();
      if (!(modeRef.current === "dm" && activePeerRef.current.toLowerCase() === peer)) {
        setUnreadDMs((prev) => ({ ...prev, [peer]: (prev[peer] || 0) + 1 }));
      }
    }).then((u) => unlisteners.push(u));

    listen<ErrorEvent>("messaging://error", (e) => {
      setBannerError(`${e.payload.code}: ${e.payload.message}`);
    }).then((u) => unlisteners.push(u));

    listen<string>("messaging://session_refresh", (e) => {
      saveAndConnect(e.payload);
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [selfAddress]);

  // Periodic refresh of room member counts & online users.
  useEffect(() => {
    if (status.status !== "connected") return;
    const id = setInterval(() => {
      refreshSidebarData();
    }, 15000);
    return () => clearInterval(id);
  }, [status.status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, dms.length, mode, activeRoom, activePeer]);

  const dmPeers = useMemo(() => {
    const set = new Set<string>();
    dms.forEach((d) => {
      const peer = d.sender.toLowerCase() === selfAddress ? d.dest.toLowerCase() : d.sender.toLowerCase();
      if (peer) set.add(peer);
    });
    if (activePeer) set.add(activePeer.toLowerCase());
    return Array.from(set);
  }, [dms, selfAddress, activePeer]);

  const activeDmThread = useMemo(() => {
    const p = activePeer.toLowerCase();
    return dms.filter(
      (d) =>
        (d.sender.toLowerCase() === selfAddress && d.dest.toLowerCase() === p) ||
        (d.dest.toLowerCase() === selfAddress && d.sender.toLowerCase() === p)
    );
  }, [dms, selfAddress, activePeer]);

  const currentRoomMeta = rooms.find((r) => r.name === activeRoom);

  const handleSelectRoom = async (room: RoomSummary) => {
    const effectiveLevel = status.miner_level ?? minerLevel;
    if (room.gated && effectiveLevel < room.min_level) {
      setBannerError(`Room #${room.name} requires MinerLevel >= Lv.${room.min_level}`);
      return;
    }
    setBannerError(null);
    setMode("room");
    setActiveRoom(room.name);
    setReplyTo(null);
    await loadRoomHistory(room.name);
    refreshSidebarData();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setBannerError(null);
    try {
      if (mode === "room") {
        await invoke("messaging_send_message", {
          room: activeRoom,
          text,
          replyTo: replyTo?.id ?? null,
        });
        setReplyTo(null);
      } else {
        const sent = await invoke<DecryptedDM>("messaging_send_dm", {
          to: activePeer,
          text,
        });
        setDms((prev) => [...prev, sent]);
      }
      setInputText("");
    } catch (err: any) {
      setBannerError(String(err));
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerError(null);
    try {
      const created = await invoke<ChannelMeta>("messaging_create_room", {
        name: newRoomName.trim().toLowerCase(),
        topic: newRoomTopic.trim(),
      });
      setShowCreateModal(false);
      setNewRoomName("");
      setNewRoomTopic("");
      await refreshSidebarData();
      setMode("room");
      setActiveRoom(created.name);
      await loadRoomHistory(created.name);
    } catch (err: any) {
      setBannerError(String(err));
    }
  };

  const handleDeleteMsg = async (seq: number) => {
    try {
      await invoke("messaging_delete_message", { room: activeRoom, seq });
    } catch (err: any) {
      setBannerError(String(err));
    }
  };

  if (!unlockedAddress) {
    return (
      <div className="h-full flex flex-col items-center justify-center border border-white/10 bg-black p-8 text-center">
        <Lock className="w-10 h-10 text-zinc-400 mb-4" />
        <h2 className="text-lg font-mono uppercase tracking-wider text-white mb-2">
          Wallet Unlock Required
        </h2>
        <p className="text-xs font-mono text-zinc-400 max-w-md mb-6">
          Rogue Messaging authenticates via secp256k1 challenge-response and encrypts direct messages with ECIES using your active wallet.
        </p>
        <button
          onClick={() => onOpenWalletModal("unlock")}
          className="px-4 py-2 bg-white text-black text-xs font-mono uppercase font-bold rounded-[2px] hover:bg-zinc-200 transition"
        >
          Unlock Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border border-white/10 bg-black font-mono text-xs overflow-hidden">
      {/* Top Status & Server Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-zinc-950">
        <div className="flex items-center space-x-3">
          <span
            className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-[2px] border text-[11px] uppercase ${
              status.status === "connected"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : status.status === "auth_error"
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
            }`}
          >
            {status.status === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{status.status}</span>
          </span>
          <span className="text-zinc-300">{shortAddr(selfAddress)}</span>
          <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-zinc-300">
            Lv.{status.miner_level ?? minerLevel}
          </span>
          <span className="text-zinc-500">{balance} ROGUE</span>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="nats://127.0.0.1:4222"
            className="w-60 px-2.5 py-1 bg-black border border-white/15 text-zinc-200 text-xs focus:outline-none focus:border-white/40"
          />
          <button
            onClick={() => saveAndConnect(serverUrl)}
            className="px-3 py-1 bg-white text-black font-bold uppercase hover:bg-zinc-200 transition flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Connect</span>
          </button>
        </div>
      </div>

      {(bannerError || status.error) && (
        <div className="px-4 py-2 bg-red-950/50 border-b border-red-500/30 text-red-300 flex items-center justify-between">
          <span>{bannerError || status.error}</span>
          <button onClick={() => setBannerError(null)} className="text-red-400 hover:text-white ml-4">
            DISMISS
          </button>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Rooms (sorted DESC by member_count) & E2EE DMs */}
        <aside className="w-64 border-r border-white/10 flex flex-col overflow-y-auto bg-zinc-950/60">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-zinc-400 uppercase tracking-wider">Channels</span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/10"
              title="Create public room"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2 space-y-1">
            {rooms.map((r) => {
              const locked = r.gated && (status.miner_level ?? minerLevel) < r.min_level;
              const isSelected = mode === "room" && activeRoom === r.name;
              const unread = unreadRooms[r.name] || 0;
              return (
                <button
                  key={r.name}
                  onClick={() => handleSelectRoom(r)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition ${
                    isSelected
                      ? "bg-white text-black font-bold"
                      : locked
                      ? "text-zinc-600 hover:bg-white/5"
                      : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center space-x-1.5 truncate">
                    {r.gated ? <Lock className="w-3 h-3 shrink-0" /> : <MessageSquare className="w-3 h-3 shrink-0" />}
                    <span className="truncate">#{r.name}</span>
                  </span>
                  <span className="flex items-center space-x-1.5 shrink-0">
                    {unread > 0 && (
                      <span className="px-1.5 bg-emerald-500 text-black font-bold rounded-[2px] text-[10px]">
                        {unread}
                      </span>
                    )}
                    <span className={`text-[10px] ${isSelected ? "text-black/70" : "text-zinc-500"}`}>
                      {r.member_count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-y border-white/10 flex items-center justify-between mt-2">
            <span className="text-zinc-400 uppercase tracking-wider flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>E2EE DMs</span>
            </span>
            <button
              onClick={() => setShowNewDmModal(true)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/10"
              title="New E2EE DM"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2 space-y-1">
            {dmPeers.map((peer) => {
              const isSelected = mode === "dm" && activePeer.toLowerCase() === peer;
              const unread = unreadDMs[peer] || 0;
              return (
                <button
                  key={peer}
                  onClick={() => {
                    setMode("dm");
                    setActivePeer(peer);
                    setUnreadDMs((prev) => ({ ...prev, [peer]: 0 }));
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition ${
                    isSelected ? "bg-white text-black font-bold" : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span className="truncate">{shortAddr(peer)}</span>
                  {unread > 0 && (
                    <span className="px-1.5 bg-emerald-500 text-black font-bold rounded-[2px] text-[10px]">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: Message Feed & Composer */}
        <section className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between bg-zinc-950/30">
            <div>
              <div className="text-sm font-bold text-white">
                {mode === "room" ? `#${activeRoom}` : `E2EE DM: ${shortAddr(activePeer)}`}
              </div>
              <div className="text-[11px] text-zinc-500">
                {mode === "room"
                  ? currentRoomMeta?.topic || "Rogue Signal room"
                  : "End-to-end encrypted (ECIES secp256k1). Losing your 0x key prevents decrypting past DMs."}
              </div>
            </div>
            {mode === "room" && messages.length > 0 && (
              <button
                onClick={() => loadRoomHistory(activeRoom, messages[0].seq)}
                className="px-2.5 py-1 border border-white/15 text-zinc-400 hover:text-white hover:border-white/40 text-[11px]"
              >
                Load Older (200)
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mode === "room"
              ? messages.map((m) => {
                  const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
                  const canDelete = m.sender.toLowerCase() === selfAddress || currentRoomMeta?.created_by === selfAddress;
                  return (
                    <div key={m.id} className="group border border-white/5 bg-zinc-950/40 p-2.5 hover:border-white/15">
                      {quoted && (
                        <div className="mb-1.5 pl-2 border-l-2 border-zinc-600 text-[11px] text-zinc-400 truncate">
                          Replying to {shortAddr(quoted.sender)}: {quoted.text}
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-bold">{shortAddr(m.sender)}</span>
                          <span className="px-1 bg-white/10 text-zinc-300 text-[10px]">Lv.{m.level}</span>
                          <span className="text-zinc-600 text-[10px]">{formatTime(m.ts)}</span>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-2 transition">
                          <button
                            onClick={() => setReplyTo(m)}
                            className="text-zinc-400 hover:text-white"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && m.seq > 0 && (
                            <button
                              onClick={() => handleDeleteMsg(m.seq)}
                              className="text-zinc-400 hover:text-red-400"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-zinc-200 whitespace-pre-wrap break-words">{m.text}</div>
                    </div>
                  );
                })
              : activeDmThread.map((dm) => (
                  <div key={dm.id} className="border border-emerald-500/15 bg-zinc-950/40 p-2.5">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-emerald-400 font-bold">{shortAddr(dm.sender)}</span>
                      <span className="text-zinc-600 text-[10px]">{formatTime(dm.ts)}</span>
                    </div>
                    <div className="text-zinc-200 whitespace-pre-wrap break-words">{dm.text}</div>
                  </div>
                ))}
            <div ref={messagesEndRef} />
          </div>

          {replyTo && mode === "room" && (
            <div className="px-4 py-1.5 bg-zinc-900 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="truncate">Replying to {shortAddr(replyTo.sender)}: {replyTo.text}</span>
              <button onClick={() => setReplyTo(null)} className="text-zinc-300 hover:text-white ml-2">
                Cancel
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex items-center space-x-2 bg-zinc-950">
            <input
              type="text"
              maxLength={2000}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={status.status !== "connected"}
              placeholder={
                mode === "room" ? `Message #${activeRoom} (max 2000 chars)...` : `Encrypted DM to ${shortAddr(activePeer)}...`
              }
              className="flex-1 px-3 py-2 bg-black border border-white/15 text-white focus:outline-none focus:border-white/40 disabled:opacity-50"
            />
            <span className="text-[10px] text-zinc-500 w-16 text-right">{inputText.length}/2000</span>
            <button
              type="submit"
              disabled={status.status !== "connected" || !inputText.trim()}
              className="px-4 py-2 bg-white text-black font-bold uppercase hover:bg-zinc-200 disabled:opacity-40 transition flex items-center space-x-1"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </section>

        {/* Right: Active Presence */}
        <aside className="w-52 border-l border-white/10 p-3 overflow-y-auto bg-zinc-950/60">
          <div className="flex items-center space-x-1.5 text-zinc-400 uppercase tracking-wider mb-3">
            <Users className="w-3.5 h-3.5" />
            <span>Online ({onlineUsers.length})</span>
          </div>
          <div className="space-y-1.5">
            {onlineUsers.map((u) => (
              <button
                key={u.address}
                onClick={() => {
                  if (u.address.toLowerCase() !== selfAddress) {
                    setMode("dm");
                    setActivePeer(u.address.toLowerCase());
                  }
                }}
                className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-white/5 text-zinc-300"
                title="Click to open E2EE DM"
              >
                <span className="truncate">{shortAddr(u.address)}</span>
                <span className="text-[10px] text-zinc-500">Lv.{u.level}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <form onSubmit={handleCreateRoom} className="w-96 border border-white/20 bg-zinc-950 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase">Create Public Room</h3>
            <input
              type="text"
              required
              pattern="^[a-z0-9-]{2,32}$"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="room-name (lowercase a-z, 0-9, -)"
              className="w-full px-3 py-2 bg-black border border-white/15 text-white"
            />
            <input
              type="text"
              maxLength={200}
              value={newRoomTopic}
              onChange={(e) => setNewRoomTopic(e.target.value)}
              placeholder="Topic (optional)"
              className="w-full px-3 py-2 bg-black border border-white/15 text-white"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-3 py-1.5 border border-white/20 text-zinc-300">
                Cancel
              </button>
              <button type="submit" className="px-3 py-1.5 bg-white text-black font-bold">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New DM Modal */}
      {showNewDmModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const target = newDmPeer.trim().toLowerCase();
              if (target.startsWith("0x") && target.length === 42) {
                setMode("dm");
                setActivePeer(target);
                setShowNewDmModal(false);
                setNewDmPeer("");
              }
            }}
            className="w-96 border border-white/20 bg-zinc-950 p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-white uppercase">New E2EE Direct Message</h3>
            <input
              type="text"
              required
              value={newDmPeer}
              onChange={(e) => setNewDmPeer(e.target.value)}
              placeholder="Recipient 0x address"
              className="w-full px-3 py-2 bg-black border border-white/15 text-white"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowNewDmModal(false)} className="px-3 py-1.5 border border-white/20 text-zinc-300">
                Cancel
              </button>
              <button type="submit" className="px-3 py-1.5 bg-white text-black font-bold">
                Open
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
