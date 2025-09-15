import express from "express";

export default function getUserIP(req: express.Request): string {
  return (
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "unknown"
  );
}
