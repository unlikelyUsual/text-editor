import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from "prosemirror-collab";
import { exampleSetup } from "prosemirror-example-setup";
import { history } from "prosemirror-history";
import { Node as PMNode, Schema } from "prosemirror-model";
import { schema as baseSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import React, { useEffect, useRef, useState } from "react";

// HTTP Error interface
interface HttpError extends Error {
  status?: number;
}

// Transaction type alias to avoid import issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransactionType = any;

// Create schema with list support
const schema = new Schema({
  nodes: addListNodes(baseSchema.spec.nodes, "paragraph block*", "block"),
  marks: baseSchema.spec.marks,
});

// HTTP utilities based on ProseMirror reference implementation
function createRequest(config: {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<string> & { abort: () => void } {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  const promise = new Promise<string>((resolve, reject) => {
    xhr.open(config.method, config.url, true);

    xhr.addEventListener("load", () => {
      if (aborted) return;
      if (xhr.status < 400) {
        resolve(xhr.responseText);
      } else {
        const error: HttpError = new Error(`Request failed: ${xhr.statusText}`);
        error.status = xhr.status;
        reject(error);
      }
    });

    xhr.addEventListener("error", () => {
      if (!aborted) reject(new Error("Network error"));
    });

    if (config.headers) {
      for (const header in config.headers) {
        xhr.setRequestHeader(header, config.headers[header]);
      }
    }

    xhr.send(config.body || null);
  }) as Promise<string> & { abort: () => void };

  promise.abort = () => {
    if (!aborted) {
      xhr.abort();
      aborted = true;
    }
  };

  return promise;
}

function GET(url: string) {
  return createRequest({ method: "GET", url });
}

function POST(url: string, body: string, contentType: string) {
  return createRequest({
    method: "POST",
    url,
    body,
    headers: { "Content-Type": contentType },
  });
}

// State management based on ProseMirror reference implementation
type CommState = "start" | "poll" | "send" | "recover" | "detached";

class EditorConnectionState {
  edit: EditorState | null;
  comm: CommState;

  constructor(edit: EditorState | null, comm: CommState) {
    this.edit = edit;
    this.comm = comm;
  }
}

type Action =
  | { type: "loaded"; doc: PMNode; version: number; users: number }
  | { type: "restart" }
  | { type: "poll" }
  | { type: "recover"; error: HttpError }
  | {
      type: "transaction";
      transaction: TransactionType;
      requestDone?: boolean;
    };

function badVersion(err: HttpError): boolean {
  return err.status === 400 && /invalid version/i.test(err.message || "");
}

class EditorConnection {
  private state: EditorConnectionState;
  private request: (Promise<string> & { abort: () => void }) | null = null;
  private backOff = 0;
  private view: EditorView | null = null;
  private docId: string;
  private onStateChange: (state: EditorConnectionState) => void;
  private onError: (error: string) => void;
  private onUserCountChange: (count: number) => void;

  constructor(
    docId: string,
    onStateChange: (state: EditorConnectionState) => void,
    onError: (error: string) => void,
    onUserCountChange: (count: number) => void
  ) {
    this.docId = docId;
    this.state = new EditorConnectionState(null, "start");
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onUserCountChange = onUserCountChange;
    this.dispatch = this.dispatch.bind(this);
    this.start();
  }

  dispatch(action: Action) {
    let newEditState: EditorState | null = null;

    if (action.type === "loaded") {
      this.onUserCountChange(action.users);
      const editState = EditorState.create({
        doc: action.doc,
        plugins: [
          ...exampleSetup({ schema, history: false }),
          history(),
          collab({ version: action.version }),
        ],
      });
      this.state = new EditorConnectionState(editState, "poll");
      this.poll();
    } else if (action.type === "restart") {
      this.state = new EditorConnectionState(null, "start");
      this.start();
    } else if (action.type === "poll") {
      this.state = new EditorConnectionState(this.state.edit, "poll");
      this.poll();
    } else if (action.type === "recover") {
      if (action.error.status && action.error.status < 500) {
        this.onError(action.error.message || "Server error");
        this.state = new EditorConnectionState(null, "detached");
      } else {
        this.state = new EditorConnectionState(this.state.edit, "recover");
        this.recover();
      }
    } else if (action.type === "transaction") {
      if (this.state.edit) {
        newEditState = this.state.edit.apply(
          action.transaction as TransactionType
        );
      }
    }

    if (newEditState) {
      const sendable = this.sendable(newEditState);

      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm !== "detached") {
          this.onError("Document too big. Detached.");
        }
        this.state = new EditorConnectionState(newEditState, "detached");
      } else if (
        (this.state.comm === "poll" ||
          (action.type === "transaction" && action.requestDone)) &&
        sendable
      ) {
        this.closeRequest();
        this.state = new EditorConnectionState(newEditState, "send");
        this.send(newEditState, sendable);
      } else if (action.type === "transaction" && action.requestDone) {
        this.state = new EditorConnectionState(newEditState, "poll");
        this.poll();
      } else {
        this.state = new EditorConnectionState(newEditState, this.state.comm);
      }
    }

    this.onStateChange(this.state);
  }

  private start() {
    this.run(GET(`/api/docs/${this.docId}`))
      .then((data) => {
        const parsed = JSON.parse(data);
        this.backOff = 0;
        this.dispatch({
          type: "loaded",
          doc: schema.nodeFromJSON(parsed.doc),
          version: parsed.version,
          users: parsed.users,
        });
      })
      .catch((err) => {
        this.onError(err.message || "Failed to load document");
      });
  }

  private poll() {
    if (!this.state.edit) return;

    const version = getVersion(this.state.edit);
    const query = `version=${version}&commentVersion=0`;

    this.run(GET(`/api/docs/${this.docId}/events?${query}`))
      .then((data) => {
        const parsed = JSON.parse(data);
        this.backOff = 0;

        if (parsed.steps && parsed.steps.length) {
          const tr = receiveTransaction(
            this.state.edit!,
            parsed.steps.map((j) => Step.fromJSON(schema, j)),
            parsed.clientIDs
          );
          this.dispatch({
            type: "transaction",
            transaction: tr,
            requestDone: true,
          });
        } else {
          this.poll();
        }

        this.onUserCountChange(parsed.users);
      })
      .catch((err) => {
        if (err.status === 410 || badVersion(err)) {
          this.onError("Too far behind. Restarting...");
          this.dispatch({ type: "restart" });
        } else if (err) {
          this.dispatch({ type: "recover", error: err });
        }
      });
  }

  private sendable(editState: EditorState) {
    const steps = sendableSteps(editState);
    return steps ? { steps } : null;
  }

  private send(editState: EditorState, { steps }: { steps }) {
    const json = JSON.stringify({
      version: getVersion(editState),
      steps: steps.steps.map((s: Step) => s.toJSON()),
      clientID: steps.clientID,
      comment: [],
    });

    this.run(POST(`/api/docs/${this.docId}/events`, json, "application/json"))
      .then(() => {
        this.backOff = 0;
        const tr = receiveTransaction(
          this.state.edit!,
          steps.steps,
          Array(steps.steps.length).fill(steps.clientID)
        );
        this.dispatch({
          type: "transaction",
          transaction: tr,
          requestDone: true,
        });
      })
      .catch((err) => {
        if (err.status === 409) {
          this.backOff = 0;
          this.dispatch({ type: "poll" });
        } else if (badVersion(err)) {
          this.onError("Version conflict. Restarting...");
          this.dispatch({ type: "restart" });
        } else {
          this.dispatch({ type: "recover", error: err });
        }
      });
  }

  private recover() {
    const newBackOff = this.backOff ? Math.min(this.backOff * 2, 60000) : 200;
    if (newBackOff > 1000 && this.backOff < 1000) {
      this.onError(
        `Connection issues. Retrying in ${Math.round(newBackOff / 1000)}s...`
      );
    }
    this.backOff = newBackOff;

    setTimeout(() => {
      if (this.state.comm === "recover") {
        this.dispatch({ type: "poll" });
      }
    }, this.backOff);
  }

  private closeRequest() {
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
  }

  private run<T extends Promise<string> & { abort: () => void }>(
    request: T
  ): T {
    return (this.request = request);
  }

  setView(view: EditorView | null) {
    if (this.view) {
      this.view.destroy();
    }
    this.view = view;
  }

  getView() {
    return this.view;
  }

  getState() {
    return this.state;
  }

  dispatchTransaction(transaction) {
    this.dispatch({ type: "transaction", transaction });
  }

  close() {
    this.closeRequest();
    this.setView(null);
  }
}

interface CollabEditorProps {
  docId: string;
}

export const CollabEditor: React.FC<CollabEditorProps> = ({ docId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<EditorConnection | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    if (!editorRef.current) return;

    // Clean up any existing connection
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }

    // Clear the editor container
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }

    // Function to count words from ProseMirror document
    const countWordsFromDoc = (doc: PMNode): number => {
      let wordCount = 0;
      doc.descendants((node) => {
        if (node.isText && node.text) {
          const words = node.text.trim().split(/\s+/).filter(Boolean);
          wordCount += words.length;
        }
        return true;
      });
      return wordCount;
    };

    // Create new connection with callbacks
    const connection = new EditorConnection(
      docId,
      (state) => {
        // Handle state changes
        setIsConnected(state.comm === "poll" || state.comm === "send");

        // Update word count when state changes
        if (state.edit) {
          const count = countWordsFromDoc(state.edit.doc);
          setWordCount(count);
        }

        // Update the view
        if (state.edit && editorRef.current) {
          if (connection.getView()) {
            connection.getView()!.updateState(state.edit);
          } else {
            const view = new EditorView(editorRef.current, {
              state: state.edit,
              dispatchTransaction: (transaction) => {
                connection.dispatchTransaction(transaction);
              },
            });
            connection.setView(view);
          }
        } else if (!state.edit) {
          connection.setView(null);
        }
      },
      (errorMessage) => {
        setError(errorMessage);
      },
      (count) => {
        setUserCount(count);
      }
    );

    connectionRef.current = connection;

    return () => {
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
    };
  }, [docId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-3 bg-gray-100 border-b">
        <div className="flex items-center space-x-4">
          <span className="font-medium">Document: {docId}</span>
          <span
            className={`px-2 py-1 rounded text-sm ${
              isConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="text-sm text-gray-600">
          {userCount} user{userCount !== 1 ? "s" : ""} online
        </div>
      </div>
      <div className="my-3 font-bold">Word count: {wordCount}</div>

      {error && (
        <div className="p-3 bg-red-100 border-b border-red-200 text-red-700">
          Error: {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div
          ref={editorRef}
          className="h-full p-4 prose max-w-none"
          style={{ minHeight: "100%" }}
        />
      </div>
    </div>
  );
};
