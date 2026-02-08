# auto-diagram

This project runs a FastAPI app that renders diagrams to PNG using Graphviz.

**Files:**
- **`app`**: ASGI application and renderer.
- **`web`**: Frontend HTML index pages.
- **`sample`**: Example input specs.
- **`requirements.txt`**: Python dependencies.
- **`Dockerfile`**: Docker container configuration.
- **`docker-compose.yml`**: Docker Compose setup for easy deployment.

**Prerequisites**:
- **Python**: 3.8+ installed (for local development).
- **Graphviz**: System package (automatically installed in Docker, or `apt-get install graphviz` on Linux, `brew install graphviz` on macOS).
- **Virtual environment (recommended)**: create with `python -m venv venv`.

**Setup (Local Development)**:
- **Activate venv (Windows)**: `venv\Scripts\activate`
- **Install deps**: `pip install -r requirements.txt`

**Run with Uvicorn (development)**:

Use the ASGI app in [app/main.py](app/main.py#L1-L30) as the entrypoint.

```
# with uvicorn installed from requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# or using python -m
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Run with Uvicorn (production-like)**:

```
# example with multiple workers (adjust worker count as needed)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Quick tests**:
- **Health check**: `curl http://127.0.0.1:8000/health` should return `{"status":"ok"}`.
- **Open UI**: Visit `http://127.0.0.1:8000/` in your browser.
- **Render sample**:

```
curl -X POST -H "Content-Type: application/json" -d @sample/example1.json \
	http://127.0.0.1:8000/render --output out.png
```

---

## Docker Deployment

### Prerequisites
- **Docker**: Installed and running.
- **Docker Compose**: (Optional, but recommended).

### Quick Start with Docker Compose

The easiest way to run the application in a container:

```bash
docker-compose up -d
```

This will:
- Build the Docker image
- Start the container on port 8000
- Enable health checks and automatic restarts

Access the UI at: `http://localhost:8000`

### Docker Build and Run

**Build the image:**

```bash
docker build -t auto-diagram:latest .
```

**Run the container:**

```bash
docker run -d \
  --name auto-diagram \
  -p 8000:8000 \
  --restart unless-stopped \
  auto-diagram:latest
```

**Stop the container:**

```bash
docker stop auto-diagram
docker rm auto-diagram
```

### Docker Image Details

The Docker image:
- **Base**: `python:3.11-slim` (small, optimized image)
- **Includes**: Graphviz system package + Python dependencies
- **Exposed port**: 8000
- **Health check**: Automatic monitoring of `/health` endpoint
- **Restart policy**: `unless-stopped`

---

## Production Deployment

### Environment Variables

Currently, no environment variables are required. The app serves files and renders diagrams automatically.

### Performance Considerations

1. **Workers**: Default config runs 1 worker. For production, use multiple workers:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

To set workers in Docker, modify the docker-compose or Dockerfile:

```yaml
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

2. **Memory**: Graphviz rendering can be memory-intensive. Set limits in docker-compose:

```yaml
deploy:
  resources:
    limits:
      memory: 1G
```

3. **Reverse Proxy**: For production, run behind a reverse proxy (nginx, caddy, etc.):

```nginx
server {
    listen 80;
    server_name auto-diagram.example.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Kubernetes & Cloud Deployment

**Docker image registry**:

Push to your registry (Docker Hub, ECR, GCR, etc.):

```bash
docker tag auto-diagram:latest myregistry/auto-diagram:latest
docker push myregistry/auto-diagram:latest
```

**Kubernetes example**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auto-diagram
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auto-diagram
  template:
    metadata:
      labels:
        app: auto-diagram
    spec:
      containers:
      - name: auto-diagram
        image: myregistry/auto-diagram:latest
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 30
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: auto-diagram
spec:
  type: LoadBalancer
  selector:
    app: auto-diagram
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
```

### Docker Compose with Nginx (Production)

```yaml
version: '3.8'

services:
  app:
    build: .
    restart: unless-stopped
    expose:
      - 8000
    deploy:
      resources:
        limits:
          memory: 512M

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    restart: unless-stopped
```

**nginx.conf**:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:8000;
    }

    server {
        listen 80;
        client_max_body_size 10M;

        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

---

**Notes**:
- `requirements.txt` already lists `uvicorn` and `fastapi` so `pip install -r requirements.txt` is sufficient.
- If deploying behind a process manager or reverse proxy, run Uvicorn as a service or use a production ASGI server orchestration.
- Graphviz must be installed for diagram rendering. Docker includes it automatically.
- For high-traffic scenarios, consider load balancing multiple container instances.

auto-diagram/
app/
main.py
diagram_renderer.py
web/
index.html
requirements.txt
```
sample/
example1.json
example2.json
```
