import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_MODES, ADAPTIVE_CONFIG } from '../adaptiveCallConfig.js';
import { evaluateQualitySample, stepModeStateMachine } from '../adaptiveCallStateMachine.js';

describe('Phase 3 Pure State Machine - evaluateQualitySample', () => {
  it('identifies bad video samples on high loss (> 8%)', () => {
    const res = evaluateQualitySample(CALL_MODES.VIDEO, { packetLoss: 8.5, rtt: 100, bitrate: 400000 });
    assert.equal(res.isBad, true);
    assert.match(res.badReason, /Packet loss/);
  });

  it('identifies bad video samples on high RTT (> 800 ms)', () => {
    const res = evaluateQualitySample(CALL_MODES.VIDEO, { packetLoss: 1.0, rtt: 850, bitrate: 400000 });
    assert.equal(res.isBad, true);
    assert.match(res.badReason, /Latency/);
  });

  it('identifies bad video samples on low bitrate (< 150 kbps)', () => {
    const res = evaluateQualitySample(CALL_MODES.VIDEO, { packetLoss: 1.0, rtt: 100, bitrate: 120000 });
    assert.equal(res.isBad, true);
    assert.match(res.badReason, /Bitrate/);
  });

  it('identifies bad audio samples on loss > 20%', () => {
    const res = evaluateQualitySample(CALL_MODES.AUDIO_ONLY, { packetLoss: 22.0, rtt: 200 });
    assert.equal(res.isBad, true);
    assert.match(res.badReason, /Audio packet loss/);
  });

  it('identifies bad audio samples on disconnected > 5s', () => {
    const res = evaluateQualitySample(CALL_MODES.AUDIO_ONLY, { packetLoss: 0, rtt: 100, disconnectedSeconds: 5.5 });
    assert.equal(res.isBad, true);
    assert.match(res.badReason, /disconnected/);
  });
});

describe('Phase 3 Pure State Machine - stepModeStateMachine Hysteresis & Transitions', () => {
  it('steps down from VIDEO to AUDIO_ONLY after exactly 3 consecutive bad samples', () => {
    const badStats = { packetLoss: 12.0, rtt: 200, bitrate: 400000 };

    // Sample 1: Bad
    const s1 = stepModeStateMachine({
      currentMode: CALL_MODES.VIDEO,
      stats: badStats,
      consecutiveBad: 0,
      consecutiveGood: 0,
    });
    assert.equal(s1.nextMode, CALL_MODES.VIDEO);
    assert.equal(s1.nextBadCount, 1);
    assert.equal(s1.transitioned, false);

    // Sample 2: Bad
    const s2 = stepModeStateMachine({
      currentMode: CALL_MODES.VIDEO,
      stats: badStats,
      consecutiveBad: s1.nextBadCount,
      consecutiveGood: s1.nextGoodCount,
    });
    assert.equal(s2.nextMode, CALL_MODES.VIDEO);
    assert.equal(s2.nextBadCount, 2);
    assert.equal(s2.transitioned, false);

    // Sample 3: Bad -> Step Down Triggered!
    const s3 = stepModeStateMachine({
      currentMode: CALL_MODES.VIDEO,
      stats: badStats,
      consecutiveBad: s2.nextBadCount,
      consecutiveGood: s2.nextGoodCount,
    });
    assert.equal(s3.nextMode, CALL_MODES.AUDIO_ONLY);
    assert.equal(s3.nextBadCount, 0);
    assert.equal(s3.transitioned, true);
    assert.equal(s3.direction, 'down');
  });

  it('prevents flapping: an intermittent good sample resets the bad streak', () => {
    const badStats = { packetLoss: 10.0, rtt: 100, bitrate: 400000 };
    const goodStats = { packetLoss: 1.0, rtt: 100, bitrate: 500000 };

    // 2 consecutive bad samples
    const s1 = stepModeStateMachine({ currentMode: CALL_MODES.VIDEO, stats: badStats, consecutiveBad: 0 });
    const s2 = stepModeStateMachine({ currentMode: CALL_MODES.VIDEO, stats: badStats, consecutiveBad: s1.nextBadCount });
    assert.equal(s2.nextBadCount, 2);

    // 1 good sample arrives
    const s3 = stepModeStateMachine({ currentMode: CALL_MODES.VIDEO, stats: goodStats, consecutiveBad: s2.nextBadCount });
    assert.equal(s3.nextMode, CALL_MODES.VIDEO);
    assert.equal(s3.transitioned, false);
    // Bad streak must be reset or decremented, never stepping down
    assert.ok(s3.nextBadCount < 2);
  });

  it('steps down from AUDIO_ONLY to VOICE_NOTE after 3 consecutive bad audio samples', () => {
    const severeLoss = { packetLoss: 25.0, rtt: 1500, bitrate: 50000 };

    let currentMode = CALL_MODES.AUDIO_ONLY;
    let badCount = 0;
    let res = null;

    for (let i = 0; i < 3; i++) {
      res = stepModeStateMachine({
        currentMode,
        stats: severeLoss,
        consecutiveBad: badCount,
        consecutiveGood: 0,
      });
      badCount = res.nextBadCount;
      currentMode = res.nextMode;
    }

    assert.equal(res.nextMode, CALL_MODES.VOICE_NOTE);
    assert.equal(res.transitioned, true);
    assert.equal(res.direction, 'down');
  });

  it('steps down from VOICE_NOTE to TEXT after 2 failed voice note uploads', () => {
    const res = stepModeStateMachine({
      currentMode: CALL_MODES.VOICE_NOTE,
      stats: { packetLoss: 0, rtt: 100 },
      consecutiveBad: 0,
      consecutiveGood: 0,
      failedUploads: 2,
    });

    assert.equal(res.nextMode, CALL_MODES.TEXT);
    assert.equal(res.transitioned, true);
    assert.equal(res.direction, 'down');
    assert.match(res.reason, /failed 2 consecutive times/);
  });

  it('steps up after 10 consecutive good samples, one step at a time', () => {
    const solidStats = { packetLoss: 0.5, rtt: 120, bitrate: 450000, disconnectedSeconds: 0 };

    let badCount = 0;
    let goodCount = 0;
    let currentMode = CALL_MODES.AUDIO_ONLY;
    let transitioned = false;

    // Run 9 good samples
    for (let i = 1; i <= 9; i++) {
      const res = stepModeStateMachine({
        currentMode,
        stats: solidStats,
        consecutiveBad: badCount,
        consecutiveGood: goodCount,
      });
      assert.equal(res.nextMode, CALL_MODES.AUDIO_ONLY);
      assert.equal(res.transitioned, false);
      goodCount = res.nextGoodCount;
      assert.equal(goodCount, i);
    }

    // 10th good sample -> Steps up to VIDEO!
    const stepUpRes = stepModeStateMachine({
      currentMode,
      stats: solidStats,
      consecutiveBad: 0,
      consecutiveGood: 9,
    });

    assert.equal(stepUpRes.nextMode, CALL_MODES.VIDEO);
    assert.equal(stepUpRes.transitioned, true);
    assert.equal(stepUpRes.direction, 'up');
    assert.equal(stepUpRes.nextGoodCount, 0);
  });
});
