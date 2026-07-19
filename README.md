# 🗂️ Dynamic Form Builder — DevOps/DevSecOps Starter Project

Un ecosistema de microservicios completo para practicar DevOps, DevSecOps y escalabilidad. Implementa un caso de uso empresarial real: **diseño dinámico de formularios, recolección de respuestas y análisis asíncrono por un agente en segundo plano**.

---

## 📐 Arquitectura General

```mermaid
flowchart TD
    subgraph Browser ["🌐 Navegador del Usuario"]
        UI["React SPA"]
    end

    subgraph Docker ["🐳 Ecosistema Docker · Red: devops_network"]
        FE["Frontend · Nginx Unprivileged\n:8080 (público)"]
        API["API Agent · Express.js\n:5000 (solo interno)"]
        WRK["Worker Agent · Node.js\n:5001 health (solo interno)"]
        RDS[("Redis · Broker\n:6379 (solo interno)")]
        DB[("PostgreSQL 16\n:5432 (solo interno)")]
    end

    UI -->|"HTTP · carga SPA"| FE
    FE -->|"Reverse Proxy /api/* /health /ready /live"| API
    API -->|"INSERT forms / submissions"| DB
    API -->|"RPUSH submissions_queue"| RDS
    WRK -->|"BLPOP submissions_queue"| RDS
    WRK -->|"SELECT forms + submissions"| DB
    WRK -->|"UPDATE status + analysis"| DB
```

> **Solo el puerto 8080 está expuesto al host.** Los puertos 5000, 5432 y 6379 son internos a la red Docker.

---

## 📁 Estructura del Repositorio

```
practica_devops/
│
├── 📄 docker-compose.yml          # Orquesta los 5 servicios
├── 📄 .env.example                # Plantilla de configuración
├── 📄 README.md                   # Esta documentación
│
├── 📂 db/
│   └── init.sql                   # Esquema SQL (tablas forms + submissions)
│
├── 📂 api/                        # Agente 1: API HTTP
│   ├── Dockerfile                 # Multi-stage build · usuario node (non-root)
│   ├── package.json               # Scripts: start · dev · test
│   ├── src/
│   │   ├── index.js               # Express app + routes + auto-provisioning DB
│   │   ├── config.js              # Validación de variables de entorno
│   │   ├── logger.js              # Logs JSON estructurados (Winston)
│   │   ├── database.js            # Pool PostgreSQL + cliente Redis
│   │   └── validation.js          # ✅ Lógica de validación de formularios (testeable)
│   └── test/
│       └── validation.test.js     # 🧪 8 pruebas unitarias (node:test)
│
├── 📂 worker/                     # Agente 2: Worker asíncrono
│   ├── Dockerfile                 # Multi-stage build · usuario node (non-root)
│   ├── package.json               # Scripts: start · dev · test
│   ├── src/
│   │   ├── index.js               # Bucle de consumo Redis + HTTP health server
│   │   ├── config.js              # Validación de variables de entorno
│   │   ├── logger.js              # Logs JSON estructurados (Winston)
│   │   ├── database.js            # Pool PostgreSQL + cliente Redis
│   │   └── validator.js           # ✅ Validación + analítica de respuestas (testeable)
│   └── test/
│       └── validator.test.js      # 🧪 11 pruebas unitarias (node:test)
│
├── 📂 frontend/                   # React SPA
│   ├── Dockerfile                 # Multi-stage: Node builder → Nginx runner
│   ├── nginx.conf                 # Reverse proxy + serving estático
│   ├── index.html                 # Entry point HTML con Google Fonts
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx               # Bootstrap de React
│       ├── App.jsx                # Toda la lógica de la SPA (2 pestañas)
│       ├── App.css                # Estilos de componentes
│       └── index.css              # Design system: colores, fuentes, animaciones
│
└── 📂 tests/
    └── performance/
        └── artillery-load-test.yml  # 🔥 Prueba de carga y estrés (Artillery)
```

---

## 🗄️ Base de Datos — Esquema y Aprovisionamiento

### Tablas

