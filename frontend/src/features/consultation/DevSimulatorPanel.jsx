import React, { useState } from 'react';
import { CALL_MODES } from './adaptiveCallConfig';

/**
 * Dev-Only Simulator Panel for Phase 3 Network Adaptation.
 * Requirement:
 * 'Dev-only panel to force a mode and simulate loss and delay, hidden in production builds.'
 */
export const DevSimulatorPanel = ({
  currentMode,
  peerMode,
  stats,
  badSampleCount = 0,
  goodSampleCount = 0,
  failedUploadCount = 0,
  onForceMode,
  onSimulateStats,
  onResetSimulation,
  onSimulateFailedUpload,
  onSimulateOffline,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loss, setLoss] = useState(stats.packetLoss || 0);
  const [rtt, setRtt] = useState(stats.rtt || 100);
  const [bitrate, setBitrate] = useState(stats.bitrate ? Math.round(stats.bitrate / 1000) : 500);
  const [isThrottlingActive, setIsThrottlingActive] = useState(false);

  // Hidden in production builds
  if (!import.meta.env.DEV && !window.__FORCE_DEV_PANEL__) {
    return null;
  }

  const applyThrottling = (newLoss, newRtt, newBitrateKbps) => {
    setIsThrottlingActive(true);
    onSimulateStats({
      packetLoss: Number(newLoss),
      rtt: Number(newRtt),
      bitrate: Number(newBitrateKbps) * 1000,
      jitter: Math.round(newRtt * 0.15),
      disconnectedSeconds: 0,
    });
  };

  const handleReset = () => {
    setIsThrottlingActive(false);
    setLoss(0);
    setRtt(100);
    setBitrate(500);
    onResetSimulation();
  };

  return (
    <div
      data-testid="dev-simulator-panel"
      className="fixed bottom-20 left-4 z-40 bg-slate-900/95 text-white border border-amber-500/50 rounded-xl shadow-2xl backdrop-blur-md max-w-xs w-full text-xs font-mono transition-all"
    >
      {/* Header / Toggle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-800/80 rounded-t-xl cursor-pointer border-b border-slate-700 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span className="font-bold text-amber-400 tracking-wide">
            🛠️ DEV NETWORK SIMULATOR
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-300">
            {currentMode}
          </span>
          <span className="text-slate-400">{isOpen ? '▼' : '▲'}</span>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Live Metrics readout */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800 text-[11px]">
            <div>Loss: <strong className="text-amber-300">{stats.packetLoss || 0}%</strong></div>
            <div>RTT: <strong className="text-amber-300">{stats.rtt || 0} ms</strong></div>
            <div>Bitrate: <strong className="text-amber-300">{Math.round((stats.bitrate || 0) / 1000)} kbps</strong></div>
            <div>Jitter: <strong className="text-amber-300">{stats.jitter || 0} ms</strong></div>
            <div>Bad Streak: <strong className="text-rose-400">{badSampleCount}/3</strong></div>
            <div>Good Streak: <strong className="text-emerald-400">{goodSampleCount}/10</strong></div>
            <div>Failed Uploads: <strong className="text-orange-400">{failedUploadCount}/2</strong></div>
            <div>Peer Mode: <strong className="text-sky-300">{peerMode}</strong></div>
          </div>

          {/* Quick 2G / Degraded Presets */}
          <div>
            <div className="text-[10px] uppercase text-slate-400 mb-1 font-semibold">Simulate Conditions:</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLoss(15);
                  setRtt(1200);
                  setBitrate(90);
                  applyThrottling(15, 1200, 90);
                }}
                className="bg-rose-900/60 hover:bg-rose-800 border border-rose-600/60 text-rose-200 px-2 py-1 rounded text-[10px]"
              >
                Weak 2G (Loss 15%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoss(1);
                  setRtt(120);
                  setBitrate(600);
                  applyThrottling(1, 120, 600);
                }}
                className="bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-600/60 text-emerald-200 px-2 py-1 rounded text-[10px]"
              >
                Stable 4G / Wi-Fi
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded text-[10px]"
              >
                Reset Real
              </button>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-2 bg-slate-950/40 p-2 rounded-lg border border-slate-800/80">
            <div>
              <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                <span>Packet Loss:</span>
                <span className="font-bold text-amber-300">{loss}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={loss}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLoss(val);
                  applyThrottling(val, rtt, bitrate);
                }}
                className="w-full accent-amber-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                <span>Latency (RTT):</span>
                <span className="font-bold text-amber-300">{rtt} ms</span>
              </div>
              <input
                type="range"
                min="50"
                max="3000"
                step="50"
                value={rtt}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRtt(val);
                  applyThrottling(loss, val, bitrate);
                }}
                className="w-full accent-amber-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-300 mb-0.5">
                <span>Bitrate:</span>
                <span className="font-bold text-amber-300">{bitrate} kbps</span>
              </div>
              <input
                type="range"
                min="30"
                max="1200"
                step="20"
                value={bitrate}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBitrate(val);
                  applyThrottling(loss, rtt, val);
                }}
                className="w-full accent-amber-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Direct Force Mode */}
          <div>
            <div className="text-[10px] uppercase text-slate-400 mb-1 font-semibold">Force Mode Directly:</div>
            <div className="grid grid-cols-4 gap-1">
              {Object.values(CALL_MODES).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onForceMode(m)}
                  className={`px-1.5 py-1 rounded text-[10px] font-bold tracking-tight border ${
                    currentMode === m
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {m === 'AUDIO_ONLY' ? 'AUDIO' : m === 'VOICE_NOTE' ? 'VOICE' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Offline & Voice Note failure triggers */}
          <div className="pt-1 border-t border-slate-800 flex flex-col gap-1.5">
            <button
              type="button"
              data-testid="simulate-failed-voice-note-btn"
              onClick={onSimulateFailedUpload}
              className="w-full bg-amber-950/60 hover:bg-amber-900 border border-amber-700/60 text-amber-200 py-1 px-2 rounded text-[10px] flex items-center justify-between"
            >
              <span>Simulate Voice Upload Failure</span>
              <span className="text-[9px] bg-amber-800 px-1 rounded">+1 count</span>
            </button>

            <button
              type="button"
              data-testid="simulate-offline-15s-btn"
              onClick={() => onSimulateOffline(15)}
              className="w-full bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-200 py-1 px-2 rounded text-[10px] flex items-center justify-between"
            >
              <span>Simulate 15s Offline Gap</span>
              <span className="text-[9px] bg-rose-800 px-1 rounded">Disconnect WS</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
