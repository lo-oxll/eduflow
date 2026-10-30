"""
Enhanced Security Module for EduFlow
Provides Argon2 password hashing and bcrypt migration utilities
"""
import os
import hashlib
from typing import Optional, Tuple

try:
    from argon2 import PasswordHasher, Type
    from argon2.exceptions import VerifyMismatchError, InvalidHash, VerificationError
    ARGON2_AVAILABLE = True
except ImportError:
    ARGON2_AVAILABLE = False
    PasswordHasher = None
    Type = None

# Optional bcrypt for backward compatibility
try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except ImportError:
    BCRYPT_AVAILABLE = False


class Argon2Hasher:
    """
    Argon2 password hasher with bcrypt migration support
    
    Uses Argon2id variant which provides protection against both:
    - Side-channel attacks (like Argon2i)
    - GPU cracking attacks (like Argon2d)
    """
    
    def __init__(self, salt: str = None):
        """
        Initialize Argon2 hasher with optional salt
        
        Args:
            salt: Optional salt for additional security (uses ARGON2_SECRET_SALT from env)
        """
        self.salt = salt or os.getenv('ARGON2_SECRET_SALT', '')
        
        if ARGON2_AVAILABLE:
            # Argon2id configuration following OWASP recommendations
            # Time cost: number of iterations
            # Memory cost: memory usage in KiB
            # Parallelism: number of parallel threads
            self.hasher = PasswordHasher(
                time_cost=3,
                memory_cost=65536,  # 64 MB
                parallelism=4,
                hash_len=32,
                type=Type.ID
            )
        else:
            self.hasher = None
    
    def hash_password(self, password: str) -> str:
        """
        Hash password using Argon2id
        
        Args:
            password: Plain text password
            
        Returns:
            Argon2 hashed password string
            
        Raises:
            RuntimeError: If argon2-cffi is not installed
        """
        if not ARGON2_AVAILABLE:
            raise RuntimeError(
                "argon2-cffi is not installed. "
                "Install with: pip install argon2-cffi==23.1.0"
            )
        
        # Add salt if configured
        if self.salt:
            salted_password = f"{self.salt}${password}"
        else:
            salted_password = password
        
        return self.hasher.hash(salted_password)
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """
        Verify password against hash (supports both Argon2 and bcrypt)
        
        Args:
            password: Plain text password to verify
            hashed_password: Hash to verify against
            
        Returns:
            True if password matches, False otherwise
        """
        if not hashed_password:
            return False
        
        # Try Argon2 first (preferred method)
        if self._is_argon2_hash(hashed_password):
            return self._verify_argon2(password, hashed_password)
        
        # Fallback to bcrypt for backward compatibility
        elif self._is_bcrypt_hash(hashed_password):
            return self._verify_bcrypt(password, hashed_password)
        
        # Unknown hash format
        return False
    
    def needs_rehash(self, hashed_password: str) -> bool:
        """
        Check if password hash needs to be upgraded
        
        Args:
            hashed_password: Existing password hash
            
        Returns:
            True if hash should be regenerated with current parameters
        """
        if not ARGON2_AVAILABLE or not self.hasher:
            return True
        
        # Bcrypt hashes need migration to Argon2
        if self._is_bcrypt_hash(hashed_password):
            return True
        
        # Check if Argon2 hash uses outdated parameters
        try:
            return self.hasher.check_needs_rehash(hashed_password)
        except InvalidHash:
            return True
    
    def migrate_bcrypt_to_argon2(self, bcrypt_hash: str, password: str) -> Optional[str]:
        """
        Migrate bcrypt hash to Argon2
        
        Args:
            bcrypt_hash: Existing bcrypt hash
            password: Plain text password (needed to rehash)
            
        Returns:
            New Argon2 hash or None if migration fails
        """
        if not ARGON2_AVAILABLE:
            return None
        
        # Verify the bcrypt hash first
        if not self._verify_bcrypt(password, bcrypt_hash):
            return None
        
        # Generate new Argon2 hash
        return self.hash_password(password)
    
    def _is_argon2_hash(self, hashed_password: str) -> bool:
        """Check if hash is Argon2 format"""
        return hashed_password.startswith('$argon2')
    
    def _is_bcrypt_hash(self, hashed_password: str) -> bool:
        """Check if hash is bcrypt format"""
        return hashed_password.startswith('$2') and len(hashed_password) == 60
    
    def _verify_argon2(self, password: str, hashed_password: str) -> bool:
        """Verify Argon2 hash"""
        if not ARGON2_AVAILABLE or not self.hasher:
            return False
        
        try:
            # Add salt if configured
            if self.salt:
                salted_password = f"{self.salt}${password}"
            else:
                salted_password = password
            
            self.hasher.verify(hashed_password, salted_password)
            return True
        except (VerifyMismatchError, VerificationError, InvalidHash):
            return False
    
    def _verify_bcrypt(self, password: str, hashed_password: str) -> bool:
        """Verify bcrypt hash (for backward compatibility)"""
        if not BCRYPT_AVAILABLE:
            return False
        
        try:
            return bcrypt.checkpw(
                password.encode('utf-8'),
                hashed_password.encode('utf-8')
            )
        except Exception:
            return False


