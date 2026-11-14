/**
 * CareBridge Phase 3 Adaptive Call Pure State Machine
 * 
 * Requirement:
 * 'Mode state machine as a PURE function (stats + current mode in, new mode out).
 * Modes: VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT. Thresholds in one tunable config file.
 * Starting values: leave VIDEO when loss > 8%, or RTT > 800 ms, or bitrate < 150 kbps.
 * Leave AUDIO_ONLY when loss > 20%, or RTT > 2000 ms, or disconnected > 5 s.
 * VOICE_NOTE to TEXT after two failed voice-note uploads.
 * Hysteresis: step down after 3 consecutive bad samples, step up after 10
 * consecutive good samples, one step at a time. Never flap.'
 */

import { ADAPTIVE_CONFIG, CALL_MODES, MODE_HIERARCHY } from './adaptiveCallConfig.js';

/**
 * Evaluates whether a network quality sample is considered 'bad' for current mode
 * or 'good' for potential recovery to an adjacent higher mode.
 */
export function evaluateQualitySample(currentMode, stats = {}, failedUploads = 0, config = ADAPTIVE_CONFIG) {
  const loss = Number(stats.packetLoss || 0);
  const rtt = Number(stats.rtt || 0);
  const bitrate = Number(stats.bitrate || 0);
  const disconnectedSec = Number(stats.disconnectedSeconds || 0);

  // 1. VIDEO Mode evaluation
  if (currentMode === CALL_MODES.VIDEO) {
    const isBad =
      loss > config.VIDEO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT ||
      rtt > config.VIDEO_THRESHOLDS.MAX_RTT_MS ||
      (bitrate > 0 && bitrate < config.VIDEO_THRESHOLDS.MIN_BITRATE_BPS) ||
      disconnectedSec > 2.0;

    let badReason = '';
    if (loss > config.VIDEO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT) {
      badReason = `Packet loss ${loss.toFixed(1)}% exceeded ${config.VIDEO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT}%`;
    } else if (rtt > config.VIDEO_THRESHOLDS.MAX_RTT_MS) {
      badReason = `Latency (RTT) ${Math.round(rtt)} ms exceeded ${config.VIDEO_THRESHOLDS.MAX_RTT_MS} ms`;
    } else if (bitrate > 0 && bitrate < config.VIDEO_THRESHOLDS.MIN_BITRATE_BPS) {
      badReason = `Bitrate ${(bitrate / 1000).toFixed(0)} kbps fell below ${(config.VIDEO_THRESHOLDS.MIN_BITRATE_BPS / 1000).toFixed(0)} kbps`;
    } else if (disconnectedSec > 2.0) {
      badReason = `Connection interrupted for ${disconnectedSec.toFixed(1)} s`;
    }

    return { isBad, badReason, isGoodForStepUp: false };
  }

  // 2. AUDIO_ONLY Mode evaluation
  if (currentMode === CALL_MODES.AUDIO_ONLY) {
    const isBad =
      loss > config.AUDIO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT ||
      rtt > config.AUDIO_THRESHOLDS.MAX_RTT_MS ||
      disconnectedSec > config.AUDIO_THRESHOLDS.MAX_DISCONNECTED_SECONDS;

    let badReason = '';
    if (loss > config.AUDIO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT) {
      badReason = `Audio packet loss ${loss.toFixed(1)}% exceeded ${config.AUDIO_THRESHOLDS.MAX_PACKET_LOSS_PERCENT}%`;
    } else if (rtt > config.AUDIO_THRESHOLDS.MAX_RTT_MS) {
      badReason = `Audio latency ${Math.round(rtt)} ms exceeded ${config.AUDIO_THRESHOLDS.MAX_RTT_MS} ms`;
    } else if (disconnectedSec > config.AUDIO_THRESHOLDS.MAX_DISCONNECTED_SECONDS) {
      badReason = `WebRTC peer disconnected for ${disconnectedSec.toFixed(1)} s (> ${config.AUDIO_THRESHOLDS.MAX_DISCONNECTED_SECONDS} s)`;
    }

    // Qualifies for stepping back up to VIDEO if conditions are solidly healthy
    const isGoodForStepUp =
      loss <= config.RECOVERY_THRESHOLDS.TO_VIDEO.MAX_PACKET_LOSS_PERCENT &&
      rtt <= config.RECOVERY_THRESHOLDS.TO_VIDEO.MAX_RTT_MS &&
      (bitrate === 0 || bitrate >= config.RECOVERY_THRESHOLDS.TO_VIDEO.MIN_BITRATE_BPS) &&
      disconnectedSec === 0;

    return { isBad, badReason, isGoodForStepUp };
  }

  // 3. VOICE_NOTE Mode evaluation
  if (currentMode === CALL_MODES.VOICE_NOTE) {
    const isBad = failedUploads >= config.MAX_FAILED_VOICE_NOTE_UPLOADS;
    const badReason = isBad
      ? `Voice note upload failed ${failedUploads} consecutive times`
      : '';

    // Qualifies for stepping up to AUDIO_ONLY
    const isGoodForStepUp =
      loss <= config.RECOVERY_THRESHOLDS.TO_AUDIO.MAX_PACKET_LOSS_PERCENT &&
      rtt <= config.RECOVERY_THRESHOLDS.TO_AUDIO.MAX_RTT_MS &&
      disconnectedSec === 0;

    return { isBad, badReason, isGoodForStepUp };
  }

  // 4. TEXT Mode evaluation
  if (currentMode === CALL_MODES.TEXT) {
    // TEXT is lowest mode; cannot step down further
    // Qualifies for stepping up to VOICE_NOTE
    const isGoodForStepUp =
      loss <= config.RECOVERY_THRESHOLDS.TO_VOICE_NOTE.MAX_PACKET_LOSS_PERCENT &&
      rtt <= config.RECOVERY_THRESHOLDS.TO_VOICE_NOTE.MAX_RTT_MS;

    return { isBad: false, badReason: '', isGoodForStepUp };
  }

  return { isBad: false, badReason: '', isGoodForStepUp: false };
}

