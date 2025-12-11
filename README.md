# GradeBrowser

A simple web application for browsing AutoLab grading reports with real-time updates.
Created because I was tired of copying and pasting HTML file locations from the terminal into my browser.

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en/download) (version 14 or higher)
- npm (comes with Node.js) 
- AutoLab installation with grading reports

- Tho i reccoment bun


### Node install guide



## Quick Start

1. **Clone this repository**

   ```bash
   git clone https://github.com/marcusbandit/grade-browser.git
   ```

   *Or download the ZIP from GitHub and extract it to a folder.*

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the server**:

   ```bash
   npm start
   ```

4. **Open your browser** and navigate to `http://localhost:3000`

### Issues?

If you got issues. Shoot me a message.

## Configuration

The application can scan for AutoLab reports in any directory structure. It looks for directories with timestamp format `YYYY-MM-DD-HH-MM-SS` containing HTML report files named `checkXX-report.html`.

### Setting AutoLab Directory

#### Option 1: Use the Web Interface (Recommended)

1. Open the GradeBrowser web interface
2. Enter the path to your AutoLab root directory in the "AutoLab Root Directory" field
3. Click "Set Path"
4. The application will scan that directory for reports

#### Option 2: Environment Variable

Set the `AUTOLAB_ROOT` environment variable:

```bash
export AUTOLAB_ROOT="/path/to/your/autolab/directory"
npm start
```

#### Option 3: Modify server.js (Not Recommended)

Change the `DEFAULT_AUTOLAB_ROOT` variable in `server.js`.

### Custom Port

To run on a different port, modify the `PORT` variable in `server.js`:

```javascript
const PORT = 3000; // Change this port
```

## Usage

### Setting Up AutoLab Directory

1. **Start the server**: `npm start`
2. **Open browser**: Navigate to `http://localhost:3000`
3. **Set AutoLab path**: Enter the path to your AutoLab root directory in the input field
4. **Click "Set Path"**: The application will scan for reports

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

## Troubleshooting

### Common Issues

1. **No reports found**: Ensure AutoLab has generated HTML reports in the expected directory structure
2. **Permission denied**: Check file permissions on the AutoLab directory
3. **Port already in use**: Change the PORT in `server.js` or kill the process using port 3000

### File Structure Requirements

AutoLab reports should follow this structure:

```bash
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
3. Contact me!

---

**Note**: This tool is designed to work with AutoLab grading reports. Ensure you have the proper AutoLab setup and generated reports before using this browser.
