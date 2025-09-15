import express from "express";
import { Step } from "prosemirror-transform";
import type DocumentInstance from "../models/DocumentInstance";

export default class WaitingClient {
  public resp: express.Response;
  public inst: DocumentInstance;
  public userIP: string;
  public done: boolean = false;

  constructor(resp: express.Response, inst: DocumentInstance, userIP: string) {
    this.resp = resp;
    this.inst = inst;
    this.userIP = userIP;

    // Set timeout for long polling
    resp.setTimeout(5 * 60 * 1000, () => {
      this.abort();
      this.send({ steps: [], clientIDs: [], users: inst.users.size });
    });
  }

  abort() {
    const index = this.inst.waiting.indexOf(this);
    if (index > -1) {
      this.inst.waiting.splice(index, 1);
    }
  }

  send(data: { steps: Step[]; clientIDs: number[]; users: number }) {
    if (this.done) return;
    this.done = true;
    this.resp.json({
      version: this.inst.version,
      commentVersion: 0, // We're not implementing comments for now
      steps: data.steps.map((step) => step.toJSON()),
      clientIDs: data.clientIDs,
      comment: [],
      users: data.users,
    });
  }

  finish() {
    const data = this.inst.getEvents(this.inst.version);
    if (data) {
      this.send(data);
    }
  }
}
