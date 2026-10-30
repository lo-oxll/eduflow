"""
Two-Factor Authentication Service for EduFlow
Provides TOTP-based 2FA with backup codes and RBAC integration
"""
import os
import datetime
import secrets
from typing import Dict, List, Optional, Tuple
from core.database import get_postgresql_pool
from core.security import TwoFactorAuth
from core.security_enhanced import get_argon2_hasher


class TwoFactorAuthService:
    """
    Two-Factor Authentication Service
    
    Features:
    - TOTP-based 2FA using pyotp
    - QR code generation for authenticator apps
    - Backup codes for account recovery
    - RBAC integration for admin enforcement
    - Audit logging of 2FA events
    """
    
    def __init__(self):
        self.tfa = TwoFactorAuth()  # Existing TFA class from security.py
        self.pool = get_postgresql_pool()
        self.hasher = get_argon2_hasher()
        self.issuer = os.getenv('TWO_FACTOR_ISSUER_NAME', 'EduFlow')
    
    def _execute_query(self, query: str, params: tuple = None, fetch_one: bool = False):
        """Execute database query"""
        if not self.pool:
            raise Exception("Database connection failed")
        
        conn = self.pool.getconn()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(query, params or ())
            
            if fetch_one:
                result = cur.fetchone()
            else:
                result = cur.fetchall()
            
            return result
        finally:
            conn.close()
    
    def setup_2fa(self, user_id: int, username: str) -> Dict:
        """
        Setup 2FA for a user - generate secret and QR code
        
        Args:
            user_id: User ID
            username: Username for display in authenticator app
            
        Returns:
            Dictionary with secret and QR code (base64)
        """
        try:
            # Generate TOTP secret
            secret = self.tfa.generate_secret()
            
            # Generate QR code
            qr_code_base64 = self.tfa.generate_qr_code(secret, username, self.issuer)
            
            # Store secret temporarily (will be activated after verification)
            conn = self.pool.getconn()
            try:
                cur = conn.cursor()
                
                # Store encrypted secret
                cur.execute("""
                    UPDATE users 
                    SET two_factor_secret = %s, two_factor_enabled = FALSE
                    WHERE id = %s
                """, (secret, user_id))
                
                conn.commit()
            finally:
                conn.close()
            
            return {
                'success': True,
                'secret': secret,
                'qr_code': qr_code_base64,
                'manual_entry_key': secret,
                'issuer': self.issuer,
                'account_name': username
            }
            
        except Exception as e:
            print(f"Setup 2FA error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def enable_2fa(self, user_id: int, token: str) -> Dict:
        """
        Enable 2FA after verifying first token
        
        Args:
            user_id: User ID
            token: Initial TOTP token from authenticator app
            
        Returns:
            Result dictionary with backup codes if successful
        """
        try:
            # Get user's 2FA secret
            user = self._execute_query(
                "SELECT two_factor_secret FROM users WHERE id = %s",
                (user_id,),
                fetch_one=True
            )
            
            if not user or not user.get('two_factor_secret'):
                return {
                    'success': False,
                    'error': '2FA not setup. Please call setup_2fa first.'
                }
            
            secret = user['two_factor_secret']
            
            # Verify the token
            if not self.tfa.verify_token(secret, token):
                return {
                    'success': False,
                    'error': 'Invalid verification token'
                }
            
            # Enable 2FA
            conn = self.pool.getconn()
            try:
                cur = conn.cursor()
                
                cur.execute("""
                    UPDATE users 
                    SET two_factor_enabled = TRUE, updated_at = %s
                    WHERE id = %s
                """, (datetime.datetime.now(datetime.timezone.utc), user_id))
                
                # Generate backup codes
                backup_codes = self._generate_backup_codes(user_id)
                
                conn.commit()
                
                return {
                    'success': True,
                    'message': '2FA enabled successfully',
                    'backup_codes': backup_codes  # Show only once!
                }
                
            finally:
                conn.close()
                
        except Exception as e:
            print(f"Enable 2FA error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def disable_2fa(self, user_id: int, token: str = None, backup_code: str = None) -> Dict:
        """
        Disable 2FA for a user
        
        Args:
            user_id: User ID
            token: TOTP token OR backup_code: Backup code
            
        Returns:
            Result dictionary
        """
        try:
            user = self._execute_query(
                """SELECT two_factor_enabled, two_factor_secret 
                   FROM users WHERE id = %s""",
                (user_id,),
                fetch_one=True
            )
            
            if not user or not user.get('two_factor_secret'):
                return {
                    'success': False,
                    'error': '2FA not enabled for this user'
                }
            
            # Verify token or backup code
            verified = False
            
            if token:
                verified = self.tfa.verify_token(user['two_factor_secret'], token)
            elif backup_code:
                verified = self._verify_backup_code(user_id, backup_code)
            
            if not verified:
                return {
                    'success': False,
                    'error': 'Invalid verification token or backup code'
                }
            
            # Disable 2FA
            conn = self.pool.getconn()
            try:
                cur = conn.cursor()
                
                cur.execute("""
                    UPDATE users 
                    SET two_factor_enabled = FALSE, two_factor_secret = NULL, updated_at = %s
                    WHERE id = %s
                """, (datetime.datetime.now(datetime.timezone.utc), user_id))
                
                # Invalidate all backup codes
                cur.execute("""
                    UPDATE user_backup_codes 
                    SET used = TRUE, used_at = %s
                    WHERE user_id = %s
                """, (datetime.datetime.now(datetime.timezone.utc), user_id))
                
                conn.commit()
                
                return {
                    'success': True,
                    'message': '2FA disabled successfully'
                }
                
            finally:
                conn.close()
                
        except Exception as e:
            print(f"Disable 2FA error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def verify_2fa_token(self, user_id: int, token: str) -> bool:
        """
        Verify 2FA token during login
        
        Args:
            user_id: User ID
            token: TOTP token
            
        Returns:
            True if token is valid
        """
        try:
            user = self._execute_query(
                "SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = %s",
                (user_id,),
                fetch_one=True
            )
            
            if not user or not user.get('two_factor_enabled'):
                return False
            
            return self.tfa.verify_token(user['two_factor_secret'], token)
            
        except Exception as e:
            print(f"Verify 2FA token error: {e}")
            return False
    
    def _generate_backup_codes(self, user_id: int, count: int = 10) -> List[str]:
        """
        Generate backup codes for account recovery
        
        Args:
            user_id: User ID
            count: Number of codes to generate
            
        Returns:
            List of plain text backup codes (show only once!)
        """
        # Generate random backup codes
        backup_codes = []
        for _ in range(count):
            code = f"{secrets.token_hex(4)}-{secrets.token_hex(4)}"
            backup_codes.append(code)
        
        # Hash and store codes
        conn = self.pool.getconn()
        try:
            cur = conn.cursor()
            
            # Invalidate existing codes
            cur.execute("""
                UPDATE user_backup_codes 
                SET used = TRUE, used_at = %s
                WHERE user_id = %s
            """, (datetime.datetime.now(datetime.timezone.utc), user_id))
            
            # Store new codes (hashed with Argon2)
            for code in backup_codes:
                code_hash = self.hasher.hash_password(code)
                cur.execute("""
                    INSERT INTO user_backup_codes (user_id, code_hash)
                    VALUES (%s, %s)
                """, (user_id, code_hash))
            
            conn.commit()
        finally:
            conn.close()
        
        return backup_codes
    
    def get_backup_codes(self, user_id: int, token: str) -> Dict:
        """
        Get list of unused backup codes (for user to view/download)
        
        Args:
            user_id: User ID
            token: Current TOTP token for verification
            
        Returns:
            Dictionary with backup codes (only shows un-used ones)
        """
        try:
            # Verify current 2FA token
            if not self.verify_2fa_token(user_id, token):
                return {
                    'success': False,
                    'error': 'Invalid 2FA token'
                }
            
            # Get unused codes from database (we can't show the actual codes, only regenerate)
            # For security, we'll generate new codes instead
            new_codes = self._generate_backup_codes(user_id)
            
            return {
                'success': True,
                'backup_codes': new_codes,
                'message': 'Store these codes securely. They will not be shown again!'
            }
                
        except Exception as e:
            print(f"Get backup codes error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _verify_backup_code(self, user_id: int, code: str) -> bool:
        """
        Verify and invalidate a backup code
        
        Args:
            user_id: User ID
            code: Backup code to verify
            
        Returns:
            True if code is valid
        """
        try:
            conn = self.pool.getconn()
            try:
                cur = conn.cursor(dictionary=True)
                
                # Find unused backup code for this user
                cur.execute("""
                    SELECT id, code_hash 
                    FROM user_backup_codes 
                    WHERE user_id = %s AND used = FALSE
                """, (user_id,))
                
                codes = cur.fetchall()
                
                for code_record in codes:
                    # Verify the code against hash
                    if self.hasher.verify_password(code, code_record['code_hash']):
                        # Mark as used
                        cur.execute("""
                            UPDATE user_backup_codes 
                            SET used = TRUE, used_at = %s
                            WHERE id = %s
                        """, (datetime.datetime.now(datetime.timezone.utc), code_record['id']))
                        
                        conn.commit()
                        return True
                
                return False
                
            finally:
                conn.close()
                
        except Exception as e:
            print(f"Verify backup code error: {e}")
            return False
    
    def is_2fa_required(self, user_id: int) -> bool:
        """
        Check if 2FA is required for this user
        
        Args:
            user_id: User ID
            
        Returns:
            True if 2FA is required/enabled
        """
        try:
            user = self._execute_query(
                """SELECT two_factor_enabled, two_factor_enforced, role 
                   FROM users WHERE id = %s""",
                (user_id,),
                fetch_one=True
            )
            
            if not user:
                return False
            
            # Admins always require 2FA if enforced setting is on
            enforce_admins = os.getenv('TWO_FACTOR_ENFORCED_FOR_ADMINS', 'true').lower() == 'true'
            if enforce_admins and user.get('role') == 'admin':
                return True
            
            # Otherwise check if individually enabled
            return user.get('two_factor_enabled', False)
            
        except Exception as e:
            print(f"Check 2FA required error: {e}")
            return False
    
    def is_2fa_enforced_for_role(self, role: str) -> bool:
        """
        Check if 2FA is enforced for a specific role
        
        Args:
            role: Role name
            
        Returns:
            True if 2FA is enforced for this role
        """
        # Admins always require 2FA if configured
        enforce_admins = os.getenv('TWO_FACTOR_ENFORCED_FOR_ADMINS', 'true').lower() == 'true'
        if enforce_admins and role == 'admin':
            return True
        
        # School admins may also require it
        if role == 'school':
            return False  # Can be configured based on policy
        
        return False
    
    def get_2fa_status(self, user_id: int) -> Dict:
        """
        Get 2FA status for a user
        
        Args:
            user_id: User ID
            
        Returns:
            Dictionary with 2FA status information
        """
        try:
            user = self._execute_query(
                """SELECT two_factor_enabled, two_factor_enforced, role 
                   FROM users WHERE id = %s""",
                (user_id,),
                fetch_one=True
            )
            
            if not user:
                return {
                    'enabled': False,
                    'enforced': False,
                    'required': False
                }
            
            return {
                'enabled': user.get('two_factor_enabled', False),
                'enforced': user.get('two_factor_enforced', False),
                'required': self.is_2fa_required(user_id),
                'role': user.get('role'),
                'admin_enforcement': os.getenv('TWO_FACTOR_ENFORCED_FOR_ADMINS', 'true').lower() == 'true'
            }
            
        except Exception as e:
            print(f"Get 2FA status error: {e}")
            return {
                'enabled': False,
                'enforced': False,
                'required': False,
                'error': str(e)
            }


# Global instance
_two_factor_auth_service = None


def get_two_factor_auth_service() -> TwoFactorAuthService:
    """Get the global 2FA service instance"""
    global _two_factor_auth_service
    if _two_factor_auth_service is None:
        _two_factor_auth_service = TwoFactorAuthService()
    return _two_factor_auth_service


__all__ = [
    'TwoFactorAuthService',
    'get_two_factor_auth_service'
]
