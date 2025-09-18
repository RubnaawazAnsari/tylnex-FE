"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TelnyxRTC, Call } from "@telnyx/webrtc";

type ConnectionState = "connecting" | "ready" | "error" | "disconnected";
type CallState =
  | "new"
  | "ringing"
  | "active"
  | "held"
  | "hangup"
  | "destroy"
  | "answering";
type CallDirection = "inbound" | "outbound";

interface IncomingCall {
  from: string;
  to: string;
  call: Call;
}

const DEBUG = false; // 🔧 toggle for verbose logging

export default function PhonePanel() {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [dest, setDest] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [muted, setMuted] = useState(false);

  const outboundCallsRef = useRef<Set<string>>(new Set());

  // ===== Helpers =====

  const log = (...args: any[]) => {
    if (DEBUG) console.log(...args);
  };

  const cleanupCall = useCallback(() => {
    setActiveCall(null);
    setIncomingCall(null);
    setMuted(false);
    setStatus(connectionState === "ready" ? "Ready" : "Disconnected");

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, [connectionState]);

  const handleRemoteStream = useCallback((call: Call) => {
    if (remoteAudioRef.current && (call as any).remoteStream) {
      remoteAudioRef.current.srcObject = (call as any).remoteStream;
      remoteAudioRef.current.play().catch((err) =>
        console.error("Failed to play remote audio:", err)
      );
    }
  }, []);

  const handleCallUpdate = useCallback(
    (call: Call) => {
      if (!call) return;

      const callState = call.state as CallState;
      const direction = call.direction as CallDirection;
      log("Call update:", {
        id: call.id,
        state: callState,
        direction,
        causeCode: (call as any).causeCode,
      });

      if (callState === "ringing" && call.options.callerName !== "") {
        const from = (call as any).remoteCallerNumber || "Unknown";
        const to = (call as any).destinationNumber || "You";
        setIncomingCall({ from, to, call });
        setStatus(`Incoming: ${from}`);
      }

      if (callState === "active") {
        setActiveCall(call);
        setIncomingCall(null);
        setStatus("Connected");
        setTimeout(() => handleRemoteStream(call), 500);
      }

      if (["hangup", "destroy"].includes(callState)) {
        outboundCallsRef.current.delete(call.id);
        cleanupCall();
      }
    },
    [cleanupCall, handleRemoteStream]
  );

  // ===== Init Client =====

  useEffect(() => {
    let disposed = false;

    const initClient = async () => {
      try {
        setConnectionState("connecting");
        setStatus("Fetching token...");

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/telnyx/webrtc/token`,
          { method: "POST" }
        );

        if (!res.ok) throw new Error("Token fetch failed");

        const data = await res.json();
        const loginToken =
          data?.data?.login_token ?? data?.login_token ?? data?.data;

        if (!loginToken) throw new Error("Missing login token");

        const client = new TelnyxRTC({ login_token: loginToken });

        client.on("telnyx.ready", () => {
          if (disposed) return;
          log("WebRTC client ready");
          setConnectionState("ready");
          setStatus("Ready for calls");
        });

        client.on("telnyx.error", (err: any) => {
          if (disposed) return;
          console.error("WebRTC error:", err);
          setConnectionState("error");
          setStatus("Connection error");
        });

        client.on("telnyx.socket.open", () => log("Socket connected"));
        client.on("telnyx.socket.close", () => {
          if (disposed) return;
          setConnectionState("disconnected");
          setStatus("Disconnected");
        });

        client.on("telnyx.notification", (n: any) => {
          if (disposed) return;
          const { type, call } = n;

          if (type === "callUpdate" && call) {
            handleCallUpdate(call);
          } else if (type === "userMediaError") {
            console.error("Media error:", n);
            setStatus("Microphone access denied");
          }
        });

        clientRef.current = client;
        log("Connecting WebRTC client...");
        client.connect();
      } catch (err) {
        if (disposed) return;
        console.error("Client init failed:", err);
        setConnectionState("error");
        setStatus(
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    };

    initClient();

    return () => {
      disposed = true;
      if (clientRef.current) {
        try {
          log("Disconnecting WebRTC client...");
          clientRef.current.disconnect();
        } catch (err) {
          console.error("Disconnect failed:", err);
        }
        clientRef.current = null;
      }
    };
  }, []);

  // ===== Call Controls =====

  const makeCall = () => {
    if (!clientRef.current || !dest) return;

    const newCall = clientRef.current.newCall({
      callerNumber: process.env.NEXT_PUBLIC_TELNYX_DEFAULT_FROM!,
      destinationNumber: dest,
      audio: true,
    });

    if (newCall?.id) outboundCallsRef.current.add(newCall.id);
    setStatus("Dialing...");
  };

  const answerCall = async () => {
    if (!incomingCall?.call) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      (incomingCall.call as any).options.localStream = stream;
      incomingCall.call.answer();
      setStatus("Answering...");
    } catch (err) {
      console.error("Answer failed:", err);
      setStatus("Failed to answer");
    }
  };

  const rejectCall = () => {
    if (!incomingCall?.call) return;

    try {
      incomingCall.call.hangup();
      cleanupCall();
    } catch (err) {
      console.error("Reject failed:", err);
    }
  };

  const hangupCall = () => {
    if (!activeCall) return;

    try {
      activeCall.hangup();
    } catch (err) {
      console.error("Hangup failed:", err);
    }
  };

  const toggleMute = () => {
    if (!activeCall) return;

    try {
      if (muted) {
        (activeCall as any).unmuteAudio?.() || (activeCall as any).unmute?.();
        setMuted(false);
      } else {
        (activeCall as any).muteAudio?.() || (activeCall as any).mute?.();
        setMuted(true);
      }
    } catch (err) {
      console.error("Mute toggle failed:", err);
    }
  };

  const sendDTMF = (digit: string) => {
    if (!activeCall) return;

    try {
      (activeCall as any).dtmf?.(digit);
    } catch (err) {
      console.error("DTMF failed:", err);
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case "ready":
        return "text-green-600 font-semibold";
      case "connecting":
        return "text-blue-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const isCallInProgress = activeCall || incomingCall;

  // ===== UI =====

  return (
    <div className="w-[450px] rounded-2xl bg-white shadow-xl p-5 grid gap-3 text-black">
      <h2 className="text-xl font-semibold">Haraz • Telnyx Phone</h2>

      <div className="text-xs">
        Connection: <span className={getStatusColor()}>{connectionState}</span>
      </div>
      <div className="text-xs">
        Status: <span className="font-medium">{status}</span>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

      <input
        className="h-11 px-3 rounded-xl border border-slate-300 outline-none placeholder:text-black/40 text-black"
        placeholder="+15556667777"
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        type="tel"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={makeCall}
          disabled={connectionState !== "ready" || !dest || !!isCallInProgress}
          className="h-10 bg-sky-300 text-black rounded-lg font-semibold disabled:opacity-40 hover:bg-sky-400"
        >
          Call
        </button>
        <button
          onClick={hangupCall}
          disabled={!activeCall}
          className="h-10 bg-rose-300 text-black rounded-lg font-semibold disabled:opacity-40 hover:bg-rose-400"
        >
          Hangup
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={toggleMute}
          disabled={!activeCall}
          className={`h-10 rounded-lg font-semibold disabled:opacity-40 ${
            muted
              ? "bg-yellow-300 hover:bg-yellow-400"
              : "bg-slate-300 hover:bg-slate-400"
          }`}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={answerCall}
          disabled={!incomingCall}
          className="h-10 bg-emerald-300 text-black rounded-lg font-semibold disabled:opacity-40 hover:bg-emerald-400"
        >
          Answer
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
          (digit) => (
            <button
              key={digit}
              onClick={() => sendDTMF(digit)}
              disabled={!activeCall}
              className="h-11 rounded-xl border border-slate-300 bg-white font-semibold disabled:opacity-40 hover:bg-gray-50"
            >
              {digit}
            </button>
          )
        )}
      </div>

      <div className="text-xs text-gray-600">
        {connectionState === "ready" ? "Ready for calls" : "Connecting..."}
      </div>
    </div>
  );
}
