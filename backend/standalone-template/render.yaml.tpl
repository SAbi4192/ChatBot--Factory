# Render Blueprint - {{BOT_NAME_HTML}} standalone chatbot
# One-click import fallback: Render dashboard -> New -> Blueprint -> pick this repo.
services:
  - type: web
    name: {{SERVICE_NAME}}
    runtime: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn --workers 1 --threads 2 --timeout 60 app:app
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        value: {{MODEL_NAME}}
