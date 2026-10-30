"""
OAuth2 Service for EduFlow
Provides integration with external identity providers (Google, Microsoft, National Access)
"""
import os
from typing import Dict, Optional
from core.database import get_postgresql_pool
import datetime

try:
    from authlib.integrations.flask_client import OAuth
    OAUTHLIB_AVAILABLE = True
except ImportError:
    OAUTHLIB_AVAILABLE = False
    OAuth = None


class OAuth2Service:
    """
    OAuth2/OpenID Connect integration service
    
    Supported providers:
    - Google
    - Microsoft
    - National Access (generic OIDC)
    """
    
    def __init__(self):
        if not OAUTHLIB_AVAILABLE:
            raise ImportError(
                "Authlib is required for OAuth2 support. "
                "Install with: pip install authlib==1.3.0 httpx==0.26.0"
            )
        
        self.oauth = OAuth()
        self.pool = get_postgresql_pool()
        self._configure_providers()
    
    def _configure_providers(self):
        """Configure OAuth2 providers from environment variables"""
        
        # Google OAuth2 / Google Workspace
        google_client_id = os.getenv('OAUTH2_GOOGLE_CLIENT_ID')
        google_client_secret = os.getenv('OAUTH2_GOOGLE_CLIENT_SECRET')
        
        if google_client_id and google_client_secret:
            # Support Google Workspace with hosted domain restriction
            google_hosted_domain = os.getenv('OAUTH2_GOOGLE_HOSTED_DOMAIN', '')
            
            client_kwargs = {
                'scope': 'openid email profile'
            }
            
            if google_hosted_domain:
                # Restrict to specific Google Workspace domain
                client_kwargs['login_hint'] = f'@{google_hosted_domain}'
            
            self.oauth.register(
                name='google',
                client_id=google_client_id,
                client_secret=google_client_secret,
                server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
                client_kwargs=client_kwargs,
                redirect_uri=os.getenv('OAUTH2_GOOGLE_REDIRECT_URI')
            )
        
        # Microsoft OAuth2 / Azure AD
        microsoft_client_id = os.getenv('OAUTH2_MICROSOFT_CLIENT_ID')
        microsoft_client_secret = os.getenv('OAUTH2_MICROSOFT_CLIENT_SECRET')
        
        if microsoft_client_id and microsoft_client_secret:
            # Support Azure AD with tenant-specific endpoint
            microsoft_tenant = os.getenv('OAUTH2_MICROSOFT_TENANT', 'common')
            
            self.oauth.register(
                name='microsoft',
                client_id=microsoft_client_id,
                client_secret=microsoft_client_secret,
                server_metadata_url=f'https://login.microsoftonline.com/{microsoft_tenant}/v2.0/.well-known/openid-configuration',
                client_kwargs={
                    'scope': 'openid email profile offline_access'
                },
                redirect_uri=os.getenv('OAUTH2_MICROSOFT_REDIRECT_URI')
            )
        
        # National Access / Custom OIDC Provider
        national_client_id = os.getenv('OAUTH2_NATIONAL_ACCESS_CLIENT_ID')
        national_client_secret = os.getenv('OAUTH2_NATIONAL_ACCESS_CLIENT_SECRET')
        national_issuer = os.getenv('OAUTH2_NATIONAL_ACCESS_ISSUER_URL')
        
        if national_client_id and national_client_secret and national_issuer:
            self.oauth.register(
                name='national_access',
                client_id=national_client_id,
                client_secret=national_client_secret,
                server_metadata_url=f'{national_issuer}/.well-known/openid-configuration',
                client_kwargs={
                    'scope': 'openid email profile'
                },
                redirect_uri=os.getenv('OAUTH2_NATIONAL_ACCESS_REDIRECT_URI')
            )
    
    def get_provider(self, provider_name: str):
        """
        Get OAuth2 provider instance
        
        Args:
            provider_name: Provider name ('google', 'microsoft', 'national_access')
            
        Returns:
            OAuth2 provider instance or None
        """
        return self.oauth.create_client(provider_name)
    
    def process_callback(self, provider_name: str, redirect_uri: str) -> Optional[Dict]:
        """
        Handle OAuth2 callback and process user information
        
        Args:
            provider_name: OAuth2 provider name
            redirect_uri: Redirect URI used for authorization
            
        Returns:
            Dictionary with user information or None if failed
        """
        try:
            provider = self.get_provider(provider_name)
            if not provider:
                return None
            
            # Exchange authorization code for tokens
            token = provider.authorize_access_token(redirect_uri=redirect_uri)
            
            # Get user info from token
            user_info = token.get('userinfo')
            if not user_info:
                user_info = provider.parse_id_token(token)
            
            # Store/update OAuth account
            result = self._handle_oauth_account(
                provider=provider_name,
                provider_user_id=user_info.get('sub'),
                provider_email=user_info.get('email'),
                access_token=token.get('access_token'),
                refresh_token=token.get('refresh_token'),
                token_expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=token.get('expires_in', 3600)),
                scopes=','.join(token.get('scope', []))
            )
            
            return {
                'user_id': result['user_id'],
                'is_new': result['is_new'],
                'email': user_info.get('email'),
                'name': user_info.get('name'),
                'provider': provider_name
            }
            
        except Exception as e:
            print(f"OAuth2 callback error: {e}")
            return None
    
    def _handle_oauth_account(self, provider: str, provider_user_id: str, 
                             provider_email: str, access_token: str,
                             refresh_token: str, token_expires_at: datetime.datetime,
                             scopes: str) -> Dict:
        """
        Create or update OAuth account in database with SSO attribute mapping
        
        Args:
            provider: OAuth2 provider name
            provider_user_id: User ID from provider
            provider_email: Email from provider
            access_token: OAuth2 access token
            refresh_token: OAuth2 refresh token
            token_expires_at: Token expiration timestamp
            scopes: Granted scopes
            
        Returns:
            Dictionary with user_id and is_new flag
        """
        conn = self.pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            
            # Check if OAuth account exists
            cur.execute("""
                SELECT * FROM oauth_accounts
                WHERE provider = %s AND provider_user_id = %s
            """, (provider, provider_user_id))
            
            existing_account = cur.fetchone()
            
            if existing_account:
                # Update existing account
                cur.execute("""
                    UPDATE oauth_accounts
                    SET access_token = %s,
                        refresh_token = %s,
                        token_expires_at = %s,
                        scopes = %s,
                        updated_at = %s
                    WHERE id = %s
                """, (access_token, refresh_token, token_expires_at, scopes,
                      datetime.datetime.now(datetime.timezone.utc), existing_account['id']))
                
                conn.commit()
                
                return {
                    'user_id': existing_account['user_id'],
                    'is_new': False
                }
            else:
                # Check if user exists with this email
                cur.execute("""
                    SELECT id FROM users WHERE username = %s
                """, (provider_email,))
                
                existing_user = cur.fetchone()
                
                if existing_user:
                    user_id = existing_user['id']
                else:
                    # Create new user with SSO provisioning
                    # Default role based on environment configuration
                    default_role = os.getenv('SSO_DEFAULT_ROLE', 'teacher')
                    auto_provision = os.getenv('SSO_AUTO_PROVISION_USERS', 'true').lower() == 'true'
                    
                    if not auto_provision:
                        # Don't auto-create users - require admin approval
                        return None
                    
                    cur.execute("""
                        INSERT INTO users (username, role, must_change_password)
                        VALUES (%s, %s, %s)
                    """, (provider_email, default_role, False))
                    
                    user_id = cur.lastrowid
                
                # Create OAuth account
                cur.execute("""
                    INSERT INTO oauth_accounts
                    (user_id, provider, provider_user_id, provider_email,
                     access_token, refresh_token, token_expires_at, scopes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (user_id, provider, provider_user_id, provider_email,
                      access_token, refresh_token, token_expires_at, scopes))
                
                conn.commit()
                
                return {
                    'user_id': user_id,
                    'is_new': not existing_user
                }
                
        finally:
            conn.close()
    
    def get_oauth_account(self, user_id: int) -> list:
        """
        Get all OAuth accounts linked to a user
        
        Args:
            user_id: User ID
            
        Returns:
            List of OAuth account information
        """
        conn = self.pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            
            cur.execute("""
                SELECT provider, provider_email, created_at
                FROM oauth_accounts
                WHERE user_id = %s
                ORDER BY provider
            """, (user_id,))
            
            return cur.fetchall()
            
        finally:
            conn.close()
    
    def unlink_oauth_account(self, user_id: int, provider: str) -> Dict:
        """
        Unlink OAuth account from user
        
        Args:
            user_id: User ID
            provider: OAuth2 provider name
            
        Returns:
            Result dictionary
        """
        conn = self.pool.get_connection()
        try:
            cur = conn.cursor()
            
            cur.execute("""
                DELETE FROM oauth_accounts
                WHERE user_id = %s AND provider = %s
            """, (user_id, provider))
            
            deleted_count = cur.rowcount
            conn.commit()
            
            if deleted_count > 0:
                return {
                    'success': True,
                    'message': f'Unlinked {provider} account'
                }
            else:
                return {
                    'success': False,
                    'error': 'OAuth account not found'
                }
                
        finally:
            conn.close()


# Global instance
_oauth2_service = None


def get_oauth2_service() -> OAuth2Service:
    """Get the global OAuth2 service instance"""
    global _oauth2_service
    if _oauth2_service is None:
        if not OAUTHLIB_AVAILABLE:
            return None
        _oauth2_service = OAuth2Service()
    return _oauth2_service


__all__ = ['OAuth2Service', 'get_oauth2_service']