#### `forms` — Plantillas de Formularios
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` (PK) | Identificador único generado automáticamente |
| `title` | `VARCHAR(255)` | Título visible del formulario |
| `description` | `TEXT` | Descripción o instrucciones del formulario |
| `fields` | `JSONB` | Array JSON con la definición de cada campo |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación (auto) |
| `updated_at` | `TIMESTAMPTZ` | Última modificación (auto-trigger) |

**Estructura de cada campo en `fields`:**
```json
{
  "name": "pais",
  "label": "País de Residencia",
  "type": "select",
  "required": true,
  "options": ["Colombia", "España", "México"]
}
```
> Los tipos de campo válidos son: `text`, `number`, `date`, `select`.

#### `submissions` — Respuestas de Usuarios
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` (PK) | Identificador único del envío |
| `form_id` | `UUID` (FK) | Referencia a `forms.id` |
| `answers` | `JSONB` | Objeto `{ nombre_campo: valor }` |
| `status` | `VARCHAR(50)` | Estado del procesamiento (ver abajo) |
| `analysis` | `JSONB` | Reporte de métricas generado por el Worker |
| `error` | `TEXT` | Errores de validación (si aplica) |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación (auto) |
| `updated_at` | `TIMESTAMPTZ` | Última modificación (auto-trigger) |

**Ciclo de vida del estado (`status`):**
```
PENDING → PROCESSING → PROCESSED
                     ↘ FAILED
```

### ¿Cómo se crean las tablas?

El proyecto usa un **sistema dual de aprovisionamiento** para máxima resiliencia:

