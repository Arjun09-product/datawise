import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# In-memory store used when Supabase credentials are absent
_mem: dict[str, list] = {}


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table: list, name: str):
        self._table = table
        self._name = name
        self._filters: list[tuple] = []
        self._mode: str | None = None
        self._payload = None

    def select(self, *_):
        self._mode = "select"
        return self

    def insert(self, data):
        self._mode = "insert"
        self._payload = data
        return self

    def update(self, data):
        self._mode = "update"
        self._payload = data
        return self

    def eq(self, field, value):
        self._filters.append((field, value))
        return self

    def execute(self):
        if self._mode == "insert":
            rows = self._payload if isinstance(self._payload, list) else [self._payload]
            self._table.extend(rows)
            return _Result(rows)

        filtered = self._table
        for field, value in self._filters:
            filtered = [r for r in filtered if r.get(field) == value]

        if self._mode == "update":
            for r in filtered:
                r.update(self._payload)
            return _Result(filtered)

        return _Result(list(filtered))


class _MemClient:
    def table(self, name: str) -> _Query:
        return _Query(_mem.setdefault(name, []), name)


def get_client():
    if SUPABASE_URL and SUPABASE_KEY:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return _MemClient()
