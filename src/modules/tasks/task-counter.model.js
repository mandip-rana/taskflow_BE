const mongoose = require('mongoose');

const taskCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, required: true },
  },
  { versionKey: false },
);

module.exports = mongoose.model('TaskCounter', taskCounterSchema);
