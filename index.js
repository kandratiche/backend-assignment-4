require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const Measurement = require("./models/Measurement");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ALLOWED_FIELDS = new Set(["field1", "field2", "field3"]);

function parseISODateOnly(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function getFieldOrError(field) {
  if (!field || !ALLOWED_FIELDS.has(field)) {
    return { error: `Invalid field. Allowed: ${Array.from(ALLOWED_FIELDS).join(", ")}` };
  }
  return { field };
}

async function main() {
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("MongoDB Atlas connected");

  app.get("/api/measurements", async (req, res) => {
    try {
      const { field, start_date, end_date } = req.query;

      const f = getFieldOrError(field);
      if (f.error) return res.status(400).json({ error: f.error });

      const start = start_date ? parseISODateOnly(start_date) : null;
      const end = end_date ? parseISODateOnly(end_date) : null;

      if ((start_date && !start) || (end_date && !end)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }
      if (start && end && start > end) {
        return res.status(400).json({ error: "start_date must be <= end_date." });
      }

      const match = {};
      if (start || end) {
        match.timestamp = {};
        if (start) match.timestamp.$gte = start;
        if (end) {
          const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
          match.timestamp.$lt = endExclusive;
        }
      }

      match[f.field] = { $type: "number" };

      const docs = await Measurement.find(match)
        .sort({ timestamp: 1 })
        .select({ timestamp: 1, [f.field]: 1, _id: 0 });

      if (!docs.length) {
        return res.status(404).json({ error: "No data found for the given filters." });
      }
      res.json(docs);
    } catch (err) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  app.get("/api/measurements/metrics", async (req, res) => {
    try {
      const { field, start_date, end_date } = req.query;

      const f = getFieldOrError(field);
      if (f.error) return res.status(400).json({ error: f.error });

      const start = start_date ? parseISODateOnly(start_date) : null;
      const end = end_date ? parseISODateOnly(end_date) : null;

      if ((start_date && !start) || (end_date && !end)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }
      if (start && end && start > end) {
        return res.status(400).json({ error: "start_date must be <= end_date." });
      }

      const match = {};
      if (start || end) {
        match.timestamp = {};
        if (start) match.timestamp.$gte = start;
        if (end) {
          const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);
          match.timestamp.$lt = endExclusive;
        }
      }
      match[f.field] = { $type: "number" };

      const result = await Measurement.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            avg: { $avg: `$${f.field}` },
            min: { $min: `$${f.field}` },
            max: { $max: `$${f.field}` },
            stdDev: { $stdDevPop: `$${f.field}` },
            count: { $sum: 1 }
          }
        },
        { $project: { _id: 0 } }
      ]);

      if (!result.length) {
        return res.status(404).json({ error: "No data found for the given filters." });
      }

      res.json(result[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  app.listen(PORT, () => console.log(`🚀 Open: http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error("Startup error:", e.message);
  process.exit(1);
});