import multiprocessing

# The socket to bind to. This can be a host:port pair or a Unix socket path.
# For Docker, '0.0.0.0:8000' is typical to bind to all interfaces on port 8000.
# For Nginx/Apache reverse proxy, 'unix:/path/to/your/app.sock' is common.
bind = "0.0.0.0:8000"

# The number of worker processes.
# Reduced to 2 to minimize memory multiplication
workers = 2

# Support for threads to share memory within a worker
threads = 4

# Enable preloading of the application to share model memory (Copy-on-Write)
preload_app = True

# 'sync' (default): Synchronous workers (good for CPU-bound tasks).
# 'gevent', 'eventlet', 'meinheld': Asynchronous workers (good for I/O-bound tasks, requires installing the respective library).
# 'gthread': Threaded workers (best for shared memory between requests).
worker_class = "gthread"

# The maximum number of requests a worker will process before restarting.
# Set to 1000 to prevent memory growth over time.
max_requests = 1000

# The maximum jitter to add to the max_requests setting.
max_requests_jitter = 50

# Workers silent for more than this many seconds are killed and restarted.
timeout = 120

# The path to the access log file. Use '-' for stdout.
accesslog = "-"

# The path to the error log file. Use '-' for stderr.
errorlog = "-"

# The granularity of Error log outputs.
# Valid values are "debug", "info", "warning", "error", "critical".
loglevel = "info"

# The number of seconds to wait for graceful termination.
graceful_timeout = 30

# Enable or disable the use of Python's multiprocessing logging.
# If False, Gunicorn's own logging will be used.
# If True, the standard Python logging module will be used directly.
capture_output = True  # Useful for debugging or if you're using Python's logging

# Set the process name (useful for process monitoring tools)
proc_name = "py_ekyc_service"

# Restart workers when code changes (for development)
reload = True

# You can even set environment variables here if needed
# raw_env = ["MY_ENV_VAR=my_value"]