class SecurityUtils:
    """Additional security utilities"""
    
    @staticmethod
    def generate_secure_random(length: int = 32) -> str:
        """
        Generate cryptographically secure random string
        
        Args:
            length: Length of string to generate
            
        Returns:
            Hex-encoded secure random string
        """
        import secrets
        return secrets.token_hex(length)
    
    @staticmethod
    def validate_password_strength(password: str, user_role: str = 'user', 
                                   check_common: bool = True) -> Tuple[bool, list]:
        """
        Validate password strength with enhanced requirements
        
        Args:
            password: Password to validate
            user_role: User role ('admin' or 'user') - admins have stricter requirements
            check_common: Whether to check against common passwords list
            
        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []
        
        # Role-specific length requirements
        if user_role == 'admin':
            if len(password) < 16:
                errors.append("Admin passwords must be at least 16 characters long")
        else:
            if len(password) < 12:
                errors.append("Password must be at least 12 characters long")
        
        # Character type requirements (all users)
        if not any(c.isupper() for c in password):
            errors.append("Password must contain at least one uppercase letter")
        
        if not any(c.islower() for c in password):
            errors.append("Password must contain at least one lowercase letter")
        
        if not any(c.isdigit() for c in password):
            errors.append("Password must contain at least one number")
        
        # Check for special characters
        special_chars = set('!@#$%^&*(),.?":{}|<>_\\-+=[];\'`~')
        if not any(c in special_chars for c in password):
            errors.append("Password must contain at least one special character")
        
        # Dictionary attack prevention - common passwords
        if check_common and len(password) > 0:
            common_passwords = SecurityUtils._load_common_passwords()
            if password.lower() in common_passwords:
                errors.append("Password is too common and easily guessable")
        
        # Sequential character detection
        if SecurityUtils._has_sequential_characters(password):
            errors.append("Password contains sequential characters (e.g., '1234', 'abcd')")
        
        # Repeated character detection
        if SecurityUtils._has_repeated_characters(password):
            errors.append("Password contains too many repeated characters")
        
        # Personal information patterns (basic checks)
        if SecurityUtils._contains_personal_patterns(password):
            errors.append("Password contains personal information patterns")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def _load_common_passwords() -> set:
        """
        Load list of common passwords for dictionary attack prevention
        
        Returns:
            Set of common passwords (top 10000)
        """
        # Top 100 most common passwords (abbreviated list for brevity)
        # In production, load from a file with full top 10000 list
        common_passwords = {
            'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
            'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
            'ashley', 'bailey', 'passw0rd', 'shadow', '123123', '654321', 'superman',
            'qazwsx', 'michael', 'football', 'password1', 'password123', 'welcome',
            'jesus', 'ninja', 'mustang', 'password1234', 'admin', 'admin123', 'root',
            'toor', 'pass', 'test', 'guest', 'master123', 'changeme', 'hello', 'charlie',
            'donald', 'password12', 'qwerty123', 'aa123456', 'login', 'princess',
            'starwars', 'whatever', 'solo', '111111', 'flower', '1234', '12345',
        }
        
        # Try to load extended list from file if available
        try:
            common_file = os.path.join(os.path.dirname(__file__), 'common_passwords.txt')
            if os.path.exists(common_file):
                with open(common_file, 'r') as f:
                    for line in f:
                        common_passwords.add(line.strip().lower())
        except Exception:
            pass  # Use built-in list if file not available
        
        return common_passwords
    
    @staticmethod
    def _has_sequential_characters(password: str, min_length: int = 4) -> bool:
        """
        Check if password contains sequential characters
        
        Args:
            password: Password to check
            min_length: Minimum length of sequence to detect
            
        Returns:
            True if sequential characters detected
        """
        if len(password) < min_length:
            return False
        
        # Check for numeric sequences
        for i in range(len(password) - min_length + 1):
            substring = password[i:i + min_length]
            if substring.isdigit():
                # Check if sequential
                is_sequential = all(
                    ord(substring[j+1]) - ord(substring[j]) == 1
                    for j in range(len(substring) - 1)
                )
                if is_sequential:
                    return True
            
            # Check for alphabetic sequences
            if substring.isalpha():
                lower_sub = substring.lower()
                is_sequential = all(
                    ord(lower_sub[j+1]) - ord(lower_sub[j]) == 1
                    for j in range(len(lower_sub) - 1)
                )
                if is_sequential:
                    return True
        
        # Check common keyboard patterns
        keyboard_patterns = ['qwerty', 'asdf', 'zxcv', '1234', 'qazwsx']
        password_lower = password.lower()
        for pattern in keyboard_patterns:
            if pattern in password_lower:
                return True
        
        return False
    
    @staticmethod
    def _has_repeated_characters(password: str, max_repeats: int = 2) -> bool:
        """
        Check if password contains too many repeated characters
        
        Args:
            password: Password to check
            max_repeats: Maximum allowed consecutive repeats
            
        Returns:
            True if too many repeated characters
        """
        import re
        # Check for same character repeated
        pattern = r'(.)\1{' + str(max_repeats) + r',}'
        if re.search(pattern, password):
            return True
        
        # Check for repeated patterns (e.g., "abab", "123123")
        for pattern_len in range(2, len(password) // 2 + 1):
            for i in range(len(password) - pattern_len * 2 + 1):
                pattern_str = password[i:i + pattern_len]
                if password[i + pattern_len:i + pattern_len * 2] == pattern_str:
                    return True
        
        return False
    
    @staticmethod
    def _contains_personal_patterns(password: str) -> bool:
        """
        Check if password contains common personal information patterns
        
        Args:
            password: Password to check
            
        Returns:
            True if personal patterns detected
        """
        password_lower = password.lower()
        
        # Common personal patterns
        personal_patterns = [
            r'\b(email|username|name|user)\b',
            r'\d{4}$',  # Year at end (e.g., 1990, 2000)
            r'^\d{4}',  # Year at start
        ]
        
        import re
        for pattern in personal_patterns:
            if re.search(pattern, password_lower):
                return True
        
        return False
    
    @staticmethod
    def sanitize_input(value: str) -> str:
        """
        Sanitize user input to prevent XSS
        
        Args:
            value: Input string to sanitize
            
        Returns:
            Sanitized string
        """
        if not value:
            return ""
        
        # Basic HTML entity escaping
        replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;',
        }
        
        for char, replacement in replacements.items():
            value = value.replace(char, replacement)
        
        return value.strip()


# Global instance
_default_hasher = None


def get_argon2_hasher() -> Argon2Hasher:
    """Get the global Argon2 hasher instance"""
    global _default_hasher
    if _default_hasher is None:
        _default_hasher = Argon2Hasher()
    return _default_hasher


def hash_password(password: str) -> str:
    """Convenience function to hash password"""
    return get_argon2_hasher().hash_password(password)


def verify_password(password: str, hashed: str) -> bool:
    """Convenience function to verify password"""
    return get_argon2_hasher().verify_password(password, hashed)


# Export main classes and functions
__all__ = [
    'Argon2Hasher',
    'SecurityUtils',
    'get_argon2_hasher',
    'hash_password',
    'verify_password'
]
