FROM python:3.11-slim

# Install system deps
RUN apt-get update && apt-get install -y \
    curl \
    zstd \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000 11434

CMD bash -c "\
    ollama serve & \
    sleep 5 && \
    uvicorn main:app --host 0.0.0.0 --port 8000 \
"
