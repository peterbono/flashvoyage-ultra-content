#!/usr/bin/env node

/**
 * VIZ-BRIDGE — WebSocket bridge between FlashVoyage pipeline and 3D visualization.
 *
 * Starts a WebSocket server on port 8765 when ENABLE_VIZ=1.
 * Emits pipeline events in real-time AND writes them to viz-events.json
 * so the viz can work both online (live) and offline (mock).
 *
 * Event format:
 * {
 *   "type": "stage_start" | "stage_complete" | "pipeline_start" | "pipeline_complete" | "score_update",
 *   "agent": "scout" | "extractor" | "generator" | "finalizer" | "postproc" | "marie" | "publisher",
 *   "timestamp": "ISO string",
 *   "data": { ... }
 * }
 */

import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_FILE = path.join(__dirname, 'data', 'viz-events.json');

let wss = null;
let eventLog = [];
let currentRun = null;

/**
 * Initialize the WebSocket server. No-op if ENABLE_VIZ !== '1'.
 */
export function initVizBridge() {
  if (process.env.ENABLE_VIZ !== '1') {
    return { emit: () => {}, shutdown: () => {} };
  }

  const port = parseInt(process.env.VIZ_PORT || '8765', 10);

  try {
    wss = new WebSocketServer({ port });
    console.log(`\u{1f4e1} VIZ-BRIDGE: WebSocket server started on ws://0.0.0.0:${port}`);
  } catch (err) {
    console.warn(`\u26a0\ufe0f VIZ-BRIDGE: Could not start on port ${port}: ${err.message}`);
    return { emit: () => {}, shutdown: () => {} };
  }

  // Heartbeat to keep connections alive through Codespace proxy
  const heartbeatInterval = setInterval(() => {
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.ping();
      });
    }
  }, 15000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    console.log('\u{1f4e1} VIZ-BRIDGE: Client connected');

    // Send current run state on connect so late joiners get context
    if (currentRun) {
      ws.send(JSON.stringify({
        type: 'sync',
        timestamp: new Date().toISOString(),
        data: currentRun,
      }));
    }

    ws.on('close', () => {
      console.log('\u{1f4e1} VIZ-BRIDGE: Client disconnected');
    });
  });

  // Load any existing events
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      eventLog = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
    }
  } catch (_) {
    eventLog = [];
  }

  return { emit: emitEvent, shutdown: shutdownVizBridge };
}

/**
 * Emit a pipeline event to all connected clients and append to event log file.
 */
function emitEvent(event) {
  if (!event.timestamp) {
    event.timestamp = new Date().toISOString();
  }

  // Track current run state
  if (event.type === 'pipeline_start') {
    currentRun = {
      id: event.data?.runId || `run-${Date.now()}`,
      editorialMode: event.data?.editorialMode || 'evergreen',
      article: event.data?.article || '',
      destination: event.data?.destination || '',
      timestamp: event.timestamp,
      stages: [],
    };
  }

  if (event.type === 'stage_complete' && currentRun) {
    currentRun.stages.push({
      agent: event.agent,
      duration_ms: event.data?.duration_ms || 0,
      status: event.data?.status || 'success',
      detail: event.data?.detail || '',
      ...(event.data?.score !== undefined ? { score: event.data.score } : {}),
    });
  }

  if (event.type === 'pipeline_complete' && currentRun) {
    // Append completed run to event log and persist
    eventLog.push(currentRun);
    // Keep last 50 runs
    if (eventLog.length > 50) eventLog = eventLog.slice(-50);
    try {
      fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventLog, null, 2));
    } catch (e) {
      console.warn(`\u26a0\ufe0f VIZ-BRIDGE: Could not write events file: ${e.message}`);
    }
    currentRun = null;
  }

  // Broadcast to all connected clients
  console.log(`📡 VIZ-EMIT: ${event.type} agent=${event.agent || "null"} clients=${wss ? wss.clients.size : 0}`);
  if (wss) {
    const payload = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    });
  }
}

/**
 * Gracefully shutdown the WebSocket server.
 */
export function shutdownVizBridge() {
  if (wss) {
    wss.close();
    wss = null;
    console.log('\u{1f4e1} VIZ-BRIDGE: Server shut down');
  }
}

export default { initVizBridge, shutdownVizBridge };
