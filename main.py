from io import BytesIO
from os import getenv
from pathlib import Path
from typing import Any, Optional
import hashlib
import re

import chromadb
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from llama_index.core import Document, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore

CHROMA_PATH = Path(getenv("CHROMA_PATH", Path(__file__).resolve().parent / "chroma_data"))
COLLECTION_NAME = "dashboard_leads"

app = FastAPI()

# Also kept in memory for this process. Chroma on disk is the source of truth.
pending_documents: list[Document] = []
_chroma_client: Optional[Any] = None


def row_to_text(row: pd.Series) -> str:
    lines: list[str] = []
    for column, value in row.items():
        if pd.isna(value):
            continue
        text = str(value).strip()
        if not text:
            continue
        lines.append(f"{column}: {text}")
    return "\n".join(lines)


def rows_to_documents(frame: pd.DataFrame) -> list[Document]:
    documents: list[Document] = []
    for position, record in enumerate(frame.to_dict(orient="records"), start=1):
        series = pd.Series(record)
        text = row_to_text(series)
        if not text:
            continue
        documents.append(
            Document(
                text=text,
                metadata={
                    "company": str(series.get("Company", "") or ""),
                    "country": str(series.get("Country", "") or ""),
                    "source_row": position,
                    "source": "dashboard-csv",
                },
            )
        )
    return documents


def chroma_path() -> Path:
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    return CHROMA_PATH


def chroma_client() -> Any:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=str(chroma_path()))
    return _chroma_client


def chroma_collection():
    return chroma_client().get_or_create_collection(name=COLLECTION_NAME)


def document_id(doc: Document) -> str:
    company = re.sub(r"[^a-z0-9]+", "-", str(doc.metadata.get("company") or "empresa").lower()).strip("-")
    country = re.sub(r"[^a-z0-9]+", "-", str(doc.metadata.get("country") or "pais").lower()).strip("-")
    digest = hashlib.sha1(doc.text.encode("utf-8")).hexdigest()[:12]
    return f"{company or 'empresa'}-{country or 'pais'}-{digest}"


def persist_documents(documents: list[Document]) -> int:
    """Write LlamaIndex documents to a persistent Chroma collection and keep a VectorStoreIndex ready."""
    if not documents:
        return chroma_collection().count()
    collection = chroma_collection()
    ids = [document_id(doc) for doc in documents]
    texts = [doc.text for doc in documents]
    metas = []
    for doc in documents:
        metas.append(
            {
                "company": str(doc.metadata.get("company") or ""),
                "country": str(doc.metadata.get("country") or ""),
                "source_row": str(doc.metadata.get("source_row") or ""),
                "source": str(doc.metadata.get("source") or "dashboard-csv"),
            }
        )
    collection.upsert(ids=ids, documents=texts, metadatas=metas)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    StorageContext.from_defaults(vector_store=vector_store)
    return collection.count()


def prepare_for_index(documents: list[Document]) -> list[Document]:
    pending_documents.extend(documents)
    persist_documents(documents)
    return documents


def fold_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def query_neighbors(text: str, n: int = 5) -> list[dict]:
    collection = chroma_collection()
    total = collection.count()
    if total == 0:
        raise ValueError("O índice está vazio. Envie um CSV em /enviar.")
    take = max(1, min(n, total))
    raw = collection.query(
        query_texts=[text],
        n_results=take,
        include=["documents", "metadatas", "distances"],
    )
    documents = (raw.get("documents") or [[]])[0]
    metadatas = (raw.get("metadatas") or [[]])[0]
    distances = (raw.get("distances") or [[]])[0]
    ids = (raw.get("ids") or [[]])[0]
    hits: list[dict] = []
    for index, document in enumerate(documents):
        hits.append(
            {
                "id": ids[index] if index < len(ids) else "",
                "text": document,
                "metadata": metadatas[index] if index < len(metadatas) else {},
                "distance": distances[index] if index < len(distances) else None,
            }
        )
    return hits


