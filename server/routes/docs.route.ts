import { Router } from "express";
import { Step } from "prosemirror-transform";
import WaitingClient from "../config/WaitingClient.config";
import DocumentInstance, { schema } from "../models/DocumentInstance";
import getUserIP from "../utils/getUserIp.util";

// In-memory cache for active document instances
const instances = new Map<string, DocumentInstance>();

async function getInstance(
  id: string,
  userIP?: string
): Promise<DocumentInstance> {
  let inst = instances.get(id);
  if (!inst) {
    // Load from MongoDB or create new
    inst = await DocumentInstance.loadFromDB(id);
    instances.set(id, inst);
  }
  if (userIP) {
    inst.registerUser(userIP);
  }
  return inst;
}

const router = Router();
// Get list of documents
router.get("/api/docs", (req, res) => {
  const docs = Array.from(instances.entries()).map(([id, inst]) => ({
    id,
    users: inst.users.size,
  }));
  res.json(docs);
});

// Get document state
router.get("/api/docs/:id", async (req, res) => {
  const { id } = req.params;
  const userIP = getUserIP(req);
  const inst = await getInstance(id, userIP);

  res.json({
    doc: inst.doc.toJSON(),
    version: inst.version,
    users: inst.users.size,
    comments: [], // Not implementing comments for now
    commentVersion: 0,
  });
});

// Get events (long polling)
router.get("/api/docs/:id/events", async (req, res) => {
  const { id } = req.params;
  const version = parseInt(req.query.version as string) || 0;
  const commentVersion = parseInt(req.query.commentVersion as string) || 0;
  const userIP = getUserIP(req);

  const inst = await getInstance(id, userIP);

  if (version < 0 || version > inst.version) {
    return res.status(410).json({ error: "History no longer available" });
  }

  const data = inst.getEvents(version);
  if (!data) {
    return res.status(410).json({ error: "History no longer available" });
  }

  // If there are new events, return them immediately
  if (data.steps.length > 0) {
    return res.json({
      version: inst.version,
      commentVersion: 0,
      steps: data.steps.map((step) => step.toJSON()),
      clientIDs: data.clientIDs,
      comment: [],
      users: data.users,
    });
  }

  // Otherwise, wait for new events (long polling)
  const waiting = new WaitingClient(res, inst, userIP);
  inst.waiting.push(waiting);

  req.on("close", () => waiting.abort());
});

// Submit events
router.post("/api/docs/:id/events", async (req, res) => {
  const { id } = req.params;
  const { version, steps: stepJSONs, clientID, comment } = req.body;
  const userIP = getUserIP(req);

  try {
    const inst = await getInstance(id, userIP);
    const steps = stepJSONs.map((stepJSON: any) =>
      Step.fromJSON(schema, stepJSON)
    );

    const result = await inst.addEvents(version, steps, clientID, userIP);
    if (!result) {
      return res.status(409).json({ error: "Version not current" });
    }

    res.json({
      version: result.version,
      commentVersion: 0,
    });
  } catch (error) {
    console.error("Error processing events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
