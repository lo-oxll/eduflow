"""
EduFlow Services Package
Provides inter-service communication and integrations
"""
import os
import sys

# Ensure core modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'core'))

__version__ = '1.0.0'
__all__ = ['integrations']
