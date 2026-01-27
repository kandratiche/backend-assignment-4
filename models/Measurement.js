const mongoose = require("mongoose");

const MeasurementSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true, index: true },
  field1: { type: Number },
  field2: { type: Number },
  field3: { type: Number },
}, { collection: "measurements" });

module.exports = mongoose.model("Measurement", MeasurementSchema);