# Install Python dependencies for Linux (Lambda runtime)
Write-Host "Installing Python dependencies for Linux Lambda runtime..."

# Create lib directory if it doesn't exist
New-Item -ItemType Directory -Force -Path lib | Out-Null

# Remove existing packages
Remove-Item -Path lib\* -Recurse -Force -ErrorAction SilentlyContinue

# Install dependencies for Linux platform (manylinux)
pip install `
    --platform manylinux2014_x86_64 `
    --target lib `
    --implementation cp `
    --python-version 3.13 `
    --only-binary=:all: `
    --upgrade `
    -r requirements.txt

Write-Host "Dependencies installed successfully to lib/ for Linux platform"
Write-Host "Note: These are Linux-compatible packages for AWS Lambda"
