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
    const { path: newPath } = req.body;
    
    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).json({ error: "Invalid path provided" });
    }

    // Validate that the path exists and is a directory
    if (!fs.existsSync(newPath)) {
      return res.status(400).json({ error: "Path does not exist" });
    }

    const stat = fs.statSync(newPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    currentAutoLabRoot = newPath;
    console.log(`AutoLab root path updated to: ${newPath}`);
    
    res.json({ message: "Path updated successfully", path: newPath });
  } catch (error) {
    console.error("Error setting path:", error);
    res.status(500).json({ error: "Failed to set path: " + error.message });
  }
});

// API endpoint to get assignments (parent folders containing handouts)
app.get("/api/assignments", (req, res) => {
  try {
    const requestedPath = req.query.path;
    const searchPath = requestedPath || currentAutoLabRoot;
    
    const assignments = scanForAssignments(searchPath);
    res.json(assignments);
  } catch (error) {
    console.error("Error scanning assignments:", error);
    res.status(500).json({ error: "Failed to scan assignments: " + error.message });
  }
});

// API endpoint to get specific report content with pass/fail status
app.get("/api/handout-report/:handout/:gradeCheck/:checkId", (req, res) => {
  try {
    const { handout, gradeCheck, checkId } = req.params;
    const requestedPath = req.query.path || currentAutoLabRoot;
    
    const reportPath = findHandoutReportFile(requestedPath, handout, gradeCheck, checkId);

    if (!reportPath) {
      return res.status(404).json({ error: "Report not found" });
    }

    let content = fs.readFileSync(reportPath, "utf8");
    content = fixCssPseudoElements(content);
    
    res.send(content);
  } catch (error) {
    console.error("Error reading report:", error);
    res.status(500).json({ error: "Failed to read report" });
  }
});

// Function to fix CSS pseudo-elements by replacing them with actual HTML content
function fixCssPseudoElements(htmlContent) {
  const replacements = [
    {
      selector: 'div#compilationOutput .noCompilationOutput',
      content: '(None)'
    },
    {
      selector: 'div#input .noinput',
      content: '(None)'
    },
    {
      selector: 'div#args .noargs',
      content: '(None)'
    },
    {
      selector: 'div#errors .noerrors',
      content: '(None)'
    },
    {
      selector: 'div#stderr .noerrors',
      content: '(None)'
    }
  ];

  let fixedContent = htmlContent;

  // Replace each empty element with its content
  replacements.forEach(({ selector, content }) => {
    const regex = new RegExp(`<span class="noCompilationOutput"></span>|<span class="noinput"></span>|<span class="noargs"></span>|<span class="noerrors"></span>`, 'g');
    
    fixedContent = fixedContent.replace(regex, (match) => {
      if (match.includes('noCompilationOutput')) {
        return `<span class="noCompilationOutput" style="color: gray; font-style: italic; font-family: serif; font-size: smaller;">${content}</span>`;
      } else if (match.includes('noinput')) {
        return `<span class="noinput" style="color: gray; font-style: italic; font-family: serif; font-size: smaller;">${content}</span>`;
      } else if (match.includes('noargs')) {
        return `<span class="noargs" style="color: gray; font-style: italic; font-family: serif; font-size: smaller;">${content}</span>`;
      } else if (match.includes('noerrors')) {
        return `<span class="noerrors" style="color: gray; font-style: italic; font-family: serif; font-size: smaller;">${content}</span>`;
      }
      return match;
    });
  });

  return fixedContent;
}

