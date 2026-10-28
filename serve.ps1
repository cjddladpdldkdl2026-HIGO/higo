# Minimal static file server for local play on Windows (no Python/Node needed).
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8000] [-NoBrowser]
param([int]$Port = 8000, [switch]$NoBrowser)

$root = $PSScriptRoot
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8';  '.png' = 'image/png'; '.json' = 'application/json'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $res = $ctx.Response
    try {
      if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
        [byte[]]$bytes = [IO.File]::ReadAllBytes($path)
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
        $res.ContentLength64 = $bytes.LongLength
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    } catch {
      # A dropped connection or bad request must not stop the server.
      Write-Host "  $rel : $($_.Exception.Message)"
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
