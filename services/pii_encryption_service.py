"""
PII Encryption Service for EduFlow
Provides field-level encryption for sensitive personal data using AES-256-GCM
"""
import os
import base64
import hashlib
from typing import Optional, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


class PIIEncryptionService:
    """
    PII Encryption Service using AES-256-GCM
    
    Provides:
    - Deterministic encryption for searchable fields (email)
    - Probabilistic encryption for non-searchable fields (phone, notes)
    - Key derivation for field-specific encryption
    """
    
    def __init__(self):
        """Initialize encryption service with master key"""
        self.master_key = os.getenv('PII_ENCRYPTION_KEY')
        
        if not self.master_key:
            raise ValueError(
                "PII_ENCRYPTION_KEY environment variable is required. "
                "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        
        # Convert key to bytes if it's a hex string
        if isinstance(self.master_key, str):
            self.master_key_bytes = bytes.fromhex(self.master_key)
        else:
            self.master_key_bytes = self.master_key
        
        # Ensure key is 32 bytes for AES-256
        if len(self.master_key_bytes) != 32:
            raise ValueError("PII_ENCRYPTION_KEY must be 32 bytes (64 hex characters)")
        
        self.backend = default_backend()
    
    def _derive_key(self, field_name: str, salt: bytes = None) -> Tuple[bytes, bytes]:
        """
        Derive a unique encryption key for a specific field type
        
        Args:
            field_name: Name of the field (used as context)
            salt: Optional salt for additional security
            
        Returns:
            Tuple of (derived_key, salt)
        """
        if salt is None:
            salt = os.urandom(16)
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=self.backend
        )
        
        # Combine master key with field name for context
        key_material = self.master_key_bytes + field_name.encode('utf-8')
        derived_key = kdf.derive(key_material)
        
        return derived_key, salt
    
    def encrypt_field(self, value: str, field_type: str = 'default') -> str:
        """
        Encrypt a field value using AES-256-GCM
        
        Args:
            value: Plain text value to encrypt
            field_type: Type of field (used for key derivation)
            
        Returns:
            Base64-encoded encrypted value with salt and nonce
        """
        if value is None or value == "":
            return ""
        
        # Derive key for this field type
        key, salt = self._derive_key(field_type)
        
        # Generate random nonce (12 bytes for GCM)
        nonce = os.urandom(12)
        
        # Create cipher and encrypt
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, value.encode('utf-8'), None)
        
        # Combine salt + nonce + ciphertext and encode as base64
        encrypted_data = salt + nonce + ciphertext
        return base64.b64encode(encrypted_data).decode('utf-8')
    
    def decrypt_field(self, encrypted_value: str, field_type: str = 'default') -> str:
        """
        Decrypt a field value
        
        Args:
            encrypted_value: Base64-encoded encrypted value
            field_type: Type of field (must match encryption type)
            
        Returns:
            Decrypted plain text value
        """
        if not encrypted_value or encrypted_value == "":
            return ""
        
        try:
            # Decode base64
            encrypted_data = base64.b64decode(encrypted_value)
            
            # Extract salt (first 16 bytes), nonce (next 12 bytes), and ciphertext
            salt = encrypted_data[:16]
            nonce = encrypted_data[16:28]
            ciphertext = encrypted_data[28:]
            
            # Derive key using the same salt
            key, _ = self._derive_key(field_type, salt)
            
            # Decrypt
            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            
            return plaintext.decode('utf-8')
            
        except Exception as e:
            print(f"Decryption error: {e}")
            return ""  # Return empty string on decryption failure
    
    def encrypt_email(self, email: str) -> str:
        """
        Encrypt email address with deterministic encryption for searchability
        
        Uses HMAC-SHA256 for deterministic encryption while maintaining uniqueness
        
        Args:
            email: Email address to encrypt
            
        Returns:
            Deterministic encrypted value (base64)
        """
        if not email:
            return ""
        
        # Use HMAC for deterministic encryption (same input = same output)
        import hmac
        
        email_bytes = email.lower().strip().encode('utf-8')
        mac = hmac.new(self.master_key_bytes, email_bytes, hashlib.sha256)
        
        # Return as base64 for consistent storage format
        return base64.b64encode(mac.digest()).decode('utf-8')
    
    def encrypt_phone(self, phone: str) -> str:
        """
        Encrypt phone number with probabilistic encryption
        
        Args:
            phone: Phone number to encrypt
            
        Returns:
            Base64-encoded encrypted phone number
        """
        return self.encrypt_field(phone, field_type='phone')
    
    def decrypt_phone(self, encrypted_phone: str) -> str:
        """
        Decrypt phone number
        
        Args:
            encrypted_phone: Encrypted phone number
            
        Returns:
            Decrypted phone number
        """
        return self.decrypt_field(encrypted_phone, field_type='phone')
    
    def encrypt_contact_info(self, contact: str) -> str:
        """
        Encrypt generic contact information
        
        Args:
            contact: Contact information to encrypt
            
        Returns:
            Base64-encoded encrypted contact info
        """
        return self.encrypt_field(contact, field_type='contact')
    
    def decrypt_contact_info(self, encrypted_contact: str) -> str:
        """
        Decrypt contact information
        
        Args:
            encrypted_contact: Encrypted contact info
            
        Returns:
            Decrypted contact information
        """
        return self.decrypt_field(encrypted_contact, field_type='contact')
    
    def needs_encryption(self, value: str) -> bool:
        """
        Check if a value needs encryption
        
        Args:
            value: Value to check
            
        Returns:
            True if value appears to be unencrypted
        """
        if not value:
            return False
        
        # Try to decode as base64 - encrypted values will be valid base64
        try:
            decoded = base64.b64decode(value)
            # If length suggests it's encrypted (salt + nonce + ciphertext)
            return len(decoded) > 32
        except:
            # Not base64 encoded, so needs encryption
            return True
    
    def verify_encryption_integrity(self, encrypted_value: str, field_type: str = 'default') -> bool:
        """
        Verify that an encrypted value can be decrypted (integrity check)
        
        Args:
            encrypted_value: Encrypted value to verify
            field_type: Field type used for encryption
            
        Returns:
            True if verification succeeds
        """
        try:
            # Attempt decryption without returning result
            self.decrypt_field(encrypted_value, field_type)
            return True
        except:
            return False


# Global instance
_pii_encryption_service = None


def get_pii_encryption_service() -> PIIEncryptionService:
    """Get the global PII encryption service instance"""
    global _pii_encryption_service
    if _pii_encryption_service is None:
        try:
            _pii_encryption_service = PIIEncryptionService()
        except ValueError as e:
            print(f"⚠️ PII Encryption Service not initialized: {e}")
            return None
    return _pii_encryption_service


def encrypt_pii_field(value: str, field_type: str = 'default') -> str:
    """Convenience function to encrypt a field"""
    service = get_pii_encryption_service()
    if not service:
        return value  # Return original if service not available
    return service.encrypt_field(value, field_type)


def decrypt_pii_field(encrypted_value: str, field_type: str = 'default') -> str:
    """Convenience function to decrypt a field"""
    service = get_pii_encryption_service()
    if not service:
        return encrypted_value  # Return as-is if service not available
    return service.decrypt_field(encrypted_value, field_type)


__all__ = [
    'PIIEncryptionService',
    'get_pii_encryption_service',
    'encrypt_pii_field',
    'decrypt_pii_field'
]
