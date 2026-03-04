"""Gunicorn configuration for production."""
import multiprocessing

bind = "0.0.0.0:8001"
workers = min(multiprocessing.cpu_count(), 4)
worker_class = "sync"
timeout = 120
keepalive = 5
max_requests = 1000
max_requests_jitter = 50
accesslog = "-"
errorlog = "-"
loglevel = "info"
preload_app = True
