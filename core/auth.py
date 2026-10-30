"""
Enhanced JWT authentication with refresh token mechanism
Provides secure token management with automatic refresh and session handling
"""
import jwt
import secrets
import datetime
from typing import Dict, Optional, Tuple, List
from functools import wraps
from flask import request, jsonify, g
import hashlib
import json
import os

class TokenManager:
    """Manages JWT tokens with refresh capability"""
    
    def __init__(self, secret_key: str = None, access_token_expiry: int = 24, 
                 refresh_token_expiry: int = 168):  # 24 hours, 7 days
        """
        Initialize token manager
        
        Args:
            secret_key: Secret key for JWT signing (auto-generated if None)
            access_token_expiry: Access token expiry in hours
            refresh_token_expiry: Refresh token expiry in hours
        """
        self.secret_key = secret_key or secrets.token_hex(32)
        self.access_token_expiry = access_token_expiry
        self.refresh_token_expiry = refresh_token_expiry
        self.blacklisted_tokens = set()  # In production, use Redis or database
        
        # Database connection (lazy initialization)
        self.db_pool = None
        
        # Token types
        self.ACCESS_TOKEN = 'access'
        self.REFRESH_TOKEN = 'refresh'
    
    def generate_tokens(self, user_data: Dict, token_type: str = 'access',
                       ip_address: str = None, user_agent: str = None) -> Tuple[str, str]:
        """
        Generate access and refresh tokens for a user
        
        Args:
            user_data: User data to include in token
            token_type: Type of initial token to generate
            ip_address: Client IP address (for session tracking)
            user_agent: Client User-Agent (for session tracking)
            
        Returns:
            Tuple of (access_token, refresh_token)
        """
        # Generate access token
        access_payload = {
            **user_data,
            'type': self.ACCESS_TOKEN,
            'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=self.access_token_expiry),
            'iat': datetime.datetime.now(datetime.timezone.utc),
            'jti': secrets.token_urlsafe(32)  # Unique token ID
        }
        access_token = jwt.encode(access_payload, self.secret_key, algorithm='HS256')
        
        # Generate refresh token
        refresh_payload = {
            'user_id': user_data.get('id') or user_data.get('user_id'),
            'type': self.REFRESH_TOKEN,
            'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=self.refresh_token_expiry),
            'iat': datetime.datetime.now(datetime.timezone.utc),
            'jti': secrets.token_urlsafe(32),
            'access_jti': access_payload['jti']  # Link to access token
        }
        refresh_token = jwt.encode(refresh_payload, self.secret_key, algorithm='HS256')
        
        # Store refresh token in database if available
        self._store_refresh_token(
            user_id=refresh_payload['user_id'],
            token=refresh_token,
            jti=refresh_payload['jti'],
            expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=self.refresh_token_expiry),
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return access_token, refresh_token
    
    def _get_db_connection(self):
        """Get database connection (lazy initialization)"""
        if self.db_pool is None:
            try:
                from core.database import get_postgresql_pool
                self.db_pool = get_postgresql_pool()
            except:
                self.db_pool = None
        return self.db_pool
    
    def _store_refresh_token(self, user_id: int, token: str, jti: str, 
                            expires_at: datetime.datetime, 
                            ip_address: str = None, user_agent: str = None):
        """Store refresh token in database"""
        pool = self._get_db_connection()
        if not pool:
            return False
        
        try:
            conn = pool.getconn()
            cur = conn.cursor()
            
            # Hash token for storage
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            query = """
                INSERT INTO refresh_tokens 
                (user_id, token_hash, jti, expires_at, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            params = (user_id, token_hash, jti, expires_at, ip_address, user_agent[:500] if user_agent else None)
            
            cur.execute(query, params)
            conn.commit()
            return True
        except Exception as e:
            print(f"Error storing refresh token: {e}")
            return False
        finally:
            pool.putconn(conn)
    
    def _get_refresh_token_from_db(self, token: str) -> Optional[Dict]:
        """Retrieve refresh token from database"""
        pool = self._get_db_connection()
        if not pool:
            return None
        
        try:
            conn = pool.getconn()
            cur = conn.cursor(dictionary=True)
            
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            query = """
                SELECT * FROM refresh_tokens 
                WHERE token_hash = %s AND revoked = FALSE AND expires_at > %s
            """
            cur.execute(query, (token_hash, datetime.datetime.now(datetime.timezone.utc)))
            
            return cur.fetchone()
        except Exception as e:
            print(f"Error retrieving refresh token: {e}")
            return None
        finally:
            pool.putconn(conn)
    
    def _revoke_refresh_token_in_db(self, token: str, replaced_by_jti: str = None):
        """Revoke refresh token in database"""
        pool = self._get_db_connection()
        if not pool:
            return False
        
        try:
            conn = pool.getconn()
            cur = conn.cursor()
            
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            query = """
                UPDATE refresh_tokens 
                SET revoked = TRUE, revoked_at = %s, replaced_by_token_jti = %s
                WHERE token_hash = %s
            """
            params = (datetime.datetime.now(datetime.timezone.utc), replaced_by_jti, token_hash)
            
            cur.execute(query, params)
            conn.commit()
            return True
        except Exception as e:
            print(f"Error revoking refresh token: {e}")
            return False
        finally:
            pool.putconn(conn)
    
    def refresh_access_token(self, refresh_token: str) -> Optional[Tuple[str, str]]:
        """
        Generate new access token using refresh token with rotation
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            Tuple of (new_access_token, new_refresh_token) or None if invalid
        """
        # Verify refresh token format
        try:
            payload = jwt.decode(refresh_token, self.secret_key, algorithms=['HS256'])
        except jwt.InvalidTokenError:
            return None
        
        # Check token type
        if payload.get('type') != self.REFRESH_TOKEN:
            return None
        
        # Check if token exists in database and is valid
        db_token = self._get_refresh_token_from_db(refresh_token)
        if not db_token:
            # Token not in database or expired/revoked
            return None
        
        # Verify not blacklisted
        token_hash = self._get_token_hash(refresh_token)
        if token_hash in self.blacklisted_tokens:
            return None
        
        # Extract user data (excluding refresh token specific fields)
        user_data = {k: v for k, v in payload.items() 
                    if k not in ['type', 'exp', 'iat', 'jti', 'access_jti']}
        
        # Get IP and User-Agent for new token
        ip_address = request.remote_addr if request else None
        user_agent = request.headers.get('User-Agent') if request else None
        
        # Blacklist the old refresh token (token rotation)
        self._revoke_refresh_token_in_db(refresh_token, replaced_by_jti=payload['jti'])
        self.blacklist_token(refresh_token)
        
        # Generate new tokens
        return self.generate_tokens(user_data, self.ACCESS_TOKEN, ip_address, user_agent)
    
    def revoke_token(self, token: str, reason: str = 'user_logout') -> bool:
        """
        Revoke a token (logout)
        
        Args:
            token: Token to revoke
            reason: Reason for revocation
            
        Returns:
            True if successfully revoked
        """
        # Revoke in database
        self._revoke_refresh_token_in_db(token)
        
        # Add to blacklist
        return self.blacklist_token(token)
    
    def revoke_all_user_tokens(self, user_id: int) -> Dict:
        """
        Revoke all refresh tokens for a user (logout from all devices)
        
        Args:
            user_id: User ID
            
        Returns:
            Revocation statistics
        """
        pool = self._get_db_connection()
        if not pool:
            return {'success': False, 'error': 'Database connection failed'}
        
        try:
            conn = pool.getconn()
            cur = conn.cursor()
            
            query = """
                UPDATE refresh_tokens 
                SET revoked = TRUE, revoked_at = %s
                WHERE user_id = %s AND revoked = FALSE
            """
            cur.execute(query, (datetime.datetime.now(datetime.timezone.utc), user_id))
            revoked_count = cur.rowcount
            
            conn.commit()
            
            return {
                'success': True,
                'revoked_count': revoked_count,
                'message': f'Revoked {revoked_count} active sessions'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            pool.putconn(conn)
    
    def get_active_sessions(self, user_id: int) -> List[Dict]:
        """
        Get all active sessions for a user
        
        Args:
            user_id: User ID
            
        Returns:
            List of active session information
        """
        pool = self._get_db_connection()
        if not pool:
            return []
        
        try:
            conn = pool.getconn()
            cur = conn.cursor(dictionary=True)
            
            query = """
                SELECT id, issued_at, expires_at, ip_address, 
                       SUBSTRING(user_agent, 1, 200) as user_agent
                FROM refresh_tokens
                WHERE user_id = %s AND revoked = FALSE AND expires_at > %s
                ORDER BY issued_at DESC
            """
            cur.execute(query, (user_id, datetime.datetime.now(datetime.timezone.utc)))
            
            sessions = cur.fetchall()
            
            # Format for display
            formatted_sessions = []
            for session in sessions:
                formatted_sessions.append({
                    'session_id': session['id'],
                    'issued_at': session['issued_at'].isoformat(),
                    'expires_at': session['expires_at'].isoformat(),
                    'ip_address': session['ip_address'],
                    'device': session['user_agent']
                })
            
            return formatted_sessions
        except Exception as e:
            print(f"Error getting active sessions: {e}")
            return []
        finally:
            pool.putconn(conn)
    
    def verify_token(self, token: str, expected_type: str = None) -> Optional[Dict]:
        """
        Verify and decode a JWT token
        
        Args:
            token: JWT token to verify
            expected_type: Expected token type (access/refresh)
            
        Returns:
            Decoded token payload or None if invalid
        """
        try:
            # Check if token is blacklisted
            token_hash = self._get_token_hash(token)
            if token_hash in self.blacklisted_tokens:
                return None
            
            # Decode token
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            
            # Verify token type if specified
            if expected_type and payload.get('type') != expected_type:
                return None
            
            # Verify expiration
            if datetime.datetime.now(datetime.timezone.utc) > datetime.datetime.fromtimestamp(payload['exp'], tz=datetime.timezone.utc):
                return None
            
            return payload
            
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
    
    def refresh_access_token(self, refresh_token: str) -> Optional[Tuple[str, str]]:
        """
        Generate new access token using refresh token
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            Tuple of (new_access_token, new_refresh_token) or None if invalid
        """
        # Verify refresh token
        payload = self.verify_token(refresh_token, self.REFRESH_TOKEN)
        if not payload:
            return None
        
        # Extract user data (excluding refresh token specific fields)
        user_data = {k: v for k, v in payload.items() 
                    if k not in ['type', 'exp', 'iat', 'jti', 'access_jti']}
        
        # Blacklist the old refresh token
        self.blacklist_token(refresh_token)
        
        # Generate new tokens
        return self.generate_tokens(user_data, self.ACCESS_TOKEN)
    
    def blacklist_token(self, token: str) -> bool:
        """
        Add token to blacklist (logout/revocation)
        
        Args:
            token: Token to blacklist
            
        Returns:
            True if successfully blacklisted
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            token_hash = self._get_token_hash(token)
            self.blacklisted_tokens.add(token_hash)
            return True
        except:
            return False
    
    def is_token_blacklisted(self, token: str) -> bool:
        """
        Check if token is blacklisted
        
        Args:
            token: Token to check
            
        Returns:
            True if blacklisted
        """
        token_hash = self._get_token_hash(token)
        return token_hash in self.blacklisted_tokens
    
    def cleanup_expired_tokens(self):
        """
        Remove expired tokens from blacklist (periodic cleanup)
        In production, this should be handled by Redis with TTL
        """
        # This is a simplified implementation
        # In production, use Redis with automatic expiration
        current_time = datetime.datetime.now(datetime.timezone.utc)
        expired_hashes = set()
        
        for token_hash in self.blacklisted_tokens:
            # In a real implementation, we'd check actual token expiration
            # This is just a placeholder for the concept
            pass
        
        # Remove expired tokens (simplified)
        self.blacklisted_tokens = self.blacklisted_tokens - expired_hashes
    
    def _get_token_hash(self, token: str) -> str:
        """
        Generate hash of token for blacklisting
        
        Args:
            token: JWT token
            
        Returns:
            Hash of the token
        """
        return hashlib.sha256(token.encode()).hexdigest()
    
    def get_token_info(self, token: str) -> Optional[Dict]:
        """
        Get information about a token without verification
        
        Args:
            token: JWT token
            
        Returns:
            Token information or None if invalid
        """
        try:
            # Decode without verification to get header info
            unverified_header = jwt.get_unverified_header(token)
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
            
            return {
                'header': unverified_header,
                'payload': unverified_payload,
                'type': unverified_payload.get('type'),
                'expires_at': datetime.datetime.fromtimestamp(unverified_payload.get('exp', 0)),
                'issued_at': datetime.datetime.fromtimestamp(unverified_payload.get('iat', 0))
            }
        except:
            return None

