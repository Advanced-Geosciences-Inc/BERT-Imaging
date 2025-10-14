# BERT 2D Imager - Production Dockerfile with PyGimli
# Uses micromamba for conda package management

FROM mambaorg/micromamba:1.5.8

# Switch to root for system setup
USER root

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy environment file for conda packages
COPY docker/environment.yml /tmp/environment.yml

# Switch to micromamba user
USER $MAMBA_USER

# Install conda packages (including PyGimli)
RUN micromamba install -y -n base -f /tmp/environment.yml && \
    micromamba clean --all --yes

# Activate base environment
ARG MAMBA_DOCKERFILE_ACTIVATE=1

# Copy application files
COPY --chown=$MAMBA_USER:$MAMBA_USER backend /app/backend
COPY --chown=$MAMBA_USER:$MAMBA_USER frontend/build /app/frontend/build

# Create necessary directories
RUN mkdir -p /app/backend/data /app/backend/results /app/backend/bert_jobs

# Install additional Python packages via pip (if any not in conda)
RUN pip install --no-cache-dir \
    python-multipart \
    aiofiles

# Expose ports
EXPOSE 8000

# Set environment variables
ENV PYTHONPATH=/app/backend
ENV DATA_DIR=/app/backend/data
ENV RESULTS_DIR=/app/backend/results
ENV BERT_JOBS_DIR=/app/backend/bert_jobs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/versions || exit 1

# Run the application
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
