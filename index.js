require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const Measurement = require("./models/Measurement");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const cors = require("cors");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(cors({
  origin: "http://127.0.0.1:5500"
}));

const ALLOWED_FIELDS = ["field1", "field2", "field3"];
const ALLOWED_FIELDS_SET = new Set(ALLOWED_FIELDS);

function parseISODateOnly(s) {  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeField(field) {
  const f = field || "field1";
  if (!ALLOWED_FIELDS_SET.has(f)) return { error: `Invalid field. Allowed: ${ALLOWED_FIELDS.join(", ")}` };
  return { field: f };
}

function buildMatch({ field, start_date, end_date }) {
  const start = start_date ? parseISODateOnly(start_date) : null;
  const end = end_date ? parseISODateOnly(end_date) : null;

  if ((start_date && !start) || (end_date && !end)) {
    return { error: "Invalid date format. Use YYYY-MM-DD." };
  }
  if (start && end && start > end) {
    return { error: "start_date must be <= end_date." };
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

  match[field] = { $type: "number" };

  return { match };
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
      const { field, start_date, end_date, limit } = req.query;

      const nf = normalizeField(field);
      if (nf.error) return res.status(400).json({ error: nf.error });

      const bm = buildMatch({ field: nf.field, start_date, end_date });
      if (bm.error) return res.status(400).json({ error: bm.error });

      const safeLimit = Math.min(parseInt(limit || "500", 10), 5000);

      const docs = await Measurement.find(bm.match)
        .sort({ timestamp: 1 })
        .limit(safeLimit)
        .select({ timestamp: 1, [nf.field]: 1, _id: 0 });

      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  app.get("/api/measurements/metrics", async (req, res) => {
    try {
      const { field, start_date, end_date } = req.query;

      const nf = normalizeField(field);
      if (nf.error) return res.status(400).json({ error: nf.error });

      const bm = buildMatch({ field: nf.field, start_date, end_date });
      if (bm.error) return res.status(400).json({ error: bm.error });

      const result = await Measurement.aggregate([
        { $match: bm.match },
        {
          $group: {
            _id: null,
            avg: { $avg: `$${nf.field}` },
            min: { $min: `$${nf.field}` },
            max: { $max: `$${nf.field}` },
            stdDev: { $stdDevPop: `$${nf.field}` },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0 } },
      ]);

      if (!result.length) {
        return res.status(404).json({ error: "No data found for the given filters." });
      }

      return res.json(result[0]);
    } catch (err) {
      return res.status(500).json({ error: "Server error", details: err.message });
    }
  });

  app.listen(PORT, () => console.log(`🚀 Open: http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error("Startup error:", e.message);
  process.exit(1);
});