class AuthMiddleware:
    """Authentication middleware for Flask applications"""
    
    def __init__(self, token_manager: TokenManager):
        self.token_manager = token_manager
    
    def authenticate_request(self, required_roles: list = None, required_permissions: list = None):
        """
        Flask route decorator for authentication with RBAC support
        
        Args:
            required_roles: List of roles that are allowed (None = any authenticated user)
            required_permissions: List of permissions required (OR logic - needs at least one)
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Get token from Authorization header
                auth_header = request.headers.get('Authorization')
                if not auth_header or not auth_header.startswith('Bearer '):
                    return jsonify({
                        'success': False,
                        'error': 'Missing or invalid authorization token',
                        'error_ar': 'رمز التفويض مفقود أو غير صالح'
                    }), 401
                
                token = auth_header.split(' ')[1]
                
                # Verify access token
                payload = self.token_manager.verify_token(token, 'access')
                if not payload:
                    return jsonify({
                        'success': False,
                        'error': 'Invalid or expired token',
                        'error_ar': 'رمز غير صالح أو منتهي الصلاحية'
                    }), 401
                
                # Check role requirements (legacy method)
                if required_roles and payload.get('role') not in required_roles:
                    return jsonify({
                        'success': False,
                        'error': 'Insufficient permissions',
                        'error_ar': 'صلاحيات غير كافية'
                    }), 403
                
                # Check permission requirements (RBAC method)
                if required_permissions:
                    from services.rbac_service import has_permission
                    user_id = payload.get('id')
                    school_id = payload.get('school_id')
                    
                    # Check if user has at least one of the required permissions
                    has_access = any(
                        has_permission(user_id, perm, school_id)
                        for perm in required_permissions
                    )
                    
                    if not has_access:
                        return jsonify({
                            'success': False,
                            'error': 'Insufficient permissions',
                            'error_ar': 'صلاحيات غير كافية',
                            'required_permissions': required_permissions
                        }), 403
                
                # Store user info in request context
                g.current_user = payload
                g.access_token = token
                
                return f(*args, **kwargs)
            
            return decorated_function
        return decorator
    
    def optional_auth(self):
        """
        Flask route decorator for optional authentication
        Sets user info if token is valid, but doesn't require authentication
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # Get token from Authorization header
                auth_header = request.headers.get('Authorization')
                if auth_header and auth_header.startswith('Bearer '):
                    token = auth_header.split(' ')[1]
                    payload = self.token_manager.verify_token(token, 'access')
                    if payload:
                        g.current_user = payload
                        g.access_token = token
                
                return f(*args, **kwargs)
            
            return decorated_function
        return decorator

