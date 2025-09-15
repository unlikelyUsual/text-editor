import express from "express";
import { connectDB } from "./config/database.config";
import docRouter from "./routes/docs.route";

const app = express();

// Connect to MongoDB
connectDB();

app.use(express.json());
app.use(docRouter);

// Serve static files from client build (for production)
app.use(express.static("../client/dist"));

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Collaboration server running on port ${PORT}`);
});

export default app;