def lead_blob(company: str, country: str, role: str, summary: str) -> str:
    lines = [f"Company: {company}".strip(), f"Country: {country}".strip()]
    if role.strip():
        lines.append(f"Role: {role.strip()}")
    if summary.strip():
        lines.append(summary.strip())
    return "\n".join(line for line in lines if line and not line.endswith(":"))


def indexed_company(company: str) -> str:
    """Return the stored company name when the folded name is already in Chroma."""
    wanted = fold_name(company)
    if not wanted:
        return ""
    raw = chroma_collection().get(include=["metadatas"])
    for meta in raw.get("metadatas") or []:
        name = str((meta or {}).get("company") or "")
        if fold_name(name) == wanted:
            return name
    return ""


def match_against_index(company: str, country: str, role: str = "", summary: str = "") -> dict:
    text = lead_blob(company, country, role, summary) or company
    hits = query_neighbors(text, n=5)
    exact_name = indexed_company(company)
    exact = bool(exact_name)
    best = hits[0]["distance"] if hits else None
    neighbor = exact_name or (str((hits[0].get("metadata") or {}).get("company") or "") if hits else "")
    return {
        "match": exact,
        "exact": exact,
        "distance": best,
        "neighbor": neighbor,
        "neighbors": hits[:3],
        "note": (
            f"Combina com {exact_name} no índice."
            if exact
            else "Não parece uma empresa já confirmada no índice."
        ),
    }


class QueryBody(BaseModel):
    q: str = Field(min_length=2)
    n: int = 5


class MatchBody(BaseModel):
    company: str = ""
    country: str = ""
    role: str = ""
    summary: str = ""


def looks_like_csv(name: str, raw: bytes) -> bool:
    lowered = name.lower()
    if lowered.endswith(".csv") or lowered.endswith(".csv.txt"):
        return True
    head = raw.lstrip(b"\xef\xbb\xbf")[:200].decode("utf-8", errors="ignore")
    return "company" in head.lower() and "," in head


def read_dashboard_csv(raw: bytes) -> pd.DataFrame:
    return pd.read_csv(BytesIO(raw), encoding="utf-8-sig")


def ingest_bytes(name: str, raw: bytes) -> dict:
    if not raw.strip():
        raise ValueError("O arquivo está em branco. Baixe de novo em Download CSV no dashboard.")
    if name and not looks_like_csv(name, raw):
        raise ValueError("Esse não parece o CSV do dashboard. Use o botão Download CSV da busca pronta.")
    try:
        frame = read_dashboard_csv(raw)
    except Exception as exc:
        raise ValueError(f"Não foi possível ler o arquivo: {exc}") from exc
    if frame.empty:
        raise ValueError("O CSV não tem empresas. Abra uma busca que já terminou e clique em Download CSV.")
    documents = prepare_for_index(rows_to_documents(frame))
    stored = chroma_collection().count()
    return {
        "ingested": len(documents),
        "columns": [str(column) for column in frame.columns],
        "ready_for_index": True,
        "queued": stored,
        "chroma_path": str(chroma_path()),
        "chroma_count": stored,
        "preview": documents[0].text if documents else "",
    }


def upload_html(message: str = "", ok: bool = False) -> str:
    note = ""
    if message:
        color = "#0a7" if ok else "#b00"
        note = f'<p style="color:{color};white-space:pre-wrap;">{message}</p>'
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Enviar CSV</title>
  </head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;">
    <h1>Enviar CSV do dashboard</h1>
    <p>1. No dashboard (URL antiga), abra a busca pronta e clique em <strong>Download CSV</strong>.</p>
    <p>2. Aqui, escolha esse arquivo e envie. Não envie o zip.</p>
    {note}
    <form action="/enviar" method="post" enctype="multipart/form-data">
      <p><input type="file" name="file" accept=".csv,text/csv,.txt" required /></p>
      <p><button type="submit" style="padding:0.7rem 1.1rem;background:#111;color:#fff;border:0;border-radius:8px;">Enviar CSV</button></p>
    </form>
    <p><a href="/perguntar">Perguntar ao índice</a></p>
  </body>