# Global instances
_default_token_manager = None
_default_auth_middleware = None

def get_token_manager() -> TokenManager:
    """Get the global token manager instance"""
    global _default_token_manager
    if _default_token_manager is None:
        _default_token_manager = TokenManager()
    return _default_token_manager

def get_auth_middleware() -> AuthMiddleware:
    """Get the global auth middleware instance"""
    global _default_auth_middleware
    if _default_auth_middleware is None:
        _default_auth_middleware = AuthMiddleware(get_token_manager())
    return _default_auth_middleware

def setup_auth(secret_key: str = None, access_expiry: int = 24, 
               refresh_expiry: int = 168) -> Tuple[TokenManager, AuthMiddleware]:
    """
    Setup authentication system
    
    Args:
        secret_key: Secret key for JWT signing
        access_expiry: Access token expiry in hours
        refresh_expiry: Refresh token expiry in hours
        
    Returns:
        Tuple of (TokenManager, AuthMiddleware)
    """
    global _default_token_manager, _default_auth_middleware
    
    _default_token_manager = TokenManager(secret_key, access_expiry, refresh_expiry)
    _default_auth_middleware = AuthMiddleware(_default_token_manager)
    
    return _default_token_manager, _default_auth_middleware

# Convenience decorators
def authenticate(roles: list = None, permissions: list = None):
    """Convenience decorator for authentication with RBAC support"""
    return get_auth_middleware().authenticate_request(roles, permissions)

def require_permissions(permissions: list):
    """Convenience decorator for permission-based access"""
    return get_auth_middleware().authenticate_request(required_permissions=permissions)

def optional_authentication():
    """Convenience decorator for optional authentication"""
    return get_auth_middleware().optional_auth()

# Token validation utilities
def validate_token_structure(token: str) -> bool:
    """
    Validate basic JWT token structure
    
    Args:
        token: JWT token string
        
    Returns:
        True if valid structure
    """
    if not token or not isinstance(token, str):
        return False
    
    parts = token.split('.')
    return len(parts) == 3 and all(len(part) > 0 for part in parts)

def get_token_expiration(token: str) -> Optional[datetime.datetime]:
    """
    Get token expiration time without verification
    
    Args:
        token: JWT token
        
    Returns:
        Expiration datetime or None if invalid
    """
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return datetime.datetime.fromtimestamp(payload.get('exp', 0))
    except:
        return None

# Export main classes and functions
__all__ = [
    'TokenManager', 'AuthMiddleware', 'get_token_manager', 'get_auth_middleware',
    'setup_auth', 'authenticate', 'optional_authentication', 'validate_token_structure',
    'get_token_expiration'
]