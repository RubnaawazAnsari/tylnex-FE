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
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-9), `[${timestamp}] ${message}`]);
    console.log(`[PhonePanel] ${message}`);
  };

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        addLog('Fetching WebRTC token...');
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/telnyx/webrtc/token`, { method: 'POST' });
        
        if (!r.ok) {
          const errorText = await r.text();
          throw new Error(`Token fetch failed (${r.status}): ${errorText}`);
        }
        
        const j = await r.json();
        addLog('Token fetched successfully');
        
        const loginToken = j?.data?.login_token;        
        if (!loginToken) {
          throw new Error(`Missing login_token in response: ${JSON.stringify(j)}`);
        }

        const debug = (process.env.NEXT_PUBLIC_TELNYX_RTC_LOG_LEVEL ?? 'silent') !== 'silent';
        const client = new TelnyxRTC({ login_token: loginToken, debug });

        client.on('telnyx.ready', () => { 
          if (!disposed) { 
            setReady('ready'); 
            setStatus('Ready'); 
            addLog('Telnyx client ready');
          }
        });

        client.on('telnyx.error', (e: any) => { 
          if (!disposed) {
            const errorMessage = e?.message || e?.error?.message || JSON.stringify(e?.error) || 'Unknown error';
            const errorCode = e?.code || e?.error?.code || 'No code';
            
            addLog(`Telnyx error [${errorCode}]: ${errorMessage}`);
            console.error('Full error object:', e);
            
            // Don't set status to error for call-related errors that are handled
            if (errorCode !== 'CALL_ENDED' && errorCode !== 'CALL_HANGUP' && errorCode !== -32002) {
              setReady('error'); 
              setStatus(`Error: ${errorMessage}`);
            }
          }
        });

        client.on('callUpdate', (call: Call) => {
          if (disposed) return;
          
          const callState = (call as any).state || (call as any).status || 'unknown';
          const callDirection = (call as any).direction || 'unknown';
          const callId = (call as any).id || 'unknown';
          
          addLog(`Call update: ${callDirection} call ${callId} is ${callState}`);

          // Handle call end states
          if (['ended', 'hangup', 'rejected', 'failed'].includes(callState.toLowerCase())) {
            addLog(`Call ended with state: ${callState}`);
            setActiveCall(null);
            setStatus('Ready');
            setMuted(false);
            return;
          }

          const stream: MediaStream | undefined = (call as any).remoteStream || (call as any).remoteMediaStream;
          if (remoteAudioRef.current && stream) {
            (remoteAudioRef.current as any).srcObject = stream;
            remoteAudioRef.current.play().catch((err) => {
              addLog(`Audio play failed: ${err.message}`);
            });
          }
          
          setActiveCall(call);
          setStatus(formatStatus(call));
        });

        // Enhanced event listeners
        client.on('telnyx.socket.open', () => addLog('WebSocket opened'));
        client.on('telnyx.socket.close', (e: any) => {
          addLog(`WebSocket closed: ${e?.code || 'unknown'} - ${e?.reason || 'no reason'}`);
        });
        client.on('telnyx.socket.error', (e: any) => {
          addLog(`WebSocket error: ${e?.message || 'unknown'}`);
          console.error('WebSocket error details:', e);
        });

        // Call-specific events
        client.on('call.hangup', (call: Call) => {
          addLog('Call hangup event received');
          setActiveCall(null);
          setStatus('Ready');
          setMuted(false);
        });

        client.on('call.ended', (call: Call) => {
          addLog('Call ended event received');
          setActiveCall(null);
          setStatus('Ready');
          setMuted(false);
        });

        clientRef.current = client;
        addLog('Connecting to Telnyx...');
        client.connect();
      } catch (e: any) {
        addLog(`Initialization error: ${e?.message ?? 'Init failed'}`);
        console.error('Initialization error details:', e);
        setReady('error');
        setStatus(`Error: ${e?.message ?? 'Init failed'}`);
      }
    })();
    
    return () => { 
      disposed = true; 
      if (clientRef.current) {
        addLog('Disconnecting client...');
        try {
          clientRef.current.disconnect(); 
        } catch (e: any) {
          addLog(`Disconnect error: ${e.message}`);
        }
        clientRef.current = null;
      }
    };
  }, []);

  const call = async () => {
    if (!clientRef.current || !dest) {
      addLog('Cannot call: client not ready or no destination');
      return;
    }
    
    try {
      addLog(`Initiating outbound call to ${dest} via backend...`);
      setStatus('Initiating call...');
      
      // First, create the call through your backend API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/telnyx/calls/outbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: dest })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend call failed (${response.status}): ${errorText}`);
      }
      
      const result = await response.json();
      addLog(`Backend call initiated successfully: ${result?.data?.id || 'unknown ID'}`);
      
      // The call should now appear through WebRTC events
      // Don't use client.newCall() for outbound calls initiated via backend
      setStatus('Call initiated - waiting for connection...');
      
    } catch (error: any) {
      addLog(`Call initiation failed: ${error.message}`);
      console.error('Call initiation error:', error);
      setStatus('Ready');
    }
  };

  const answer = () => {
    if (!activeCall) {
      addLog('No active call to answer');
      return;
    }
    addLog('Answering call...');
    try {
      activeCall.answer();
    } catch (error: any) {
      addLog(`Answer failed: ${error.message}`);
      console.error('Answer error:', error);
    }
  };

  const hangup = async () => {
    if (!activeCall) {
      addLog('No active call to hangup');
      return;
    }
    
    const callId = (activeCall as any).id || (activeCall as any).callID;
    addLog(`Hanging up call: ${callId}`);
    
    try {
      // For calls initiated via backend, use backend hangup
      if (callId) {
        addLog('Using backend hangup...');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/telnyx/calls/${callId}/hangup`, {
          method: 'POST',
        });
        
        if (!response.ok) {
          throw new Error(`Backend hangup failed: ${response.status}`);
        }
        
        addLog('Backend hangup successful');
      } else {
        // Fallback to WebRTC hangup
        addLog('Using WebRTC hangup...');
        activeCall.hangup();
      }
      
    } catch (error: any) {
      addLog(`Hangup failed: ${error.message}`);
      console.error('Hangup error:', error);
      
      // Still try WebRTC hangup as fallback
      try {
        activeCall.hangup();
      } catch (fallbackError: any) {
        addLog(`WebRTC hangup also failed: ${fallbackError.message}`);
      }
      
      // Reset state on error
      setActiveCall(null);
      setStatus('Ready');
      setMuted(false);
    }
  };

  const toggleMute = async () => { 
    if (!activeCall) {
      addLog('No active call to mute/unmute');
      return;
    }
    try {
      await (activeCall as any).toggleAudioMute(); 
      setMuted(!muted);
      addLog(`Call ${muted ? 'unmuted' : 'muted'}`);
    } catch (error: any) {
      addLog(`Mute toggle failed: ${error.message}`);
      console.error('Mute toggle error:', error);
    }
  };

  const sendDTMF = (d: string) => {
    if (!activeCall) {
      addLog(`Cannot send DTMF ${d}: no active call`);
      return;
    }
    addLog(`Sending DTMF: ${d}`);
    try {
      (activeCall as any)?.dtmf?.(d);
    } catch (error: any) {
      addLog(`DTMF send failed: ${error.message}`);
      console.error('DTMF error:', error);
    }
  };

  return (
    <div className="w-[450px] rounded-2xl bg-white shadow-xl p-5 grid gap-3 text-black">
      <h2 className="text-xl font-semibold">Haraz • Telnyx Phone</h2>
      <div className="text-xs">Status: <span className="font-medium">{status}</span></div>

      <input
        className="h-11 px-3 rounded-xl border border-slate-300 outline-none placeholder:text-black/40 text-black"
        placeholder="+15556667777"
        value={dest}
        onChange={(e) => setDest(e.target.value)}
      />

      <div className="grid grid-flow-col gap-2">
        <Btn onClick={call} disabled={ready !== 'ready' || status !== 'Ready'} color="sky" textBlack>Call</Btn>
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
      
      <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
        <h3 className="text-sm font-medium mb-2">Debug Log:</h3>
        <div className="text-xs space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-400">No logs yet...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-gray-600 font-mono">{log}</div>
            ))
          )}
        </div>
      </div>
      
      <p className="text-xs">Outbound calls are initiated via backend API, then connected via WebRTC.</p>
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