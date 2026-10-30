"""
Database Migration Script for PII Encryption
Migrates existing PII data to encrypted format while maintaining backward compatibility
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import get_postgresql_pool
from services.pii_encryption_service import get_pii_encryption_service
import datetime


def migrate_pii_data(batch_size: int = 100):
    """
    Migrate all PII fields to encrypted format
    
    This script:
    1. Adds new encrypted columns alongside existing ones
    2. Encrypts existing data and stores in new columns
    3. Keeps original columns for backward compatibility during transition
    4. Updates application queries to use encrypted columns
    """
    
    print("=" * 80)
    print("PII Data Encryption Migration")
    print("=" * 80)
    
    # Initialize encryption service
    encryption_service = get_pii_encryption_service()
    if not encryption_service:
        print("❌ ERROR: PII Encryption Service not available")
        print("   Ensure PII_ENCRYPTION_KEY is set in environment variables")
        return False
    
    print("✅ PII Encryption Service initialized successfully")
    
    pool = get_postgresql_pool()
    if not pool:
        print("❌ ERROR: Database connection failed")
        return False
    
    print("✅ Database connection established")
    
    conn = None
    cursor = None
    
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        
        print("\n" + "=" * 80)
        print("Step 1: Adding encrypted columns (if they don't exist)")
        print("=" * 80)
        
        # Add encrypted columns to teachers table
        encrypted_columns = [
            ("teachers", "email_encrypted", "TEXT"),
            ("teachers", "phone_encrypted", "TEXT"),
            ("students", "parent_contact_encrypted", "TEXT"),
        ]
        
        for table, column, dtype in encrypted_columns:
            try:
                cursor.execute(f"""
                    ALTER TABLE {table} 
                    ADD COLUMN IF NOT EXISTS {column} {dtype}
                """)
                print(f"✅ Added column {table}.{column}")
            except Exception as e:
                if 'already exists' in str(e).lower():
                    print(f"✓ Column {table}.{column} already exists")
                else:
                    print(f"⚠️ Warning adding {table}.{column}: {e}")
        
        conn.commit()
        
        print("\n" + "=" * 80)
        print("Step 2: Migrating teacher email addresses")
        print("=" * 80)
        
        # Migrate teacher emails
        cursor.execute("""
            SELECT id, email FROM teachers 
            WHERE email IS NOT NULL AND email != ''
        """)
        teachers = cursor.fetchall()
        
        migrated_count = 0
        for teacher_id, email in teachers:
            try:
                # Encrypt email deterministically for searchability
                encrypted_email = encryption_service.encrypt_email(email)
                
                cursor.execute("""
                    UPDATE teachers 
                    SET email_encrypted = %s 
                    WHERE id = %s
                """, (encrypted_email, teacher_id))
                
                migrated_count += 1
                
                if migrated_count % 50 == 0:
                    conn.commit()
                    print(f"  Processed {migrated_count}/{len(teachers)} teachers...")
                    
            except Exception as e:
                print(f"⚠️ Error encrypting teacher {teacher_id} email: {e}")
        
        conn.commit()
        print(f"✅ Migrated {migrated_count} teacher email addresses")
        
        print("\n" + "=" * 80)
        print("Step 3: Migrating teacher phone numbers")
        print("=" * 80)
        
        # Migrate teacher phones
        cursor.execute("""
            SELECT id, phone FROM teachers 
            WHERE phone IS NOT NULL AND phone != ''
        """)
        teachers_with_phones = cursor.fetchall()
        
        phone_count = 0
        for teacher_id, phone in teachers_with_phones:
            try:
                encrypted_phone = encryption_service.encrypt_phone(phone)
                
                cursor.execute("""
                    UPDATE teachers 
                    SET phone_encrypted = %s 
                    WHERE id = %s
                """, (encrypted_phone, teacher_id))
                
                phone_count += 1
                
                if phone_count % 50 == 0:
                    conn.commit()
                    print(f"  Processed {phone_count}/{len(teachers_with_phones)} teachers...")
                    
            except Exception as e:
                print(f"⚠️ Error encrypting teacher {teacher_id} phone: {e}")
        
        conn.commit()
        print(f"✅ Migrated {phone_count} teacher phone numbers")
        
        print("\n" + "=" * 80)
        print("Step 4: Migrating student parent contact information")
        print("=" * 80)
        
        # Migrate student parent contacts
        cursor.execute("""
            SELECT id, parent_contact FROM students 
            WHERE parent_contact IS NOT NULL AND parent_contact != ''
        """)
        students = cursor.fetchall()
        
        student_count = 0
        for student_id, parent_contact in students:
            try:
                encrypted_contact = encryption_service.encrypt_contact_info(parent_contact)
                
                cursor.execute("""
                    UPDATE students 
                    SET parent_contact_encrypted = %s 
                    WHERE id = %s
                """, (encrypted_contact, student_id))
                
                student_count += 1
                
                if student_count % 50 == 0:
                    conn.commit()
                    print(f"  Processed {student_count}/{len(students)} students...")
                    
            except Exception as e:
                print(f"⚠️ Error encrypting student {student_id} contact: {e}")
        
        conn.commit()
        print(f"✅ Migrated {student_count} student parent contacts")
        
        print("\n" + "=" * 80)
        print("Step 5: Creating indexes for encrypted fields")
        print("=" * 80)
        
        # Create indexes for encrypted fields to maintain query performance
        index_statements = [
            "CREATE INDEX IF NOT EXISTS idx_teachers_email_enc ON teachers(email_encrypted)",
            "CREATE INDEX IF NOT EXISTS idx_teachers_phone_enc ON teachers(phone_encrypted)",
            "CREATE INDEX IF NOT EXISTS idx_students_parent_contact_enc ON students(parent_contact_encrypted)",
        ]
        
        for stmt in index_statements:
            try:
                cursor.execute(stmt)
                print(f"✅ Created index: {stmt.split('ON')[1].strip()}")
            except Exception as e:
                print(f"⚠️ Warning creating index: {e}")
        
        conn.commit()
        
        print("\n" + "=" * 80)
        print("Step 6: Updating users table for OAuth email encryption")
        print("=" * 80)
        
        # For users table, we'll add a flag to indicate if username is encrypted
        try:
            cursor.execute("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS username_is_encrypted BOOLEAN DEFAULT FALSE
            """)
            print("✅ Added username_is_encrypted flag to users table")
        except Exception as e:
            print(f"⚠️ Warning adding username_is_encrypted: {e}")
        
        conn.commit()
        
        print("\n" + "=" * 80)
        print("Migration Summary")
        print("=" * 80)
        print(f"✅ Teacher emails migrated: {migrated_count}")
        print(f"✅ Teacher phones migrated: {phone_count}")
        print(f"✅ Student contacts migrated: {student_count}")
        print(f"✅ Encrypted columns added and indexed")
        print("\n⚠️ IMPORTANT: Original columns retained for backward compatibility")
        print("   Update application code to use encrypted columns gradually")
        
        # Store migration metadata
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS migration_metadata (
                    id SERIAL PRIMARY KEY,
                    migration_name VARCHAR(255) NOT NULL,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    records_affected INT,
                    status VARCHAR(50) DEFAULT 'SUCCESS'
                )
            """)
            
            total_records = migrated_count + phone_count + student_count
            cursor.execute("""
                INSERT INTO migration_metadata 
                (migration_name, records_affected, status)
                VALUES (%s, %s, %s)
            """, ('pii_encryption_migration', total_records, 'SUCCESS'))
            
            conn.commit()
            print("\n✅ Migration metadata recorded")
            
        except Exception as e:
            print(f"⚠️ Warning recording migration metadata: {e}")
        
        print("\n" + "=" * 80)
        print("✅ PII ENCRYPTION MIGRATION COMPLETED SUCCESSFULLY")
        print("=" * 80)
        
        return True
        
    except Exception as e:
        print(f"\n❌ MIGRATION FAILED: {e}")
        import traceback
        traceback.print_exc()
        
        if conn:
            conn.rollback()
        return False
        
    finally:
        if cursor:
            cursor.close()
        if conn:
            pool.putconn(conn)


def rollback_migration():
    """
    Rollback PII encryption migration (remove encrypted columns)
    
    WARNING: This will permanently delete encrypted data!
    Only use this if you need to revert the migration.
    """
    print("\n" + "=" * 80)
    print("WARNING: Rolling back PII encryption migration")
    print("This will DELETE all encrypted data!")
    print("=" * 80)
    
    response = input("Are you sure you want to continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Rollback cancelled")
        return
    
    pool = get_postgresql_pool()
    conn = None
    cursor = None
    
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        
        # Drop encrypted columns
        columns_to_drop = [
            ("teachers", "email_encrypted"),
            ("teachers", "phone_encrypted"),
            ("students", "parent_contact_encrypted"),
        ]
        
        for table, column in columns_to_drop:
            try:
                cursor.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}")
                print(f"✅ Dropped column {table}.{column}")
            except Exception as e:
                print(f"⚠️ Error dropping {table}.{column}: {e}")
        
        # Drop indexes
        indexes_to_drop = [
            "idx_teachers_email_enc",
            "idx_teachers_phone_enc",
            "idx_students_parent_contact_enc",
        ]
        
        for index in indexes_to_drop:
            try:
                cursor.execute(f"DROP INDEX IF EXISTS {index}")
                print(f"✅ Dropped index {index}")
            except Exception as e:
                print(f"⚠️ Error dropping index {index}: {e}")
        
        conn.commit()
        print("\n✅ Rollback completed successfully")
        
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            pool.putconn(conn)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='PII Encryption Migration Tool')
    parser.add_argument('--rollback', action='store_true', 
                       help='Rollback the migration (remove encrypted columns)')
    parser.add_argument('--batch-size', type=int, default=100,
                       help='Batch size for processing (default: 100)')
    
    args = parser.parse_args()
    
    if args.rollback:
        rollback_migration()
    else:
        success = migrate_pii_data(batch_size=args.batch_size)
        sys.exit(0 if success else 1)