</html>
"""


@app.get("/")
def health() -> dict:
    try:
        stored = chroma_collection().count()
        path = str(chroma_path())
    except Exception:
        stored = 0
        path = str(CHROMA_PATH)
    return {"status": "ok", "chroma_path": path, "chroma_count": stored}


@app.get("/enviar", response_class=HTMLResponse)
def upload_page() -> str:
    return upload_html()


@app.post("/enviar", response_class=HTMLResponse)
async def upload_form(file: UploadFile = File(...)) -> str:
    raw = await file.read()
    try:
        result = ingest_bytes(file.filename or "", raw)
    except ValueError as exc:
        return upload_html(str(exc), ok=False)
    except Exception as exc:
        return upload_html(f"Falha ao processar o arquivo: {exc}", ok=False)
    return upload_html(
        f"Certo. {result['ingested']} empresas gravadas no Chroma ({result['chroma_count']} no índice).",
        ok=True,
    )


def packaged_zip(name: str) -> Path:
    path = Path(__file__).with_name(name)
    if path.is_file():
        return path
    public = Path("public") / name
    if public.is_file():
        return public
    raise HTTPException(status_code=404, detail="O zip ainda não está neste servidor.")


@app.get("/baixar", response_class=HTMLResponse)
def download_page() -> str:
    return """<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Implantar no Render</title>
  </head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;">
    <h1>Baixe os arquivos. Não cole.</h1>
    <p>Os commits Update tsconfig.json e Update page.tsx no GitHub não mudaram nenhuma linha. O Render repetiu o erro antigo. Não cole código. Não suba lote.</p>
    <h2>1. tsconfig.json — raiz do repo</h2>
    <p><a href="/hotfix/tsconfig.json" download="tsconfig.json" style="display:inline-block;padding:0.8rem 1.2rem;background:#111;color:#fff;text-decoration:none;border-radius:8px;">Baixar tsconfig.json</a></p>
    <p>Depois abra <a href="https://github.com/flavioperim304-byte/exportsales2/upload/main">github.com/flavioperim304-byte/exportsales2/upload/main</a> e arraste só esse arquivo. Commit. No GitHub tem de aparecer app/**/*.ts (não **/*.ts).</p>
    <h2>2. page.tsx — pasta app/leads</h2>
    <p><a href="/hotfix/page.tsx" download="page.tsx" style="display:inline-block;padding:0.8rem 1.2rem;background:#111;color:#fff;text-decoration:none;border-radius:8px;">Baixar page.tsx</a></p>
    <p>Depois abra <a href="https://github.com/flavioperim304-byte/exportsales2/upload/main/app/leads">github.com/.../upload/main/app/leads</a> e arraste só esse arquivo. Commit. A primeira linha tem de ter a palavra Suspense.</p>
    <h2>3. Render</h2>
    <p>Serviço Node exportsales → Manual Deploy → Deploy latest commit. Não apague o disco. Python já está ok: não mexa e não reenvie o CSV do Panamá.</p>
    <p>Pronto quando https://exportsales.onrender.com/trade abrir.</p>
  </body>
</html>
"""


@app.get("/export-desk.zip")
def download_project_zip() -> FileResponse:
    return FileResponse(
        packaged_zip("export-desk.zip"),
        media_type="application/octet-stream",
        filename="export-desk.zip",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.head("/export-desk.zip")
def head_project_zip():
    path = packaged_zip("export-desk.zip")
    return HTMLResponse(
        content="",
        status_code=200,
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Disposition": 'attachment; filename="export-desk.zip"',
            "Content-Length": str(path.stat().st_size),
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/lote-1.zip")
def download_lote_1() -> FileResponse:
    return FileResponse(
        packaged_zip("lote-1.zip"),
        media_type="application/octet-stream",
        filename="lote-1.zip",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/lote-2.zip")
def download_lote_2() -> FileResponse:
    return FileResponse(
        packaged_zip("lote-2.zip"),
        media_type="application/octet-stream",
        filename="lote-2.zip",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/consertar-build.zip")
def download_consertar_build() -> FileResponse:
    return FileResponse(
        packaged_zip("consertar-build.zip"),
        media_type="application/octet-stream",
        filename="consertar-build.zip",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/hotfix/tsconfig.json")
def download_hotfix_tsconfig() -> FileResponse:
    path = Path(__file__).with_name("tsconfig.json")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="tsconfig.json não está neste servidor.")
    return FileResponse(
        path,
        media_type="application/json",
        filename="tsconfig.json",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/hotfix/page.tsx")
def download_hotfix_leads_page() -> FileResponse:
    path = Path(__file__).resolve().parent / "app" / "leads" / "page.tsx"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="page.tsx não está neste servidor.")
    return FileResponse(
        path,
        media_type="text/plain; charset=utf-8",
        filename="page.tsx",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/fastapi-rag.zip")
def download_zip() -> FileResponse:
    return FileResponse(packaged_zip("fastapi-rag.zip"), media_type="application/zip", filename="fastapi-rag.zip")


@app.get("/desk-rag.zip")
def download_desk_zip() -> FileResponse:
    return FileResponse(
        packaged_zip("desk-rag.zip"),
        media_type="application/octet-stream",
        filename="desk-rag.zip",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.head("/desk-rag.zip")
def head_desk_zip():
    path = packaged_zip("desk-rag.zip")
    return HTMLResponse(
        content="",
        status_code=200,
        headers={
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="desk-rag.zip"',
            "Content-Length": str(path.stat().st_size),
        },
    )


@app.post("/api/v1/ingest-csv")
async def ingest_csv(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    try:
        return ingest_bytes(file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/query")
def query_index(body: QueryBody) -> dict:
    try:
        hits = query_neighbors(body.q.strip(), n=body.n)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"q": body.q, "hits": hits, "chroma_count": chroma_collection().count()}


@app.post("/api/v1/match")
def match_lead(body: MatchBody) -> dict:
    if not body.company.strip() and not body.summary.strip():
        raise HTTPException(status_code=400, detail="Informe a empresa ou um resumo.")
    try:
        return match_against_index(body.company, body.country, body.role, body.summary)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def ask_html(message: str = "", ok: bool = False) -> str:
    note = ""
    if message:
        color = "#0a7" if ok else "#b00"
        note = f'<p style="color:{color};white-space:pre-wrap;">{message}</p>'
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Perguntar ao índice</title>
  </head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem;">
    <h1>Perguntar ao RAG</h1>
    <p>O índice compara com as empresas já enviadas no CSV. Exemplo: distribuidor de hair care na Colômbia.</p>
    {note}
    <form action="/perguntar" method="post">
      <p><textarea name="q" rows="4" style="width:100%;" required placeholder="Quem é distribuidor de hair care na Colômbia?"></textarea></p>
      <p><button type="submit" style="padding:0.7rem 1.1rem;background:#111;color:#fff;border:0;border-radius:8px;">Buscar</button></p>
    </form>
    <p><a href="/enviar">Enviar CSV</a> · <a href="/perguntar">Perguntar</a></p>
  </body>
</html>
"""


@app.get("/perguntar", response_class=HTMLResponse)
def ask_page() -> str:
    return ask_html()


@app.post("/perguntar", response_class=HTMLResponse)
async def ask_form(q: str = Form(...)) -> str:
    try:
        hits = query_neighbors(q.strip(), n=5)
    except ValueError as exc:
        return ask_html(str(exc), ok=False)
    except Exception as exc:
        return ask_html(f"Falha na busca: {exc}", ok=False)
    if not hits:
        return ask_html("Nenhuma empresa próxima no índice.", ok=False)
    lines = []
    for hit in hits:
        company = (hit.get("metadata") or {}).get("company") or "empresa"
        country = (hit.get("metadata") or {}).get("country") or ""
        dist = hit.get("distance")
        dist_txt = f" · distância {float(dist):.2f}" if dist is not None else ""
        lines.append(f"{company} ({country}){dist_txt}")
    return ask_html("Mais próximas:\n" + "\n".join(lines), ok=True)
