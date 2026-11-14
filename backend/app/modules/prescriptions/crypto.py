"""Cryptographic services for CareBridge tamper-proof prescriptions.

Implements:
1. Ed25519 digital signature key generation, signing, and verification.
2. Canonical JSON encoding to guarantee deterministic representation.
3. Cryptographic QR code generation with tamper-evident payload.

SECURITY NOTE:
For this capstone project, per-doctor Ed25519 keypairs are generated and stored
in MongoDB with the doctor user record. In a production healthcare system,
private keys must be maintained inside a FIPS 140-2 Level 3 Hardware Security Module
(HSM) or cloud KMS (e.g. AWS KMS / Google Cloud KMS) to prevent key exfiltration.
"""

import base64
import hashlib
import json
import logging
from typing import Any, Dict, Tuple
import io

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
import qrcode
from qrcode.image.pil import PilImage

logger = logging.getLogger(__name__)


def generate_ed25519_keypair() -> Tuple[str, str]:
    """Generate an Ed25519 private/public keypair.

    Returns:
        (private_key_b64, public_key_b64): Raw 32-byte keys encoded in base64.
    """
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    priv_raw = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub_raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )

    priv_b64 = base64.b64encode(priv_raw).decode("utf-8")
    pub_b64 = base64.b64encode(pub_raw).decode("utf-8")
    return priv_b64, pub_b64


def canonicalize_prescription_dict(data: Dict[str, Any]) -> Tuple[str, bytes]:
    """Serialize prescription dictionary into deterministic canonical JSON.

    Sorting keys and enforcing compact separators (',', ':') prevents whitespace
    and key-ordering variations from breaking digital signatures.

    Returns:
        (canonical_json_str, canonical_bytes)
    """
    canonical_str = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return canonical_str, canonical_str.encode("utf-8")


def sign_prescription_data(private_key_b64: str, data_bytes: bytes) -> str:
    """Sign canonical data bytes using doctor's Ed25519 private key.

    Returns:
        Base64-encoded 64-byte Ed25519 signature.
    """
    priv_raw = base64.b64decode(private_key_b64)
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_raw)
    signature_bytes = private_key.sign(data_bytes)
    return base64.b64encode(signature_bytes).decode("utf-8")


def verify_prescription_signature(
    public_key_b64: str,
    data_bytes: bytes,
    signature_b64: str
) -> bool:
    """Verify Ed25519 signature against canonical data bytes using doctor's public key.

    Returns:
        True if signature is mathematically valid and data has not been tampered with.
    """
    try:
        pub_raw = base64.b64decode(public_key_b64)
        public_key = ed25519.Ed25519PublicKey.from_public_bytes(pub_raw)
        sig_raw = base64.b64decode(signature_b64)
        public_key.verify(sig_raw, data_bytes)
        return True
    except (InvalidSignature, Exception) as exc:
        logger.warning("Ed25519 signature verification failed: %s", exc)
        return False


def compute_sha256_hash(data_bytes: bytes) -> str:
    """Compute hex SHA-256 digest of payload."""
    return hashlib.sha256(data_bytes).hexdigest()


def generate_qr_png_bytes(qr_payload_text: str) -> bytes:
    """Generate high-contrast QR code image as PNG bytes.

    Encodes prescription UUID, doctor info, and signature hash for pharmacy scanning.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(qr_payload_text)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
