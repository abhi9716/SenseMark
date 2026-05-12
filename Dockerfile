FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ChromaDB's default embedding model (all-MiniLM-L6-v2 ONNX, ~90MB)
# so it's baked into the image — no network fetch on container start, no first-query lag.
RUN python -c "import chromadb; \
    c = chromadb.EphemeralClient(); \
    col = c.create_collection('warmup'); \
    col.add(documents=['warmup text'], ids=['1']); \
    col.query(query_texts=['warmup text'], n_results=1); \
    print('Embedding model cached at build time')"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
