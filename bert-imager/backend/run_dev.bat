@echo off
call C:\Users\kamet\anaconda3\Scripts\activate.bat pg
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
