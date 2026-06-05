import os
import mysql.connector
from mysql.connector import pooling

_pool = None


def _make_pool():
    return pooling.MySQLConnectionPool(
        pool_name="sensemark",
        pool_size=5,
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        connection_timeout=30,
        autocommit=True,
    )


def get_pool():
    global _pool
    if _pool is None:
        _pool = _make_pool()
    return _pool


def query(sql, params=None):
    """Execute a SELECT and return a list of dicts with JSON-safe values."""
    pool = get_pool()
    conn = pool.get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        rows = cursor.fetchall()
        cursor.close()
        result = []
        for row in rows:
            clean = {}
            for k, v in row.items():
                if v is None:
                    clean[k] = None
                elif hasattr(v, 'strftime'):
                    clean[k] = v.strftime('%Y-%m-%d %H:%M:%S')
                elif isinstance(v, (bytes, bytearray)):
                    clean[k] = v.decode('utf-8', errors='replace')
                else:
                    clean[k] = v
            result.append(clean)
        return result
    finally:
        conn.close()


def is_available():
    """Return True if the DB is reachable."""
    try:
        query("SELECT 1 AS ok")
        return True
    except Exception:
        return False
