# jkpos - Sistema POS

Sistema de Punto de Venta (POS) con backend en FastAPI y frontend en Next.js.

## Pasos para el Despliegue

### 1. Supabase (Storage)
1. Crea un proyecto nuevo en [Supabase](https://supabase.com).
2. Ve a Project Settings > API y copia la **Project URL** y la **service_role key**.

### 2. Backend (Railway)
1. En [Railway](https://railway.app), crea un nuevo proyecto conectado a este repositorio de GitHub.
2. Añade el servicio de base de datos **PostgreSQL**.
3. Railway detectará automáticamente el archivo `railway.toml` en la carpeta `backend/` o en la raíz para el build.
4. Ve a las variables de entorno del servicio backend y añade:
   - `CORS_ORIGINS`: `["https://jkpos.vercel.app"]` (o la URL que te dé Vercel luego).
   - `SECRET_KEY`: (Copia el valor del archivo `backend/.env` que se generó o crea uno nuevo).
   - `SUPABASE_URL`: (De Supabase).
   - `SUPABASE_KEY`: (De Supabase).
   *(Nota: `DATABASE_URL` se inyecta automáticamente por Railway).*

### 3. Frontend (Vercel)
1. En [Vercel](https://vercel.com), crea un nuevo proyecto.
2. Selecciona este repositorio y elige como *Root Directory* la carpeta `front`.
3. En las variables de entorno añade:
   - `NEXT_PUBLIC_API_URL`: La URL pública que te entregó Railway para el backend, agregando `/api/v1` al final (ej. `https://mi-backend.up.railway.app/api/v1`).
4. Dale a **Deploy**.

## Desarrollo Local
Puedes levantar todo el entorno con Docker usando el archivo `docker-compose.yml`:
```bash
docker-compose up --build
```
