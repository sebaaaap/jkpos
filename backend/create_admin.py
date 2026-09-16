import sys
import uuid
import os

# Asegurar que estamos en el directorio correcto
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.models.base import User, UserRole
from app.core.security import get_password_hash

USERNAME = "jkadmin"
PASSWORD = "admin123"
FULL_NAME = "Administrador JK"

def main():
    print("Conectando a la base de datos...")
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == USERNAME).first()
        if existing:
            print(f"El usuario '{USERNAME}' ya existe.")
            return

        admin = User(
            id=uuid.uuid4(),
            username=USERNAME,
            hashed_password=get_password_hash(PASSWORD),
            role=UserRole.admin,
            is_active=True,
            full_name=FULL_NAME,
        )
        db.add(admin)
        db.commit()
        print(f"✅ Usuario {USERNAME} creado exitosamente con la contraseña {PASSWORD}")
    except Exception as e:
        print(f"❌ Error al crear usuario: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
