"""Tests for Cryptographic Append-Only Audit Log Chain."""

import asyncio
import pytest
from app.modules.audit.models import AuditLog
from app.modules.audit.service import append_audit_log, verify_chain


@pytest.mark.asyncio
async def test_audit_chain_monotonic_and_intact():
    """Test sequential append creates an unbroken cryptographic hash chain."""
    await AuditLog.delete_all()

    entry1 = await append_audit_log(
        event_type="TEST_EVENT_1",
        actor_id="actor_1",
        actor_role="admin",
        payload={"action": "init"}
    )
    entry2 = await append_audit_log(
        event_type="TEST_EVENT_2",
        actor_id="actor_2",
        actor_role="patient",
        payload={"action": "consent"}
    )
    entry3 = await append_audit_log(
        event_type="TEST_EVENT_3",
        actor_id="actor_3",
        actor_role="doctor",
        payload={"action": "approve"}
    )

    assert entry1.seq == 1
    assert entry2.seq == 2
    assert entry3.seq == 3
    assert entry2.prev_hash == entry1.hash
    assert entry3.prev_hash == entry2.hash

    verification = await verify_chain()
    assert verification["valid"] is True
    assert verification["count"] == 3


@pytest.mark.asyncio
async def test_audit_chain_tamper_detection():
    """Test that modifying a document's payload in MongoDB is detected by verify_chain."""
    await AuditLog.delete_all()

    await append_audit_log(event_type="E1", actor_id="a1", actor_role="admin", payload={"val": 10})
    await append_audit_log(event_type="E2", actor_id="a2", actor_role="patient", payload={"val": 20})
    await append_audit_log(event_type="E3", actor_id="a3", actor_role="doctor", payload={"val": 30})

    # Intact chain passes
    v_ok = await verify_chain()
    assert v_ok["valid"] is True

    # Tamper with block #2 payload in MongoDB directly
    block_2 = await AuditLog.find_one(AuditLog.seq == 2)
    assert block_2 is not None
    block_2.payload = {"val": 9999}  # Malicious alteration
    await block_2.save()

    # Chain verification MUST fail and identify sequence 2
    v_tampered = await verify_chain()
    assert v_tampered["valid"] is False
    assert v_tampered["broken_at_seq"] == 2
    assert "tampering" in v_tampered["reason"].lower()


@pytest.mark.asyncio
async def test_audit_chain_concurrent_appends():
    """Test concurrent appends handle sequence collisions gracefully without forking."""
    await AuditLog.delete_all()

    async def worker(worker_id: int):
        return await append_audit_log(
            event_type="CONCURRENT_LOG",
            actor_id=f"worker_{worker_id}",
            actor_role="system",
            payload={"worker": worker_id}
        )

    # Launch 10 concurrent inserts
    tasks = [worker(i) for i in range(10)]
    results = await asyncio.gather(*tasks)
    assert len(results) == 10

    # Ensure all sequences from 1 to 10 exist with zero duplicates
    seqs = sorted([r.seq for r in results])
    assert seqs == list(range(1, 11))

    # Verification must pass completely
    verification = await verify_chain()
    assert verification["valid"] is True
    assert verification["count"] == 10
