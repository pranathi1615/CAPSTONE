/**
 * CareBridge Phase 3 Adaptive Call Tunable Configuration
 * 
 * Central thresholds for network degradation and recovery:
 * - Four consultation modes: VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT
 * - Quality monitor sampling interval: 2000 ms (2 seconds)
 * - Step-down threshold: 3 consecutive bad samples
 * - Step-up threshold: 10 consecutive good samples
 * - Max failed voice note uploads before stepping down to TEXT: 2
 * - One step at a time, strictly preventing flapping.
 */

export const CALL_MODES = Object.freeze({
  VIDEO: 'VIDEO',
  AUDIO_ONLY: 'AUDIO_ONLY',
  VOICE_NOTE: 'VOICE_NOTE',
  TEXT: 'TEXT',
});

// Mode hierarchy for stepping down and stepping up
export const MODE_HIERARCHY = [
  CALL_MODES.VIDEO,
  CALL_MODES.AUDIO_ONLY,
  CALL_MODES.VOICE_NOTE,
  CALL_MODES.TEXT,
];

export const ADAPTIVE_CONFIG = {
  // Quality sampling frequency (ms)
  MONITOR_INTERVAL_MS: 2000,

  // Rolling statistics history buffer length
  ROLLING_WINDOW_SIZE: 15,

  // Hysteresis counters
  STEP_DOWN_BAD_SAMPLES_REQUIRED: 3,
  STEP_UP_GOOD_SAMPLES_REQUIRED: 10,

  // Consecutive failed voice note uploads to force TEXT mode
  MAX_FAILED_VOICE_NOTE_UPLOADS: 2,

  // Video Mode Leave Thresholds (any violation counts as a bad sample for VIDEO)
  VIDEO_THRESHOLDS: {
    MAX_PACKET_LOSS_PERCENT: 8.0, // Loss > 8%
    MAX_RTT_MS: 800,              // RTT > 800 ms
    MIN_BITRATE_BPS: 150000,      // Bitrate < 150 kbps
  },

  // Audio-Only Mode Leave Thresholds (any violation counts as a bad sample for AUDIO_ONLY)
  AUDIO_THRESHOLDS: {
    MAX_PACKET_LOSS_PERCENT: 20.0, // Loss > 20%
    MAX_RTT_MS: 2000,              // RTT > 2000 ms
    MAX_DISCONNECTED_SECONDS: 5.0, // Disconnected > 5 seconds
  },

  // Step-Up Recovery Qualification Criteria (must satisfy all to count as a good sample)
  RECOVERY_THRESHOLDS: {
    // To step up from AUDIO_ONLY -> VIDEO
    TO_VIDEO: {
      MAX_PACKET_LOSS_PERCENT: 4.0, // Safety margin below 8%
      MAX_RTT_MS: 500,              // Well below 800ms
      MIN_BITRATE_BPS: 250000,      // Sufficient bandwidth for video
    },
    // To step up from VOICE_NOTE -> AUDIO_ONLY
    TO_AUDIO: {
      MAX_PACKET_LOSS_PERCENT: 10.0,
      MAX_RTT_MS: 1200,
    },
    // To step up from TEXT -> VOICE_NOTE
    TO_VOICE_NOTE: {
      MAX_PACKET_LOSS_PERCENT: 18.0,
      MAX_RTT_MS: 1800,
    }
  },

  // Audio bitrate constraints when stepping down to AUDIO_ONLY (bps)
  AUDIO_ONLY_TARGET_BITRATE_BPS: 24000,
};