1. **Contenedores locales (Docker Compose)**: El archivo [db/init.sql](file:///d:/Cristian%20Silva/practica_devops/db/init.sql) se monta en `/docker-entrypoint-initdb.d/`. PostgreSQL lo ejecuta automáticamente la **primera vez** que el contenedor levanta con un volumen vacío.

2. **Auto-aprovisionamiento por código (cualquier entorno)**: La API ejecuta `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE TRIGGER` en cada inicio (en [api/src/index.js](file:///d:/Cristian%20Silva/practica_devops/api/src/index.js), función `startServer`). Esto garantiza que las tablas existan sin intervención manual, incluso contra bases de datos Cloud gestionadas (AWS RDS, GCP Cloud SQL).

---

## 🔌 Referencia Completa de la API

**URL base en local:** `http://localhost:8080`

### Endpoints de Salud y Observabilidad

| Método | Ruta | Descripción | Respuesta exitosa |
|---|---|---|---|
| `GET` | `/live` | Liveness probe: ¿está el proceso vivo? | `200 { status: "UP" }` |
| `GET` | `/ready` | Readiness probe: ¿está conectado a DB y Redis? | `200 { status: "READY", db: "UP", redis: "UP" }` |
| `GET` | `/health` | Reporte completo con latencias de cada dependencia | `200 { status: "UP", services: {...} }` |

> Kubernetes y Cloud Run usan `/live` y `/ready` para gestionar el tráfico y los reinicios automáticos.

---

### Gestión de Formularios

#### `POST /api/forms` — Crear plantilla de formulario
Registra una nueva estructura de formulario dinámico con sus campos.

**Body:**
```json
{
  "title": "Encuesta de Satisfacción",
  "description": "Formulario para evaluar la experiencia del cliente.",
  "fields": [
    { "name": "nombre", "label": "Nombre Completo", "type": "text", "required": true },
    { "name": "puntuacion", "label": "Calificación (1-10)", "type": "number", "required": true },
    { "name": "fecha_compra", "label": "Fecha de Compra", "type": "date", "required": false },
    { "name": "pais", "label": "País", "type": "select", "required": true, "options": ["Colombia", "España", "México"] },
    { "name": "comentarios", "label": "Comentarios", "type": "text", "required": false }
  ]
}
```

**Respuesta `201 Created`:**
```json
{
  "id": "uuid-del-formulario",
  "title": "Encuesta de Satisfacción",
  "fields": [...],
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Errores de validación `400 Bad Request`:**
- Título vacío o no string
- `fields` no es un array
- Algún campo sin `name` o `label`
- `type` inválido (solo: `text`, `number`, `date`, `select`)
- Campo `select` sin `options` o con array vacío

---

#### `GET /api/forms` — Listar todos los formularios
Retorna el catálogo de plantillas disponibles.

**Respuesta `200 OK`:** Array de objetos (id, title, description, created_at).

---

#### `GET /api/forms/:id` — Obtener detalle de un formulario
Retorna la definición completa incluyendo el array `fields`.

**Errores:** `400` si el ID no es UUID válido · `404` si no existe.

---

#### `DELETE /api/forms/:id` — Eliminar un formulario
Elimina la plantilla y **todas sus respuestas** (cascade).

---

### Gestión de Respuestas

#### `POST /api/forms/:id/submissions` — Enviar respuestas
Registra respuestas de un usuario para un formulario específico. El registro entra con estado `PENDING` y se encola en Redis.

**Body:**
```json
{
  "answers": {
    "nombre": "Cristian Silva",
    "puntuacion": "9",
    "fecha_compra": "2024-01-10",
    "pais": "Colombia",
    "comentarios": "Excelente servicio y atención."
  }
}
```

**Respuesta `201 Created`:**
```json
{
  "id": "uuid-del-envio",
  "form_id": "uuid-del-formulario",
  "answers": { ... },
  "status": "PENDING",
  "created_at": "2024-01-15T10:31:00Z"
}
```

> El Worker procesa este envío en segundo plano. Haz `GET` al mismo recurso en 3-5 segundos para ver el estado `PROCESSED`.

---

#### `GET /api/forms/:id/submissions` — Listar respuestas de un formulario
Retorna los últimos 50 envíos de un formulario, ordenados del más reciente al más antiguo.

---

## 🧪 Guía Completa de Pruebas

### 1. Pruebas Unitarias

Las pruebas usan el **runner nativo de Node.js** (`node:test`) — sin dependencias externas.

```bash
# Pruebas de la API (8 tests)
cd api
npm test

# Pruebas del Worker (11 tests)
cd worker
npm test
```

**Cobertura de pruebas:**

| Módulo | Archivo de Test | Qué prueba |
|---|---|---|
| `api/src/validation.js` | `api/test/validation.test.js` | Título vacío, fields no-array, campo sin nombre, campo sin label, tipo inválido, select sin opciones, formulario válido |
| `worker/src/validator.js` | `worker/test/validator.test.js` | Fechas ISO válidas e inválidas, envío completo correcto, campo requerido faltante, número con texto, fecha con formato incorrecto, select con opción inválida, promedio numérico, porcentaje de completado parcial |

---

### 2. Pruebas de Integración Manual (API Rest)

Asegúrate de que el ecosistema esté corriendo (`docker-compose up -d`) y ejecuta:

```bash
# 1. Verificar salud del sistema
curl http://localhost:8080/health | python -m json.tool

# 2. Crear un formulario
curl -s -X POST http://localhost:8080/api/forms \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Integración","fields":[{"name":"nombre","label":"Nombre","type":"text","required":true},{"name":"edad","label":"Edad","type":"number","required":true}]}' | python -m json.tool

# 3. Listar formularios (guardar el ID del paso 2)
curl http://localhost:8080/api/forms | python -m json.tool

# 4. Enviar respuestas (reemplaza FORM_ID)
curl -s -X POST http://localhost:8080/api/forms/FORM_ID/submissions \
  -H "Content-Type: application/json" \
  -d '{"answers":{"nombre":"Test User","edad":"30"}}' | python -m json.tool

# 5. Consultar respuestas (esperar ~3 segundos)
curl http://localhost:8080/api/forms/FORM_ID/submissions | python -m json.tool
```

---

### 3. Pruebas de Carga y Estrés (Artillery)

El script simula usuarios reales que crean formularios, envían respuestas y comprueban salud.

```bash
# 1. Instalar Artillery (una sola vez)
npm install -g artillery

# 2. Levantar el ecosistema
docker-compose up -d

# 3. Ejecutar la prueba de carga
artillery run tests/performance/artillery-load-test.yml

# 4. Generar reporte HTML interactivo
artillery run tests/performance/artillery-load-test.yml --output results.json
artillery report results.json
```

**Fases de carga configuradas:**
| Fase | Duración | Usuarios Virtuales |
|---|---|---|
| Warm-Up | 10s | 5 VU/s |
| Ramp-Up | 20s | 5→30 VU/s |
| Carga Sostenida | 30s | 30 VU/s |
| Pico de Estrés | 15s | 30→60 VU/s |
| Cool-Down | 10s | 60→5 VU/s |

**Umbrales de calidad (fallan el pipeline si se superan):**
- P95 de latencia ≤ 2000ms
- P99 de latencia ≤ 5000ms
- Tasa de error ≤ 1%

---

## 🚀 Guía de Inicio Rápido (Local)

### Requisitos
- Docker Desktop instalado y corriendo.
- Node.js 20+ (solo para ejecutar pruebas locales).

### Pasos

```bash
# 1. Clonar y entrar al proyecto
cd practica_devops

# 2. Configurar el entorno
cp .env.example .env   # En Windows: Copy-Item .env.example .env

# 3. Levantar todo el ecosistema
docker-compose up --build -d

# 4. Verificar que todos los contenedores están healthy
docker-compose ps

# 5. Abrir la aplicación
# → http://localhost:8080     (Interfaz gráfica)
# → http://localhost:8080/health  (Estado del sistema)

# 6. Ver logs en tiempo real
docker-compose logs -f api
docker-compose logs -f worker
```

---

## ☁️ Guía de Despliegue — Elige tu Estrategia

Hay tres formas habituales de subir este proyecto a producción. Cada una tiene ventajas distintas. Elige la que más se ajuste a tu caso.

| Estrategia | Ideal para | Costo base | Complejidad |
|---|---|---|---|
| **Opción A — Serverless (servicios separados)** | Proyectos con tráfico variable, escalar a cero | Pago por uso | Media |
| **Opción B — VM con Docker Compose** | Ambientes de staging, pruebas, equipos pequeños | Fijo mensual | Baja |

---

## 🅐 Opción A — Serverless con Servicios Separados (Cloud Run / AWS Fargate)

En este modelo **cada contenedor es un servicio cloud independiente**. No hay Docker Compose ni VM que gestionar; el proveedor cloud maneja el escalado automático.

### Diagrama de arquitectura Serverless

```
Internet
    │
    ▼
[ Load Balancer / API Gateway ]
    │                    │
    ▼                    ▼
[ Frontend          [ API Service     ─────► [ Worker Service ]
  Cloud Run ]         Cloud Run ]                Cloud Run
                         │                           │
                         ▼                           ▼
                   [ Cloud SQL /            [ Memorystore /
                     AWS RDS ]              ElastiCache ]
                    PostgreSQL                  Redis
```

### Paso 1 — Crear los servicios de base de datos gestionados

Antes de desplegar los contenedores, necesitas dos servicios gestionados del proveedor:

**Google Cloud Platform:**
```bash
# PostgreSQL (Cloud SQL)
gcloud sql instances create devops-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1

gcloud sql databases create devops_db --instance=devops-postgres
gcloud sql users create devops_user --instance=devops-postgres --password=TU_PASSWORD

# Redis (Memorystore)
gcloud redis instances create devops-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_7_0
```

**AWS:**
```bash
# PostgreSQL (RDS)
aws rds create-db-instance \
  --db-instance-identifier devops-postgres \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "16" \
  --master-username devops_user \
  --master-user-password TU_PASSWORD \
  --db-name devops_db \
  --allocated-storage 20

# Redis (ElastiCache)
aws elasticache create-cache-cluster \
  --cache-cluster-id devops-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1
```

> **Nota**: No ejecutes `init.sql`. La API crea las tablas automáticamente al arrancar (`CREATE TABLE IF NOT EXISTS`).

---

### Paso 2 — Construir y subir las imágenes al registro

```bash
# ─── Google Cloud (Artifact Registry) ───
# Habilitar el servicio (solo primera vez)
gcloud services enable artifactregistry.googleapis.com

# Crear repositorio
gcloud artifacts repositories create devops-repo \
  --repository-format=docker --location=us-central1

# Configurar Docker para usar GCR
gcloud auth configure-docker us-central1-docker.pkg.dev

# Construir y subir las 3 imágenes
docker build -t us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/api:latest ./api
docker build -t us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/worker:latest ./worker
docker build -t us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/frontend:latest ./frontend

docker push us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/api:latest
docker push us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/worker:latest
docker push us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/frontend:latest

# ─── AWS (ECR) ───
aws ecr create-repository --repository-name devops/api
aws ecr create-repository --repository-name devops/worker
aws ecr create-repository --repository-name devops/frontend

# Obtener el comando de login de ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin TU_CUENTA.dkr.ecr.us-east-1.amazonaws.com

docker build -t TU_CUENTA.dkr.ecr.us-east-1.amazonaws.com/devops/api:latest ./api
docker push TU_CUENTA.dkr.ecr.us-east-1.amazonaws.com/devops/api:latest
# (repetir para worker y frontend)
```

---

### Paso 3 — Desplegar cada servicio por separado

#### 3a. API Service (con auto-provisioning de BD)

```bash
# ─── Google Cloud Run ───
gcloud run deploy api-service \
  --image=us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/api:latest \
  --platform=managed \
  --region=us-central1 \
  --port=5000 \
  --allow-unauthenticated \
  --set-env-vars="\
NODE_ENV=production,\
DATABASE_URL=postgresql://devops_user:TU_PASSWORD@/devops_db?host=/cloudsql/TU_PROYECTO:us-central1:devops-postgres,\
REDIS_URL=redis://10.x.x.x:6379,\
JWT_SECRET=tu_jwt_secret_seguro,\
ALLOWED_ORIGINS=https://tu-frontend-url.run.app"

# ─── AWS ECS (Fargate) ───
# 1. Crear un Task Definition con el bloque "environment":
# {
#   "name": "DATABASE_URL",
#   "value": "postgresql://devops_user:TU_PASSWORD@devops-postgres.xxxx.us-east-1.rds.amazonaws.com:5432/devops_db"
# },
# {
#   "name": "REDIS_URL",
#   "value": "redis://devops-redis.xxxx.cache.amazonaws.com:6379"
# }
# 2. Crear un Service en el cluster ECS apuntando a ese Task Definition
```

#### 3b. Worker Service (sin puerto público)

El Worker no recibe peticiones HTTP externas — solo consume Redis. Despliégalo como un servicio **sin tráfico entrante**:

```bash
# ─── Google Cloud Run (Jobs o servicio interno) ───
# Opción recomendada: Cloud Run Jobs para un worker siempre activo
gcloud run jobs create worker-job \
  --image=us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/worker:latest \
  --region=us-central1 \
  --set-env-vars="\
NODE_ENV=production,\
DATABASE_URL=postgresql://...,\
REDIS_URL=redis://10.x.x.x:6379"

# Ejecutar el job continuamente
gcloud run jobs execute worker-job --region=us-central1

# ─── AWS ECS (Fargate) ───
# Misma Task Definition que la API pero con imagen del worker
# El servicio no necesita un Load Balancer asociado
```

#### 3c. Frontend

```bash
# IMPORTANTE: Antes de construir la imagen del frontend,
# edita frontend/nginx.conf para que el proxy apunte a la URL de la API:
#
# location /api/ {
#     proxy_pass https://api-service-xxxx.run.app/api/;
# }

# Luego construye y despliega:
gcloud run deploy frontend-service \
  --image=us-central1-docker.pkg.dev/TU_PROYECTO/devops-repo/frontend:latest \
  --platform=managed \
  --region=us-central1 \
  --port=8080 \
  --allow-unauthenticated
```

### Variables de entorno — Mapa completo Serverless

| Variable | API | Worker | Valor en producción |
|---|:---:|:---:|----|
| `NODE_ENV` | ✅ | ✅ | `production` |
| `PORT` | ✅ | — | `5000` (API) · `5001` (Worker health) |
| `DATABASE_URL` | ✅ | ✅ | URL completa de Cloud SQL / RDS |
| `REDIS_URL` | ✅ | ✅ | URL de Memorystore / ElastiCache |
| `JWT_SECRET` | ✅ | — | String aleatorio ≥ 32 caracteres |
| `ALLOWED_ORIGINS` | ✅ | — | URL pública del Frontend (CORS) |
| `LOG_LEVEL` | ✅ | ✅ | `info` (producción) |

> **Seguridad**: Nunca pongas contraseñas directamente en el comando CLI. Usa **Secret Manager** (GCP) o **AWS Secrets Manager** y referencia el secreto en la variable de entorno.

---

## 🅑 Opción B — VM con Docker Compose (una sola máquina)

En este modelo **todo el ecosistema corre en una sola VM** usando exactamente el mismo `docker-compose.yml` del proyecto local. Es el camino más rápido y simple para entornos de staging o demos.

### Diagrama

```
┌─────────────── VM (e.g. e2-medium, t3.small) ──────────────────┐
│                                                                  │
│   Puerto 80/443 (público) ──► Nginx (Frontend) :8080 (interno)  │
│                                    │                             │
│                              ┌─────▼──────┐                     │
│                              │ API :5000   │──► Redis :6379      │
│                              └─────┬──────┘         │           │
│                                    │           ┌────▼──────┐    │
│                              PostgreSQL        │ Worker     │    │
│                               :5432            │ :5001      │    │
└─────────────────────────────────────────────────────────────────┘
```

### Paso 1 — Crear y preparar la VM

```bash
# ─── Google Cloud (Compute Engine) ───
gcloud compute instances create devops-vm \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=http-server,https-server \
  --boot-disk-size=20GB

# Abrir el puerto 80 en el firewall
gcloud compute firewall-rules create allow-http \
  --allow tcp:80,tcp:443 \
  --target-tags=http-server

# Conectarse a la VM
gcloud compute ssh devops-vm --zone=us-central1-a

# ─── AWS (EC2) ───
# 1. Lanzar instancia t3.small con Ubuntu 22.04 en la consola
# 2. En el Security Group, abrir puerto 22 (SSH) y 80 (HTTP)
# 3. ssh -i tu-key.pem ubuntu@<IP_PUBLICA>
```

### Paso 2 — Instalar Docker en la VM

```bash
# (Ejecutar dentro de la VM)
# Instalar Docker y Docker Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # aplicar el grupo sin cerrar sesión

# Verificar instalación
docker --version
docker compose version
```

### Paso 3 — Clonar el proyecto y configurar el entorno

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/practica_devops.git
cd practica_devops

# Crear el archivo .env con los valores de producción
# ⚠️ En una VM real los servicios sí se llaman db y redis (red interna Docker)
#    por lo que los hostnames NO cambian respecto al local
cp .env.example .env
nano .env   # o vi .env
```

**Contenido de `.env` para la VM (los hostnames `db` y `redis` NO cambian):**

```bash
# Aplicación
NODE_ENV=production
LOG_LEVEL=info

# Base de datos — mismo hostname que local porque es red Docker interna
DATABASE_URL=postgresql://devops_user:CAMBIA_ESTA_PASSWORD@db:5432/devops_db
DB_USER=devops_user
DB_PASSWORD=CAMBIA_ESTA_PASSWORD
DB_NAME=devops_db

# Redis — mismo hostname que local
REDIS_URL=redis://redis:6379

# Seguridad
JWT_SECRET=GENERA_UN_STRING_ALEATORIO_DE_64_CHARS
ALLOWED_ORIGINS=http://TU_IP_PUBLICA

# Puertos internos (no cambiar)
API_PORT=5000
WORKER_HEALTH_PORT=5001
```

> **Genera JWT_SECRET seguro:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### Paso 4 — Levantar el ecosistema

```bash
# Construir y levantar todo en background
docker compose up --build -d

# Verificar que los 5 contenedores están healthy
docker compose ps

# Ver logs en tiempo real
docker compose logs -f api worker
```

### Paso 5 — Exponer al exterior con Nginx como proxy inverso del sistema (opcional pero recomendado)

Si quieres HTTPS con certificado SSL gratuito, instala **Nginx en el host** (fuera de Docker) como proxy hacia el puerto 8080:

```bash
# Instalar Nginx en el host
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# Crear el sitio
sudo nano /etc/nginx/sites-available/devops
```

Contenido del archivo:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;   # o la IP pública si no tienes dominio

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
```

```bash
# Activar el sitio
sudo ln -s /etc/nginx/sites-available/devops /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Si tienes dominio → obtener certificado SSL gratuito con Let's Encrypt
sudo certbot --nginx -d tu-dominio.com
```

### Actualizaciones y mantenimiento en la VM

```bash
# Actualizar el código
git pull origin main

# Reconstruir solo lo que cambió
docker compose up --build -d api worker frontend

# Ver uso de recursos
docker stats

# Limpiar imágenes antiguas (liberar espacio en disco)
docker image prune -f
```

### Archivos que SÍ debes modificar según la opción elegida

| Archivo | Opción A (Serverless) | Opción B (VM) |
|---|---|---|
| `.env` | No se usa (vars en Cloud Run/ECS) | ✅ Editar con passwords reales |
| `frontend/nginx.conf` | ✅ Cambiar `proxy_pass` a URL HTTPS de la API | ❌ No tocar (hostnames Docker internos funcionan igual) |
| `docker-compose.yml` | ❌ No se usa | ✅ Se usa tal cual (quizás quitar el servicio `db` si usas RDS) |

---

### Proceso de Base de Datos en ambas opciones

**No necesitas ejecutar el `init.sql` manualmente en ninguna de las dos opciones.** La API implementa auto-aprovisionamiento en su arranque ([api/src/index.js](file:///d:/Cristian%20Silva/practica_devops/api/src/index.js)):

1. La API corre `CREATE TABLE IF NOT EXISTS forms (...)` y `CREATE TABLE IF NOT EXISTS submissions (...)` en cada inicio.
2. Si las tablas ya existen, las sentencias son **idempotentes** (no hacen nada).
3. Compatible con: Docker Compose local, VM, **AWS RDS, GCP Cloud SQL, Neon, Supabase, Railway**.

| Situación | Acción requerida |
|---|---|
| Primera vez en VM | Ninguna — la API crea las tablas automáticamente |
| Primera vez en Cloud (RDS/Cloud SQL) | Ninguna — mismo auto-provisioning |
| Agregar nueva tabla en el futuro | Agregar `CREATE TABLE IF NOT EXISTS` en `api/src/index.js` |
| Ambientes de producción formales | Migrar a **Flyway** o **Liquibase** para control de versiones del esquema |

---

## 🔒 Prácticas de DevSecOps Implementadas

| Práctica | Implementación |
|---|---|
| **Cero credenciales hardcodeadas** | Variables de entorno obligatorias con validación al inicio (fail-fast) |
| **Usuarios no privilegiados** | `USER node` en API/Worker · `nginx-unprivileged` en Frontend |
| **Multi-stage Docker builds** | Imagen final sin herramientas de build, mínima superficie de ataque |
| **Headers de seguridad HTTP** | `helmet` configura CSP, X-Frame-Options, HSTS, etc. |
| **Límite de tamaño de cuerpo** | `express.json({ limit: '50kb' })` previene ataques DoS |
| **Validación de inputs** | UUID regex en params, validación de tipos en body (API + Worker) |
| **Red interna aislada** | Solo el puerto 8080 expuesto al host; DB y Redis inaccesibles desde fuera |
| **Shutdown graceful** | SIGTERM/SIGINT esperan que las tareas activas terminen antes de salir |
| **Logs estructurados JSON** | Winston emite JSON por stdout — listo para Loki, Datadog, CloudWatch |

---

## 📊 Healthchecks y Observabilidad

Cada contenedor implementa healthchecks que Docker y los orquestadores usan para gestionar el tráfico:

| Servicio | Endpoint / Comando | Intervalo |
|---|---|---|
| API | `curl -f http://localhost:5000/live` | 30s |
| Worker | `curl -f http://localhost:5001/live` | 30s |
| Frontend | `wget -q --spider http://127.0.0.1:8080/` | 30s |
| PostgreSQL | `pg_isready -U <user>` | 10s |
| Redis | `redis-cli ping` | 10s |

---

## 🔧 Comandos de Referencia Rápida

```bash
# Levantar todo
docker-compose up --build -d

# Ver estado de contenedores
docker-compose ps

# Logs en tiempo real
docker-compose logs -f api worker

# Detener todo
docker-compose down

# Detener y borrar datos (volúmenes)
docker-compose down -v

# Ejecutar pruebas unitarias de API
cd api && npm test

# Ejecutar pruebas unitarias de Worker
cd worker && npm test

# Ejecutar pruebas de carga (requiere Artillery instalado)
artillery run tests/performance/artillery-load-test.yml

# Reconstruir solo un servicio
docker-compose up --build -d api
docker-compose up --build -d worker
docker-compose up --build -d frontend
```
