# AI Agent Marketplace MVP

A minimal Node.js Express application that serves as an AI Marketplace for browsing and submitting AI agents, with SQLite storage.

## Features

- **Home Page**: Welcome message with navigation to browse and submit agents
- **Browse Agents**: View all AI agents stored in the database with search functionality
- **Submit Agent**: Form to add new AI agents to the marketplace
- **Agent Details**: Individual pages for each agent with detailed information
- **SQLite Database**: Persistent storage for agent data
- **Responsive Design**: Mobile-friendly interface

## Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation and Setup

1. **Initialize the project and install dependencies**:
   ```bash
   npm init -y
   npm install express sqlite3 body-parser
   ```

2. **Run the application**:
   ```bash
   node server.js
   ```

3. **Access the application**:
   Open your browser and navigate to `http://localhost:5000`

## Project Structure

