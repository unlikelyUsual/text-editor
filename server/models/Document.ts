import mongoose, { Schema } from "mongoose";

export interface IDocument {
  documentId: string;
  doc: any; // ProseMirror document JSON
  version: number;
  steps: any[]; // Array of ProseMirror steps
  users: string[]; // Array of user IPs
  createdAt?: Date;
  updatedAt?: Date;
}

const DocumentSchema = new Schema(
  {
    documentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    doc: {
      type: Schema.Types.Mixed,
      required: true,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
    steps: {
      type: Array,
      default: [],
    },
    users: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "documents",
  }
);

// Index for better query performance
DocumentSchema.index({ documentId: 1 });
DocumentSchema.index({ updatedAt: -1 });

// Keep only recent steps (limit history to prevent unbounded growth)
DocumentSchema.pre("save", function (next) {
  if (this.steps && this.steps.length > 1000) {
    this.steps = this.steps.slice(-1000);
  }
  next();
});

export const DocumentModel = mongoose.model("Document", DocumentSchema);
