# Context7 MCP Setup Guide for Windows

## Prerequisites
1. Windows 10/11 (64-bit)
2. .NET Framework 4.8 or later
3. Internet connection for downloads

## Installation Steps
1. **Download Installer**
   - Visit [Context7 MCP GitHub Releases](https://github.com/openrouter/context7-mcp/releases)
   - Download the latest Windows installer (context7-mcp-vX.X.X-windows.exe)

2. **Run Installer**
   - Double-click the downloaded installer
   - Accept license agreement
   - Choose installation directory (default: C:\Program Files\Context7MCP)
   - Click 'Install'

3. **Configure Provider**
   - Open Context7 MCP Dashboard
   - Navigate to 'Settings' > 'Providers'
   - Click 'Add Provider'
   - Select 'OpenRouter' as provider type
   - Enter your OpenRouter API key
   - Save configuration

4. **Set Environment Variables**
   - Open Command Prompt as Administrator
   - Run:
     ```bash
     setx ROO_CONTEXT7_API_KEY "your_api_key"
     ```
   - Restart your terminal

5. **Verify Installation**
   - Open PowerShell
   - Run:
     ```powershell
     Get-Context7MCP -Provider OpenRouter
     ```
   - Check for successful connection

## Testing Configuration
1. Create a test script in Jarvis Builder:
   ```python
   from context7_mcp import OpenRouterAgent
   agent = OpenRouterAgent()
   response = agent.query("What is the best AI framework for Windows?")
   print(response)
   ```
2. Run the script and verify output

## Troubleshooting
- If connection fails: Check API key validity and network permissions
- If errors occur: Verify .NET Framework version
- For advanced users: Edit configuration file at C:\ProgramData\Context7MCP\config