import chromadb
import os
import hashlib
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.vector_db")
os.makedirs(DB_PATH, exist_ok=True)

client = chromadb.PersistentClient(path=DB_PATH)


def get_collection_id(filename: str) -> str:
    return hashlib.md5(filename.encode()).hexdigest()[:12]


def create_collection(collection_id: str) -> chromadb.Collection:
    try:
        return client.get_or_create_collection(
            name=collection_id,
            metadata={"hnsw:space": "cosine"},
        )
    except Exception:
        return client.create_collection(name=collection_id)


def get_collection(collection_id: str) -> Optional[chromadb.Collection]:
    try:
        return client.get_collection(name=collection_id)
    except Exception:
        return None


def delete_collection(collection_id: str):
    try:
        client.delete_collection(name=collection_id)
    except Exception:
        pass


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if end < len(text):
            next_overlap_start = max(start, end - overlap)
            next_newline = text.find("\n", next_overlap_start, end)
            if next_newline != -1:
                end = next_newline + 1
                chunk = text[start:end]
        chunk = chunk.strip()
        if len(chunk) > 50:
            chunks.append(chunk)
        start = max(start + 1, end - overlap)
    return chunks


def store_document(collection_id: str, text: str, filename: str) -> str:
    collection = create_collection(collection_id)
    chunks = chunk_text(text)
    
    ids = [f"{collection_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "filename": filename,
            "chunk_index": i,
            "total_chunks": len(chunks),
        }
        for i in range(len(chunks))
    ]
    
    collection.add(
        documents=chunks,
        ids=ids,
        metadatas=metadatas,
    )
    
    return collection_id


def query_document(collection_id: str, query: str, n_results: int = 5) -> str:
    collection = get_collection(collection_id)
    if not collection:
        return ""
    
    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, collection.count()),
    )
    
    if not results.get("documents") or not results["documents"][0]:
        return ""
    
    chunks = results["documents"][0]
    return "\n\n---\n\n".join(chunks)
