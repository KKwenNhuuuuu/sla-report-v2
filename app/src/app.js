import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon"; 
import { generateSLAReport } from "./slaService.js"; 
import { getRequestsList } from "./reqService.js";

import { initDB } from "./database.js";
import { runInitialSync, startLiveSync, isAppReady } from "./syncService.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const dbPromise = initDB();

export function createApp() {
  const app = express();

  app.use(express.static(path.join(here, "..", "public")));

  dbPromise.then(db => {
    runInitialSync(db).then(() => {
          startLiveSync(db);
      }).catch(err => console.error("Error syncing:", err));
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/ready", (req, res) => {
    if (isAppReady) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false });
    }
  });

  app.get("/api/requests", async (req, res) => {
    try {
      const { data } = await getRequestsList(req.query, await dbPromise);
      res.json({ data });
    } catch (error) {
      console.error("Error fetching requests:", error);
      res.status(error.statusCode || 500).json({
        error: error.statusCode === 400 ? error.message : "Internal server error"
      });
    }
  });

  
  app.get("/api/sla-report", async (req, res) => {
      try {
          const { from, to } = req.query;

          if (!from || !to) {
              return res.status(400).json({ error: "Missing 'from' or 'to' parameters" });
          }

          const fromDate = DateTime.fromISO(from);
          const toDate = DateTime.fromISO(to);

          if (!fromDate.isValid || !toDate.isValid) {
              return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" }); 
          }

          if (fromDate > toDate) {
              return res.status(400).json({ error: "'from' date cannot be after 'to' date" }); 
          }

          const reportData = await generateSLAReport(from, to, await dbPromise);

          res.json(reportData);

      } catch (error) {
          console.error("Error generating SLA report:", error);
          res.status(500).json({ error: "Internal server error" });
      }
  });


  return app;
}