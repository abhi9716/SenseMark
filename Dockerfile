FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y curl python3 python3-pip && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Install Python deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Expose ports
EXPOSE 8000 11434

# Start both Ollama + FastAPI
CMD bash -c "ollama serve & sleep 10 && uvicorn main:app --host 0.0.0.0 --port 8000"
