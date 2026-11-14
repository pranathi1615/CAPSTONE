/**
 * CareBridge Phase 3 Quality Monitor Hook
 * 
 * Requirement:
 * 'Quality monitor (frontend): every 2 s read RTCPeerConnection.getStats();
 * compute packet loss (deltas of packetsLost and packetsReceived), RTT, jitter,
 * available outgoing bitrate; keep a short rolling window.'
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ADAPTIVE_CONFIG } from './adaptiveCallConfig';

export function useQualityMonitor({
  peerConnection,
  currentMode,
  enabled = true,
  onQualityUpdate,
}) {
  const [stats, setStats] = useState({
    packetLoss: 0,
    rtt: 0,
    jitter: 0,
    bitrate: 0,
    disconnectedSeconds: 0,
    timestamp: Date.now(),
  });

  const [rollingHistory, setRollingHistory] = useState([]);
  const [simulatedStats, setSimulatedStats] = useState(null);

  // References to preserve state between getStats samples
  const prevStatsRef = useRef({
    timestamp: null,
    bytesSent: 0,
    packetsReceived: 0,
    packetsLost: 0,
    disconnectedSince: null,
  });

  const simulatedStatsRef = useRef(simulatedStats);
  useEffect(() => {
    simulatedStatsRef.current = simulatedStats;
  }, [simulatedStats]);

  const readStats = useCallback(async () => {
    const now = Date.now();

    // 1. If Dev Simulator is overriding stats, use injected stats directly
    if (simulatedStatsRef.current) {
      const injected = {
        ...simulatedStatsRef.current,
        timestamp: now,
      };
      setStats(injected);
      setRollingHistory((prev) => {
        const next = [...prev, injected];
        return next.slice(-ADAPTIVE_CONFIG.ROLLING_WINDOW_SIZE);
      });
      if (onQualityUpdate) {
        onQualityUpdate(injected);
      }
      return;
    }

    // 2. If no active WebRTC peer connection, track disconnected state
    if (!peerConnection || peerConnection.signalingState === 'closed') {
      const disconnectedSec = prevStatsRef.current.disconnectedSince
        ? (now - prevStatsRef.current.disconnectedSince) / 1000
        : 0;
      const emptyStats = {
        packetLoss: 0,
        rtt: 0,
        jitter: 0,
        bitrate: 0,
        disconnectedSeconds: disconnectedSec,
        timestamp: now,
      };
      setStats(emptyStats);
      if (onQualityUpdate) onQualityUpdate(emptyStats);
      return;
    }

    // Check connection health
    const connState = peerConnection.connectionState || peerConnection.iceConnectionState;
    if (connState === 'disconnected' || connState === 'failed') {
      if (!prevStatsRef.current.disconnectedSince) {
        prevStatsRef.current.disconnectedSince = now;
      }
    } else if (connState === 'connected' || connState === 'completed') {
      prevStatsRef.current.disconnectedSince = null;
    }

    const disconnectedSec = prevStatsRef.current.disconnectedSince
      ? (now - prevStatsRef.current.disconnectedSince) / 1000
      : 0;

    try {
      const rawStats = await peerConnection.getStats();
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;
      let totalBytesSent = 0;
      let currentRtt = 0;
      let maxJitter = 0;

      rawStats.forEach((report) => {
        // Inbound audio and video streams
        if (report.type === 'inbound-rtp' && !report.isRemote) {
          if (typeof report.packetsLost === 'number') {
            totalPacketsLost += report.packetsLost;
          }
          if (typeof report.packetsReceived === 'number') {
            totalPacketsReceived += report.packetsReceived;
          }
          if (typeof report.jitter === 'number') {
            maxJitter = Math.max(maxJitter, report.jitter * 1000); // ms
          }
        }

        // Selected active candidate pair for RTT
        if (
          report.type === 'candidate-pair' &&
          (report.state === 'succeeded' || report.nominated === true)
        ) {
          if (typeof report.currentRoundTripTime === 'number') {
            currentRtt = report.currentRoundTripTime * 1000; // ms
          } else if (typeof report.totalRoundTripTime === 'number' && report.responsesReceived > 0) {
            currentRtt = (report.totalRoundTripTime / report.responsesReceived) * 1000;
          }
        }

        // Outbound streams for bitrate calculation
        if (report.type === 'outbound-rtp' && !report.isRemote) {
          if (typeof report.bytesSent === 'number') {
            totalBytesSent += report.bytesSent;
          }
        }
      });

      // Compute Deltas
      const prev = prevStatsRef.current;
      let packetLossPercent = 0;
      let outgoingBitrateBps = 0;

      if (prev.timestamp) {
        const timeDeltaSeconds = (now - prev.timestamp) / 1000;
        const deltaLost = Math.max(0, totalPacketsLost - prev.packetsLost);
        const deltaReceived = Math.max(0, totalPacketsReceived - prev.packetsReceived);
        const deltaTotal = deltaLost + deltaReceived;

        if (deltaTotal > 0) {
          packetLossPercent = Math.min(100, Math.max(0, (deltaLost / deltaTotal) * 100));
        }

        if (timeDeltaSeconds > 0) {
          const deltaBytes = Math.max(0, totalBytesSent - prev.bytesSent);
          outgoingBitrateBps = (deltaBytes * 8) / timeDeltaSeconds;
        }
      }

      // Store current as previous for next delta calculation
      prevStatsRef.current = {
        timestamp: now,
        bytesSent: totalBytesSent,
        packetsReceived: totalPacketsReceived,
        packetsLost: totalPacketsLost,
        disconnectedSince: prev.disconnectedSince,
      };

      const computed = {
        packetLoss: Number(packetLossPercent.toFixed(1)),
        rtt: Math.round(currentRtt),
        jitter: Math.round(maxJitter),
        bitrate: Math.round(outgoingBitrateBps),
        disconnectedSeconds: Number(disconnectedSec.toFixed(1)),
        timestamp: now,
      };

      setStats(computed);
      setRollingHistory((prevHistory) => {
        const updated = [...prevHistory, computed];
        return updated.slice(-ADAPTIVE_CONFIG.ROLLING_WINDOW_SIZE);
      });

      if (onQualityUpdate) {
        onQualityUpdate(computed);
      }
    } catch (err) {
      // getStats can fail if peer connection is closing
      console.warn('CareBridge Quality Monitor error:', err);
    }
  }, [peerConnection, onQualityUpdate]);

  useEffect(() => {
    if (!enabled) return;

    // Run immediately and every MONITOR_INTERVAL_MS (2s)
    readStats();
    const interval = setInterval(readStats, ADAPTIVE_CONFIG.MONITOR_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, readStats]);

  return {
    stats,
    rollingHistory,
    simulatedStats,
    setSimulatedStats,
    readStatsNow: readStats,
  };
}
