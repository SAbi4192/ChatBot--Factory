# {{BOT_NAME_HTML}}

**{{DOMAIN_LINE_HTML}}** expert chatbot - generated automatically by the Scarlet Chatbot Factory.

## Files

| File | Purpose |
|------|---------|
| `app.py` | Flask server - chat endpoint + health check |
| `chatbot_config.py` | The bot's identity: name, domain, system prompt, starters, theme |
| `templates/index.html` | Chat UI (HTML + CSS + JS in one file) |
| `render.yaml` | Blueprint for one-click Render deployment |

## Run locally

1. `pip install -r requirements.txt`
2. Create a `.env` file with your key (or set it in the environment): `GEMINI_API_KEY=your-key` - get one free at https://aistudio.google.com/apikey
3. `python app.py`
4. Open http://127.0.0.1:5000

## Deploy on Render

New Web Service -> connect this repo -> build `pip install -r requirements.txt` -> start `gunicorn --workers 1 --threads 2 app:app` -> add env var `GEMINI_API_KEY`. Or import `render.yaml` as a Blueprint.

## Customizing

Edit `chatbot_config.py` (name, prompts, starters) and the theme variables inside `templates/index.html`. Pushing a change redeploys automatically when auto-deploy is enabled on Render.