/**
 * Pure state machine transition function.
 * 
 * Takes current state and returns next state deterministically.
 * Enforces:
 * - 3 consecutive bad samples -> step down 1 mode
 * - 10 consecutive good samples -> step up 1 mode
 * - 2 failed voice note uploads -> step down from VOICE_NOTE to TEXT immediately
 * - Hysteresis: one step at a time, strictly preventing flapping.
 * 
 * @param {Object} state Current state object
 * @returns {Object} Next state object
 */
export function stepModeStateMachine({
  currentMode = CALL_MODES.VIDEO,
  stats = {},
  consecutiveBad = 0,
  consecutiveGood = 0,
  failedUploads = 0,
  config = ADAPTIVE_CONFIG,
}) {
  // Guard: immediate fallback from VOICE_NOTE to TEXT upon 2 consecutive upload failures
  if (currentMode === CALL_MODES.VOICE_NOTE && failedUploads >= config.MAX_FAILED_VOICE_NOTE_UPLOADS) {
    return {
      nextMode: CALL_MODES.TEXT,
      nextBadCount: 0,
      nextGoodCount: 0,
      nextFailedUploads: 0,
      transitioned: true,
      direction: 'down',
      reason: `Voice note upload failed ${failedUploads} consecutive times. Auto-downgraded to TEXT mode.`,
    };
  }

  const evaluation = evaluateQualitySample(currentMode, stats, failedUploads, config);
  const currentIndex = MODE_HIERARCHY.indexOf(currentMode);

  // Case 1: Bad network sample detected
  if (evaluation.isBad) {
    const nextBad = consecutiveBad + 1;
    // Reset good streak immediately upon any bad sample (prevents flapping)
    const nextGood = 0;

    // Check if hysteresis threshold (3 consecutive bad samples) is met
    if (nextBad >= config.STEP_DOWN_BAD_SAMPLES_REQUIRED) {
      const lowerIndex = currentIndex + 1;
      if (lowerIndex < MODE_HIERARCHY.length) {
        const nextMode = MODE_HIERARCHY[lowerIndex];
        return {
          nextMode,
          nextBadCount: 0,
          nextGoodCount: 0,
          nextFailedUploads: 0,
          transitioned: true,
          direction: 'down',
          reason: evaluation.badReason || `Degraded network detected over ${config.STEP_DOWN_BAD_SAMPLES_REQUIRED} consecutive samples`,
        };
      }
    }

    // Bad sample registered, but threshold not yet met -> hold current mode
    return {
      nextMode: currentMode,
      nextBadCount: nextBad,
      nextGoodCount: nextGood,
      nextFailedUploads: failedUploads,
      transitioned: false,
      direction: 'none',
      reason: '',
    };
  }

  // Case 2: Good network sample qualifying for stepping up
  if (evaluation.isGoodForStepUp) {
    const nextGood = consecutiveGood + 1;
    // Reset bad streak immediately upon good sample
    const nextBad = 0;

    // Check if recovery hysteresis threshold (10 consecutive good samples) is met
    if (nextGood >= config.STEP_UP_GOOD_SAMPLES_REQUIRED) {
      const higherIndex = currentIndex - 1;
      if (higherIndex >= 0) {
        const nextMode = MODE_HIERARCHY[higherIndex];
        return {
          nextMode,
          nextBadCount: 0,
          nextGoodCount: 0,
          nextFailedUploads: 0,
          transitioned: true,
          direction: 'up',
          reason: `Network recovered and stable over ${config.STEP_UP_GOOD_SAMPLES_REQUIRED} consecutive samples`,
        };
      }
    }

    // Good sample registered, but threshold not yet met -> hold current mode
    return {
      nextMode: currentMode,
      nextBadCount: nextBad,
      nextGoodCount: nextGood,
      nextFailedUploads: failedUploads,
      transitioned: false,
      direction: 'none',
      reason: '',
    };
  }

  // Case 3: Neutral network conditions (neither distinctly bad nor qualifying for step-up)
  return {
    nextMode: currentMode,
    nextBadCount: Math.max(0, consecutiveBad - 1), // gradual decay or maintain
    nextGoodCount: 0,
    nextFailedUploads: failedUploads,
    transitioned: false,
    direction: 'none',
    reason: '',
  };
}
