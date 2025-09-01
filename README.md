# Collaborative Text Editor

A real-time collaborative text editor built with React, Node.js, ProseMirror, and MongoDB. Features real-time collaboration, persistent document storage, and live word counting.

## Features

- ✅ **Real-time Collaborative Editing**: Multiple users can edit documents simultaneously
- ✅ **MongoDB Persistence**: Documents persist across server restarts
- ✅ **Docker Containerization**: Easy deployment with Docker Compose
- ✅ **Live Word Counting**: Real-time word count updates as you type
- ✅ **Rich Text Editing**: Powered by ProseMirror with support for lists, formatting, and more
- ✅ **User Presence**: See how many users are currently editing each document

## Architecture

- **Frontend**: React + TypeScript + Vite + ProseMirror
- **Backend**: Node.js + Express + TypeScript (using Bun runtime)
- **Database**: MongoDB with Mongoose ODM
- **Containerization**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose installed on your system
- Git (to clone the repository)

### Setup and Run

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd text-editor
   ```

2. **Start all services with Docker Compose**

   ```bash
    cd client && bun dev
   ```

   ```bash
   cd server && bun dev
   ```

   ```bash
     docker run -d \
        --name mongodb \
        -p 27017:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=admin \
        -e MONGO_INITDB_ROOT_PASSWORD=password123 \
        -e MONGO_INITDB_DATABASE=texteditor \
        mongo:7
   ```

   This will start:

   - MongoDB on port 27017
   - Backend server on port 3001
   - Frontend client on port 3000

3. **Access the application**

   - Open your browser and go to `http://localhost:5173`
   - Try opening the same URL in multiple browser tabs to test real-time collaboration

## Development Setup

If you want to run the services individually for development:

### Backend Development

```bash
cd server
bun install
bun run dev
```

### Frontend Development

```bash
cd client
npm install
npm run dev
```

### MongoDB

You can use the Docker MongoDB service even during development:

```bash
docker-compose up mongodb
```

## Environment Variables

### Server Environment Variables

- `MONGODB_URI`: MongoDB connection string (default: `mongodb://admin:password123@localhost:27017/texteditor?authSource=admin`)
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)

### Client Environment Variables

- `VITE_API_URL`: Backend API URL (default: `http://localhost:3001`)

## API Endpoints

- `GET /api/docs` - List all documents
- `GET /api/docs/:id` - Get document state
- `GET /api/docs/:id/events` - Long polling for document events
- `POST /api/docs/:id/events` - Submit document changes

## Database Schema

### Documents Collection

```javascript
{
  documentId: String,     // Unique document identifier
  doc: Object,           // ProseMirror document JSON
  version: Number,       // Document version for conflict resolution
  steps: Array,          // Array of ProseMirror transformation steps
  users: [String],       // Array of user IP addresses
  createdAt: Date,
  updatedAt: Date
}
```

## Docker Services

### MongoDB Service

- **Image**: mongo:7.0
- **Port**: 27017
- **Credentials**: admin/password123
- **Database**: texteditor
- **Initialization**: Runs `mongo-init/init-db.js` on first start

### Server Service

- **Runtime**: Bun
- **Port**: 3001
- **Dependencies**: MongoDB
- **Auto-restart**: Yes

### Client Service

- **Runtime**: Node.js 18
- **Port**: 3000
- **Dependencies**: Server
- **Auto-restart**: Yes

## Troubleshooting

### Common Issues

1. **Port conflicts**

   - Make sure ports 3000, 3001, and 27017 are not in use
   - You can change ports in `docker-compose.yml`

2. **MongoDB connection issues**

   - Wait a few seconds for MongoDB to fully start
   - Check logs: `docker-compose logs mongodb`

3. **Build failures**
   - Clean Docker cache: `docker system prune -a`
   - Rebuild: `docker-compose up --build --force-recreate`

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongodb
```

### Accessing MongoDB

```bash
# Connect to MongoDB container
docker exec -it text-editor-mongodb mongosh

# Use the texteditor database
use texteditor

# Authenticate
db.auth('admin', 'password123')

# View documents
db.documents.find().pretty()
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker Compose
5. Submit a pull request

## License

MIT License - see LICENSE file for details
