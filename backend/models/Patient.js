
const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
    },
    gender: {
      type: String,
      required: true,
    },
    room: {
      type: Number,
      default: null,
    },
    temperature: {
      type: Number,
      default: null,
    },
    symptoms: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Admitted",
    },
    doctor: {
      type: String,
      default: "",
    },
    visited: {
      type: Boolean,
      default: false,
    },
    days: {
      type: Number,
      default: 0,
    },
    history: [
      {
        date: {
          type: String,
          required: true,
        },
        temperature: {
          type: Number,
          required: true,
        },
      },
    ],
    admissionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patient", patientSchema);
