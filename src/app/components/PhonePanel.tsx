'use client';

import { useEffect, useRef, useState } from 'react';
import { TelnyxRTC, Call } from '@telnyx/webrtc';

type Ready = 'connecting' | 'ready' | 'error';

export default function PhonePanel() {
  const clientRef = useRef<TelnyxRTC | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [ready, setReady] = useState<Ready>('connecting');
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [dest, setDest] = useState('');
  const [status, setStatus] = useState('Idle');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/telnyx/webrtc/token`, { method: 'POST' });
        console.log('r. : ', r);
        if (!r.ok) throw new Error(`Token fetch failed (${r.status})`);
        const j = await r.json();
        
        const loginToken = j?.data?.login_token;        
        if (!loginToken) throw new Error('Missing login_token');

        const debug = (process.env.NEXT_PUBLIC_TELNYX_RTC_LOG_LEVEL ?? 'silent') !== 'silent';
        const client = new TelnyxRTC({ login_token: loginToken, debug });

        client.on('telnyx.ready', () => { if (!disposed) { setReady('ready'); setStatus('Ready'); }});
        client.on('telnyx.error', (e: any) => { if (!disposed) { setReady('error'); setStatus(`Error: ${e?.message ?? 'Unknown'}`); }});
        client.on('callUpdate', (call: Call) => {
          const stream: MediaStream | undefined = (call as any).remoteStream || (call as any).remoteMediaStream;
          if (remoteAudioRef.current && stream) {
            (remoteAudioRef.current as any).srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
          setActiveCall(call);
          setStatus(formatStatus(call));
        });

        clientRef.current = client;
        client.connect();
      } catch (e: any) {
        setReady('error');
        setStatus(`Error: ${e?.message ?? 'Init failed'}`);
      }
    })();
    return () => { disposed = true; clientRef.current?.disconnect(); clientRef.current = null; };
  }, []);

  const call = () => {
    if (!clientRef.current || !dest) return;
    const c = clientRef.current.newCall({ destinationNumber: dest });
    setActiveCall(c);
    setStatus('Calling…');
  };
  const answer = () => activeCall?.answer();
  const hangup = () => { activeCall?.hangup(); setMuted(false); };
  const toggleMute = async () => { if (!activeCall) return; await (activeCall as any).toggleAudioMute(); setMuted(!muted); };
  const sendDTMF = (d: string) => (activeCall as any)?.dtmf?.(d);

  return (
    <div className="w-[380px] rounded-2xl bg-white shadow-xl p-5 grid gap-3 text-black">
      <h2 className="text-xl font-semibold">Haraz • Telnyx Phone</h2>
      <div className="text-xs">Status: <span className="font-medium">{status}</span></div>

      <input
        className="h-11 px-3 rounded-xl border border-slate-300 outline-none placeholder:text-black/40 text-black"
        placeholder="+15556667777"
        value={dest}
        onChange={(e) => setDest(e.target.value)}
      />

      <div className="grid grid-flow-col gap-2">
        <Btn onClick={call}   disabled={ready !== 'ready' || !!activeCall} color="sky"  textBlack>Call</Btn>
        <Btn onClick={answer} disabled={!activeCall || !isIncomingRinging(activeCall)} color="green" textBlack>Answer</Btn>
        <Btn onClick={hangup} disabled={!activeCall} color="red" textBlack>Hangup</Btn>
        <Btn onClick={toggleMute} disabled={!activeCall} color="slate" textBlack>{muted ? 'Unmute' : 'Mute'}</Btn>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
          <button
            key={d}
            onClick={() => sendDTMF(d)}
            disabled={!activeCall}
            className="h-11 rounded-xl border border-slate-300 bg-white font-semibold disabled:opacity-40"
          >
            {d}
          </button>
        ))}
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />
      <p className="text-xs">Use phone numbers for patients (PSTN) and SIP URIs for internal tests.</p>
    </div>
  );
}

function Btn(
  props: { onClick?: () => void; disabled?: boolean; color: 'sky'|'green'|'red'|'slate'; children: any; textBlack?: boolean }
) {
  const map: Record<string, string> = {
    sky: 'bg-sky-300 hover:bg-sky-400',
    green: 'bg-emerald-300 hover:bg-emerald-400',
    red: 'bg-rose-300 hover:bg-rose-400',
    slate: 'bg-slate-300 hover:bg-slate-400',
  };
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`h-10 rounded-lg font-semibold disabled:opacity-40 ${map[props.color]} ${props.textBlack ? 'text-black' : 'text-white'}`}
    >
      {props.children}
    </button>
  );
}

function formatStatus(call: Call | null): string {
  if (!call) return 'Idle';
  const dir = (call as any).direction || '';
  const s = (call as any).state || (call as any).status || '';
  return `${dir ? dir + ' • ' : ''}${s || 'active'}`;
}
function isIncomingRinging(call: Call | null) {
  if (!call) return false;
  const dir = (call as any).direction;
  const s = (call as any).state || (call as any).status;
  return dir === 'incoming' && (s === 'ringing' || s === 'new' || s === 'invite');
}
