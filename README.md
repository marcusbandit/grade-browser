# GradeBrowser

A simple web application to browse AutoLab grading reports with real-time updates.

## Features

- 📊 **Web-based Report Viewer**: Clean interface for viewing AutoLab HTML reports
- 🔄 **Real-time Updates**: Automatically detects new reports via WebSocket
- 🗂️ **Organized Navigation**: Browse reports by timestamp and check number
- ⌨️ **Keyboard Shortcuts**: Navigate with arrow keys and refresh with Ctrl+R
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🚀 **Live File Watching**: Monitors AutoLab directory for new reports

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)
- AutoLab installation with grading reports

## Quick Start

1. **Clone or download this repository**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the server**:
   ```bash
   npm start
   ```
4. **Open your browser** and navigate to `http://localhost:3000`

## Configuration

The application automatically scans for AutoLab reports in the parent directory structure. It looks for directories with timestamp format `YYYY-MM-DD-HH-MM-SS` containing HTML report files named `checkXX-report.html`.

### Custom Directory

To monitor a different AutoLab directory, modify the `AUTOLAB_ROOT` variable in `server.js`:

```javascript
const AUTOLAB_ROOT = path.join(__dirname, "../../"); // Change this path
```

### Custom Port

To run on a different port, modify the `PORT` variable in `server.js`:

```javascript
const PORT = 3000; // Change this port
```

## Usage

### Navigation

- **Previous/Next Check**: Use the navigation buttons or arrow keys (←/→ or ↑/↓)
- **Refresh**: Click the refresh button or press `Ctrl+R` (or `Cmd+R` on Mac)
- **Real-time Updates**: New reports are automatically detected and loaded

### Report Structure

Reports are organized by:
- **Timestamp**: When the AutoLab run was executed
- **Check Number**: Individual test checks within each run

The interface shows the newest reports first and allows navigation through all available checks.

## Development

### Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server (same as start)

### Project Structure

```
GradeBrowser/
├── server.js          # Main server application
├── public/
│   └── index.html     # Web interface
├── package.json       # Dependencies and scripts
└── README.md         # This file
```

## Sharing Options

### Local Network Sharing

To share with others on your local network:

1. Find your local IP address:
   ```bash
   ip addr show  # Linux
   ifconfig      # macOS/Linux
   ipconfig      # Windows
   ```

2. Modify `server.js` to listen on all interfaces:
   ```javascript
   server.listen(PORT, '0.0.0.0', () => {
   ```

3. Others can access via `http://YOUR_IP:3000`


## Troubleshooting

### Common Issues

1. **No reports found**: Ensure AutoLab has generated HTML reports in the expected directory structure
2. **Permission denied**: Check file permissions on the AutoLab directory
3. **Port already in use**: Change the PORT in `server.js` or kill the process using port 3000

### File Structure Requirements

AutoLab reports should follow this structure:
```
AutoLab-Root/
├── Module01/
│   └── m01a01handout/
│       └── grading/
│           └── 2024-01-15-14-30-25/    # Timestamp directory
│               ├── check01-report.html
│               ├── check02-report.html
│               └── ...
└── Module02/
    └── ...
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Apache License 2.0 - see the LICENSE file for details.

## Author

Marcus Rosado

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Create an issue in the repository
3. Contact the author

---

**Note**: This tool is designed to work with AutoLab grading reports. Ensure you have the proper AutoLab setup and generated reports before using this browser.
