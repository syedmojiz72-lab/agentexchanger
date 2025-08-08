# AI Agent Marketplace MVP

## Overview

This is a minimal Node.js Express application that serves as an AI Marketplace for browsing and submitting AI agents. The application provides a simple web interface where users can discover existing AI agents, submit their own agents, and view detailed information about each agent. The system is designed as an MVP with core functionality for agent management and discovery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Static HTML Views**: Uses server-side rendered HTML files served from the `views` directory
- **CSS Styling**: Single CSS file (`public/style.css`) providing responsive design with mobile-friendly interface
- **Navigation Structure**: Simple multi-page application with home, browse, and submit pages
- **Form-based Interaction**: HTML forms for agent submission with client-side validation

### Backend Architecture
- **Express.js Framework**: Lightweight Node.js web server handling HTTP requests and responses
- **MVC Pattern**: Simplified model-view-controller structure with routes handling business logic
- **Middleware Stack**: 
  - Body parser for form data processing
  - Static file serving for CSS and assets
  - Express built-in middleware for request handling

### Data Storage
- **SQLite Database**: File-based database (`marketplace.db`) for persistent storage
- **Simple Schema**: Single `agents` table with fields for name, description, category, link, and timestamp
- **Database Initialization**: Automatic table creation on server startup if not exists

### API Structure
- **RESTful Routes**: Standard HTTP methods for different operations
- **Route Handlers**:
  - GET `/` - Home page
  - GET `/submit` - Agent submission form
  - GET `/browse` - Agent listing (implied from navigation)
  - POST `/submit` - Agent creation endpoint (form handler)

### Security Considerations
- **Input Validation**: Form validation for required fields
- **SQL Injection Protection**: Using parameterized queries with sqlite3
- **File System Security**: Static file serving limited to public directory

## External Dependencies

### Core Dependencies
- **Express.js (^5.1.0)**: Web application framework for Node.js
- **SQLite3 (^5.1.7)**: Database driver for SQLite database operations
- **Body-parser (^2.2.0)**: Middleware for parsing HTTP request bodies
- **Path (^0.12.7)**: Utility for working with file and directory paths

### Runtime Environment
- **Node.js**: JavaScript runtime environment (version 14 or higher required)
- **NPM**: Package manager for dependency management

### Database
- **SQLite**: Embedded SQL database engine for local file-based storage
- **No external database server required**: Self-contained database file

### Third-party Services
- **None currently integrated**: The application runs entirely locally without external API dependencies
- **Extensible design**: Architecture supports future integration of external AI services, authentication providers, or cloud storage