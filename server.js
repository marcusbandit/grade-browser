const express = require("express");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const WebSocket = require("ws");
const { spawn } = require("child_process");

const app = express();

// Environment configuration
const PORT = process.env.PORT || 3000;
const DEFAULT_AUTOLAB_ROOT = process.env.AUTOLAB_ROOT || path.join(__dirname, "../../");
const NODE_ENV = process.env.NODE_ENV || "development";

// Dynamic AutoLab root path (can be changed by user)
let currentAutoLabRoot = DEFAULT_AUTOLAB_ROOT;

// Store WebSocket connections
const clients = new Set();

// Create WebSocket server
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Parse JSON bodies
app.use(express.json());

// API endpoint to set AutoLab root path
app.post("/api/set-path", (req, res) => {
  try {
    const { path } = req.body;
    
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: "Invalid path provided" });
    }

    // Validate that the path exists and is a directory
    if (!fs.existsSync(path)) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    const stat = fs.statSync(path);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    currentAutoLabRoot = path;
    console.log(`AutoLab root path updated to: ${path}`);
    
    res.json({ message: "Path updated successfully", path: path });
  } catch (error) {
    console.error("Error setting path:", error);
    res.status(500).json({ error: "Failed to set path: " + error.message });
  }
});

// API endpoint to get all HTML reports
app.get("/api/reports", (req, res) => {
  try {
    // Allow path override via query parameter
    const requestedPath = req.query.path;
    const searchPath = requestedPath || currentAutoLabRoot;
    
    const reports = scanForReports(searchPath);
    res.json(reports);
  } catch (error) {
    console.error("Error scanning reports:", error);
    res.status(500).json({ error: "Failed to scan reports: " + error.message });
  }
});

// API endpoint to get specific report content
app.get("/api/report/:timestamp/:checkId", (req, res) => {
  try {
    const { timestamp, checkId } = req.params;
    const reportPath = findReportFile(timestamp, checkId);

    if (!reportPath) {
      return res.status(404).json({ error: "Report not found" });
    }

    const content = fs.readFileSync(reportPath, "utf8");
    res.send(content);
  } catch (error) {
    console.error("Error reading report:", error);
    res.status(500).json({ error: "Failed to read report" });
  }
});

// Function to scan for all HTML reports
function scanForReports(rootPath = currentAutoLabRoot) {
  const reports = [];

  function scanDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Check if this is a timestamp directory (YYYY-MM-DD-HH-MM-SS format)
          if (/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(item)) {
            const checkReports = scanTimestampDirectory(fullPath);
            if (checkReports.length > 0) {
              reports.push({
                timestamp: item,
                path: fullPath,
                checks: checkReports,
              });
            }
          } else {
            // Recursively scan subdirectories
            scanDirectory(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  function scanTimestampDirectory(timestampDir) {
    const checks = [];
    try {
      const files = fs.readdirSync(timestampDir);

      for (const file of files) {
        const match = file.match(/^check(\d+)-report\.html$/);
        if (match) {
          const checkNumber = parseInt(match[1]);
          checks.push({
            checkId: checkNumber,
            filename: file,
            path: path.join(timestampDir, file),
          });
        }
      }

      // Sort by check number
      checks.sort((a, b) => a.checkId - b.checkId);
    } catch (error) {
      console.error(`Error scanning timestamp directory ${timestampDir}:`, error);
    }

    return checks;
  }

  scanDirectory(rootPath);

  // Sort reports by timestamp (newest first)
  reports.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return reports;
}

// Function to find a specific report file
function findReportFile(timestamp, checkId) {
  const timestampDir = findTimestampDirectory(timestamp);
  if (!timestampDir) return null;

  const checkFile = `check${checkId.toString().padStart(2, "0")}-report.html`;
  const fullPath = path.join(timestampDir, checkFile);

  return fs.existsSync(fullPath) ? fullPath : null;
}

// Function to find timestamp directory path
function findTimestampDirectory(timestamp) {
  function searchDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item === timestamp) {
            return fullPath;
          }
          const result = searchDirectory(fullPath);
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore errors (permission denied, etc.)
    }
    return null;
  }

  return searchDirectory(currentAutoLabRoot);
}

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");
  clients.add(ws);

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  });
});

// Function to notify clients of changes
function notifyClients(event, data) {
  const message = JSON.stringify({ event, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Set up file watching
console.log("Setting up file watcher for:", currentAutoLabRoot);

const watcher = chokidar.watch(currentAutoLabRoot, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,
});

watcher.on("add", (filePath) => {
  if (filePath.endsWith("-report.html")) {
    console.log("New report file detected:", filePath);
    notifyClients("newReport", { filePath });
  }
});

watcher.on("change", (filePath) => {
  if (filePath.endsWith("-report.html")) {
    console.log("Report file changed:", filePath);
    notifyClients("reportChanged", { filePath });
  }
});

// Start server
const HOST = process.env.HOST || 'localhost';
server.listen(PORT, HOST, () => {
  console.log(`GradeBrowser server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Default AutoLab directory: ${currentAutoLabRoot}`);
  console.log(`Use the web interface to set a custom AutoLab path if needed`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  watcher.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
