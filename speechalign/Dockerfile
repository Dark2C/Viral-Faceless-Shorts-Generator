# Use Ubuntu base image to simplify dependency management
FROM ubuntu:20.04

# Set environment variable to avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Update system packages and install the necessary dependencies
RUN apt-get update && apt-get install -y \
    espeak espeak-data libespeak1 libespeak-dev \
    libxml2-dev libxslt1-dev \
    build-essential ffmpeg python3-dev python3-pip \
    python3-setuptools python3-wheel python3-distutils \
    && rm -rf /var/lib/apt/lists/*  # Clean up apt cache to reduce image size

# Install specific numpy version
RUN pip3 install --no-cache-dir numpy==1.19.5

# Install aeneas for audio-text synchronization
RUN pip3 install --no-cache-dir aeneas

# Install Flask for the REST API
RUN pip3 install --no-cache-dir Flask

# Set the working directory inside the container
WORKDIR /app

# Set Python IO encoding environment variable (if necessary)
ENV PYTHONIOENCODING=UTF-8

# Copy the Flask application and any required files into the container
COPY ./app.py /app/app.py

# Expose port 5000 for the Flask app
EXPOSE 5000

# Run the Flask application when the container starts
CMD ["python3", "app.py"]
