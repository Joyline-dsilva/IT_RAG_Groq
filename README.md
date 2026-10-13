# Deskwise — IT document RAG with Groq

A Python backend and a responsive HTML/CSS/JavaScript interface. Paste your own IT document, or upload a PDF, DOCX, TXT or Markdown file. Ask questions and expand retrieved passages to review the evidence.

## Requirements

- Windows laptop with Python 3.11 or 3.12 (recommended), VS Code and its Microsoft Python extension.
- Groq account, API key and access to `llama-3.1-8b-instant`.
- Internet for package installation and Groq answers.
- About 1 GB free disk space for a small installation; 2 GB gives comfortable headroom. These are estimates, not measured Windows installation sizes. Large files and pip's download cache can add more.
- 4 GB total system RAM can work for a small collection; 8 GB is preferable. No dedicated GPU is needed.

The model runs on Groq, so you do not download Llama or Ollama. Retrieval uses local TF-IDF keyword vectors; there are no embedding-model downloads, PyTorch, Docker, Node.js, paid vector database or separate frontend build.

## Step 1 — Open the project

Extract `IT_RAG_Groq.zip`. In VS Code, choose **File → Open Folder** and open the extracted `it-rag` folder. You should see `app.py`, `requirements.txt`, `templates` and `static` directly in the VS Code Explorer.

Install the Microsoft **Python** extension from VS Code Extensions (Ctrl+Shift+X).

## Step 2 — Create a virtual environment

Choose **Terminal → New Terminal**. Use the Windows commands below. Run them one at a time from the project folder:

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If Windows cannot find `python`, try `py --version`, then use `py -m venv .venv`. Install Python 3.11 or 3.12 if neither command works. If you have several versions and Python 3.12 is installed, `py -3.12 -m venv .venv` selects it explicitly.

Press **Ctrl+Shift+P → Python: Select Interpreter → .venv\Scripts\python.exe**. These commands use the virtual environment directly, so PowerShell activation/execution policy changes are unnecessary. Do not add the project to system PATH.

macOS/Linux alternative:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

## Step 3 — Add your Groq key

Go to https://console.groq.com/keys and create an API key. Check your account's current model access, limits and billing before use.

In VS Code, create a file named exactly **`.env`** next to `app.py`. Paste:

```dotenv
GROQ_API_KEY=paste_your_groq_api_key_here
```

Replace the placeholder with your real key and save. Keep the key in this local file; do not put it in HTML or JavaScript, commit it to Git, or share it in screenshots/chat. `.env.example` is only a template: the app loads `.env`.

The Python backend uses Groq's SDK and sends the request with `model="llama-3.1-8b-instant"`.

## Step 4 — Start the website

```powershell
.\.venv\Scripts\python.exe app.py
```

Open **http://127.0.0.1:5000** in your browser. Leave the VS Code terminal running while using the website. Ctrl+C stops the server.

On macOS/Linux use `.venv/bin/python app.py`.

## Step 5 — Paste your document

1. Click **Paste document text**.
2. Enter a name such as `IT Troubleshooting Procedures`.
3. Paste the full document.
4. Click **Add to knowledge base**.
5. Ask a question using terms from your document, such as `What should I do if Outlook is not receiving emails?`.
6. Expand **Retrieved passages** below the answer to verify the instructions.

You can also click **Add a document** for PDF, DOCX, TXT or MD. TXT/MD must be UTF-8. Scanned/image PDFs need OCR first; this app does not perform OCR. Word tables in the main document body are read; headers, footers and text boxes are not imported.

The four starter questions are UI suggestions only. There is no built-in company knowledge or sample procedure loaded automatically. Add your own document first.

## How the RAG works

1. Python extracts text and saves it in `data/knowledge.db` (SQLite).
2. It splits the text into roughly 1,100-character passages with overlap.
3. TF-IDF ranks passages by keyword similarity to your question.
4. Up to five matching passages and your question are sent to Groq.
5. Llama generates a document-grounded answer with requested source references.
6. The website shows the answer and the actual retrieved passages.

This is lightweight retrieval-augmented generation (RAG), not model training. TF-IDF is lexical retrieval: it works best when your question uses similar words to the document. Synonyms and paraphrases can be missed. A semantic embedding retriever is a future upgrade if you need stronger matching.

Only relevant passages, your question and the system instructions are sent by this app in the generation request, not the complete stored document collection. Document content is stored on your laptop. This does **not** make generation private or offline: Groq receives the retrieved text. Follow your organization's rules for sending company information to an external provider.

Source numbers and grounding are requested through prompting, not independently proved. A matching passage can still be irrelevant, and the model can make mistakes or mis-cite evidence. Always inspect sources. The app does not execute troubleshooting commands.

## What is saved?

- Documents remain in `data/knowledge.db` after restarting the app.
- The original uploaded file is not retained: extracted text is retained.
- Chat is held only in the current page and disappears on refresh.
- Each question is independent. Ask complete questions rather than “what about step two?”
- New conversation clears visible chat but keeps documents.
- Removing a document removes it from future retrieval, but already displayed answers remain until cleared. Normal SQLite deletion is not secure erasure.
- Back up `data/knowledge.db` while the app is stopped if you want to retain your knowledge base.

## Limits and running costs

This is a local single-user starter app. It binds to `127.0.0.1` and has no shared-user login. Do not expose the Flask development server to the public internet. Production or office-wide access needs authentication, HTTPS, deployment configuration and per-user access controls.

Limits: 12 MB request size, 300 PDF pages, 1 million extracted characters per document and about 5 million total corpus characters. Retrieval rebuilds its in-memory index for every question; this favors simplicity over performance for large collections.

The application code and local libraries do not charge usage fees. Groq usage depends on the current account plan, model access, token usage and rate limits. The Groq API is a separate service from a ChatGPT subscription.

## Common fixes

| Problem | Fix |
|---|---|
| `ModuleNotFoundError` | Install requirements with the `.venv` Python command above and run with that same Python. |
| API key missing or rejected | Check that the file is `.env`, not `.env.txt`, in the same folder as `app.py`. Correct the key and restart the app. An existing system `GROQ_API_KEY` takes priority over `.env`. |
| API key configured but answers fail | The status only checks whether a key is present, not whether it is valid. Check Groq account/model access and internet connection. |
| Rate limit | Wait before retrying; check your Groq account's current limits. |
| No matching passage | Add the relevant document; phrase the question using its terminology. |
| Scanned PDF produces no text | OCR the PDF or paste the document text. |
| Port 5000 in use | Stop the other app using that port or close an earlier copy of this app. |
| Terminal stopped | Run the start command again. |
| After restarting, requests say refresh | Refresh the browser page; the request protection token changes on restart. |

## Files and where to edit

| File | Purpose |
|---|---|
| `app.py` | Python server, document ingestion, retrieval, Groq calls |
| `templates/index.html` | Frontend HTML layout |
| `static/style.css` | Responsive purple/white UI styles |
| `static/app.js` | Chat, upload, paste, source display |
| `requirements.txt` | Python packages |
| `.env.example` | API key template; create your own `.env` |
| `test_app.py` | Offline tests with a mocked Groq response |

To run the included offline tests after installation:

```powershell
.\.venv\Scripts\python.exe -m unittest -v test_app
```

Official references: https://console.groq.com/docs/quickstart , https://console.groq.com/docs/model/llama-3.1-8b-instant , https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html
"# IT_RAG_Groq" 
