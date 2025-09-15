import { Node as PMNode, Schema } from "prosemirror-model";
import { schema as baseSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { Step } from "prosemirror-transform";
import type WaitingClient from "../config/WaitingClient.config";
import { DocumentModel } from "./Document";

// Create schema with list support (same as client)
export const schema = new Schema({
  nodes: addListNodes(baseSchema.spec.nodes, "paragraph block*", "block"),
  marks: baseSchema.spec.marks,
});

export default class DocumentInstance {
  public id: string;
  public doc: PMNode;
  public version: number;
  public steps: Step[];
  public users: Set<string>;
  public waiting: WaitingClient[];

  constructor(id: string, doc?: PMNode, version?: number, steps?: Step[]) {
    this.id = id;
    this.doc =
      doc ||
      schema.node("doc", null, [
        schema.node("paragraph", null, [
          schema.text(
            "This is a collaborative test document. Start editing to make it more interesting!"
          ),
        ]),
      ]);
    this.version = version || 0;
    this.steps = steps || [];
    this.users = new Set();
    this.waiting = [];
  }

  // Load document from MongoDB
  static async loadFromDB(id: string): Promise<DocumentInstance> {
    try {
      const dbDoc = await DocumentModel.findOne({ documentId: id });

      if (dbDoc) {
        console.log(
          `Loading document ${id} from DB - version: ${dbDoc.version}, steps: ${dbDoc.steps.length}`
        );

        // Reconstruct ProseMirror document from JSON
        const pmDoc = schema.nodeFromJSON(dbDoc.doc);

        // Reconstruct steps from JSON
        const steps = dbDoc.steps.map((stepJSON: any) =>
          Step.fromJSON(schema, stepJSON)
        );

        const instance = new DocumentInstance(id, pmDoc, dbDoc.version, steps);

        // Add users
        dbDoc.users.forEach((userIP) => instance.users.add(userIP));

        console.log(
          `Document ${id} loaded successfully - version: ${instance.version}`
        );
        return instance;
      } else {
        // Create new document if not found
        console.log(`Creating new document ${id}`);
        const instance = new DocumentInstance(id);
        await instance.saveToDB();
        console.log(
          `New document ${id} created and saved - version: ${instance.version}`
        );
        return instance;
      }
    } catch (error) {
      console.error(`Error loading document ${id} from DB:`, error);
      console.log(`Falling back to new document instance for ${id}`);
      return new DocumentInstance(id);
    }
  }

  // Save document to MongoDB
  async saveToDB(): Promise<void> {
    try {
      const stepsJSON = this.steps.map((step) => step.toJSON());

      await DocumentModel.findOneAndUpdate(
        { documentId: this.id },
        {
          documentId: this.id,
          doc: this.doc.toJSON(),
          version: this.version,
          steps: stepsJSON,
          users: Array.from(this.users),
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error("Error saving document to DB:", error);
    }
  }

  async addEvents(
    version: number,
    steps: Step[],
    clientID: number,
    userIP: string
  ): Promise<{ version: number } | false> {
    console.log(
      `Adding events to document ${this.id}: client version ${version}, server version ${this.version}, steps: ${steps.length}`
    );

    if (version !== this.version) {
      console.warn(
        `Version mismatch for document ${this.id}: client ${version} vs server ${this.version}`
      );
      return false;
    }

    let doc = this.doc;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      (step as any).clientID = clientID;
      const result = step.apply(doc);
      if (result.failed) {
        throw new Error("Step application failed");
      }
      doc = result.doc!;
    }

    this.doc = doc;
    this.version += steps.length;
    this.steps = this.steps.concat(steps);

    // Keep only recent steps (limit history)
    if (this.steps.length > 1000) {
      this.steps = this.steps.slice(-1000);
    }

    this.users.add(userIP);

    // Save to MongoDB
    await this.saveToDB();

    this.sendUpdates();

    return { version: this.version };
  }

  getEvents(
    version: number
  ): { steps: Step[]; clientIDs: number[]; users: number } | false {
    if (version < 0 || version > this.version) {
      return false;
    }

    // If requesting the current version, return empty steps
    if (version === this.version) {
      return {
        steps: [],
        clientIDs: [],
        users: this.users.size,
      };
    }

    const startIndex = this.steps.length - (this.version - version);

    // If the requested version is too far behind (beyond our stored steps),
    // return empty steps instead of false to avoid "too far behind" error
    if (startIndex < 0) {
      console.warn(
        `Version ${version} is too far behind current version ${this.version}, returning empty steps`
      );
      return {
        steps: [],
        clientIDs: [],
        users: this.users.size,
      };
    }

    return {
      steps: this.steps.slice(startIndex),
      clientIDs: this.steps
        .slice(startIndex)
        .map((step: any) => step.clientID || 0),
      users: this.users.size,
    };
  }

  sendUpdates() {
    while (this.waiting.length) {
      const waiting = this.waiting.pop()!;
      waiting.finish();
    }
  }

  registerUser(userIP: string) {
    this.users.add(userIP);
  }
}
