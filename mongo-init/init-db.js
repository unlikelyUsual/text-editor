// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

db = db.getSiblingDB("texteditor");

// Create a user for the application
db.createUser({
  user: "texteditor_user",
  pwd: "texteditor_password",
  roles: [
    {
      role: "readWrite",
      db: "texteditor",
    },
  ],
});

// Create indexes for better performance
db.documents.createIndex({ documentId: 1 }, { unique: true });
db.documents.createIndex({ updatedAt: -1 });

// Insert a sample document
db.documents.insertOne({
  documentId: "welcome",
  doc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Welcome to the Collaborative Text Editor! This document is stored in MongoDB and persists across server restarts. Try editing this text and then restart the server to see your changes persist.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Features:",
          },
        ],
      },
      {
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Real-time collaborative editing",
                  },
                ],
              },
            ],
          },
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "MongoDB persistence",
                  },
                ],
              },
            ],
          },
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Docker containerization",
                  },
                ],
              },
            ],
          },
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Real-time word counting",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  version: 0,
  steps: [],
  users: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

print("✅ Database initialized successfully!");