// Function to check if a report passed or failed
function checkReportStatus(reportPath) {
  try {
    const content = fs.readFileSync(reportPath, "utf8");
    
    // Check for various failure indicators in the HTML
    // The reports typically have error divs or specific text indicating failure
    const hasErrors = content.includes('class="errors"') && !content.includes('class="noerrors"');
    const hasFailedTest = content.includes('FAILED') || content.includes('Test failed');
    const hasCompileError = content.includes('Compilation failed') || content.includes('compiler error');
    const hasException = content.includes('Exception') && content.includes('at ');
    
    // Check for success indicators
    const hasPassed = content.includes('PASSED') || content.includes('Test passed');
    const hasSuccess = content.includes('SUCCESS');
    
    // Determine status
    if (hasCompileError) {
      return 'error';
    } else if (hasErrors || hasFailedTest || hasException) {
      return 'fail';
    } else if (hasPassed || hasSuccess) {
      return 'pass';
    }
    
    // Default to unknown if we can't determine
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

// Function to scan for assignments (parent folders containing handouts)
function scanForAssignments(rootPath = currentAutoLabRoot) {
  const assignments = [];
  
  try {
    const items = fs.readdirSync(rootPath);
    
    for (const item of items) {
      const fullPath = path.join(rootPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.')) {
        // Check if this folder contains any handouts (folders with grading subfolder)
        const handouts = scanHandoutsInAssignment(fullPath);
        
        if (handouts.length > 0) {
          assignments.push({
            name: item,
            path: fullPath,
            handouts: handouts
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning assignments in ${rootPath}:`, error);
  }
  
  // Sort assignments alphabetically
  assignments.sort((a, b) => a.name.localeCompare(b.name));
  
  return assignments;
}

// Function to scan handouts within an assignment folder
function scanHandoutsInAssignment(assignmentPath) {
  const handouts = [];
  
  try {
    const items = fs.readdirSync(assignmentPath);
    
    for (const item of items) {
      const fullPath = path.join(assignmentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Check if this has a grading subfolder
        const gradingPath = path.join(fullPath, "grading");
        if (fs.existsSync(gradingPath) && fs.statSync(gradingPath).isDirectory()) {
          const gradeChecks = scanGradingDirectory(gradingPath);
          if (gradeChecks.length > 0) {
            handouts.push({
              name: item,
              path: fullPath,
              gradeChecks: gradeChecks
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning handouts in ${assignmentPath}:`, error);
  }
  
  // Sort handouts alphabetically
  handouts.sort((a, b) => a.name.localeCompare(b.name));
  
  return handouts;
}

// Function to scan grading directory for grade checks
function scanGradingDirectory(gradingDir) {
  const gradeChecks = [];
  
  try {
    const items = fs.readdirSync(gradingDir);
    
    for (const item of items) {
      const fullPath = path.join(gradingDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Check if this is a timestamp directory (YYYY-MM-DD-HH-MM-SS format)
        if (/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(item)) {
          const checks = scanTimestampDirectory(fullPath);
          if (checks.length > 0) {
            gradeChecks.push({
              timestamp: item,
              path: fullPath,
              checks: checks
            });
          }
        }
      }
    }
    
    // Sort by timestamp (newest first)
    gradeChecks.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error(`Error scanning grading directory ${gradingDir}:`, error);
  }
  
  return gradeChecks;
}

// Function to scan timestamp directory for check reports
function scanTimestampDirectory(timestampDir) {
  const checks = [];
  
  try {
    const files = fs.readdirSync(timestampDir);
    
    for (const file of files) {
      const match = file.match(/^(.+)-report\.html$/);
      if (match) {
        const checkId = match[1];
        const reportPath = path.join(timestampDir, file);
        
        // Parse checkId to get a nice display name
        let displayName = checkId;
        
        // Format 1: checkXX-YY (task-test format with dash)
        const dashMatch = checkId.match(/^check(\d+)-(\d+)$/);
        if (dashMatch) {
          const taskNum = parseInt(dashMatch[1], 10);
          const testNum = parseInt(dashMatch[2], 10);
          
          if (taskNum === 0) {
            displayName = 'Compilation';
          } else {
            displayName = `Task ${taskNum} - Test ${testNum}`;
          }
        } else {
          // Format 2: checkXXYY or checkXX (no dash)
          const nodashlongMatch = checkId.match(/^check(\d{4})$/);
          const nodashShortMatch = checkId.match(/^check(\d{2})$/);
          
          if (nodashlongMatch) {
            // 4 digit format: first 2 digits = task, last 2 = test
            const fullNum = nodashlongMatch[1];
            const taskNum = parseInt(fullNum.substring(0, 2), 10);
            const testNum = parseInt(fullNum.substring(2, 4), 10);
            
            if (taskNum === 0 && testNum === 0) {
              displayName = 'Compilation';
            } else if (taskNum === 0) {
              displayName = `Compilation ${testNum}`;
            } else {
              displayName = `Task ${taskNum} - Test ${testNum}`;
            }
          } else if (nodashShortMatch) {
            // 2 digit format: just task number
            const taskNum = parseInt(nodashShortMatch[1], 10);
            
            if (taskNum === 0) {
              displayName = 'Compilation';
            } else {
              displayName = `Task ${taskNum}`;
            }
          }
        }
        
        // Get pass/fail status
        const status = checkReportStatus(reportPath);
        
        checks.push({
          checkId,
          filename: file,
          displayName,
          status,
          path: reportPath,
        });
      }
    }
    
    // Sort by checkId (compilation first, then numerically)
    checks.sort((a, b) => {
      // Compilation always first
      if (a.displayName === 'Compilation' || a.displayName.startsWith('Compilation')) return -1;
      if (b.displayName === 'Compilation' || b.displayName.startsWith('Compilation')) return 1;
      return a.checkId.localeCompare(b.checkId);
    });
  } catch (error) {
    console.error(`Error scanning timestamp directory ${timestampDir}:`, error);
  }
  
  return checks;
}

// Function to find a report file by handout, grade check, and checkId
function findHandoutReportFile(rootPath, handout, gradeCheck, checkId) {
  // Search through all assignments
  function searchDirectory(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (item === handout) {
            const reportPath = path.join(fullPath, "grading", gradeCheck, `${checkId}-report.html`);
            if (fs.existsSync(reportPath)) {
              return reportPath;
            }
          }
          // Check subdirectories
          const result = searchDirectory(fullPath);
          if (result) return result;
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return null;
  }
  
  return searchDirectory(rootPath);
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
