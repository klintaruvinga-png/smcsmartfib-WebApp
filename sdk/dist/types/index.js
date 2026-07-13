const e = {
  PHASE_0_RESTART_72H: {
    soakType: "PHASE_0_RESTART_72H",
    label: "Phase 0 - Restart Soak",
    description: "72h restart soak with fixed Phase 0 checkpoint intervals.",
    defaultDurationHours: 72,
    defaultCheckpointCount: 4,
    checkpointLabels: ["T+12h", "T+24h", "T+48h", "T+72h"]
  },
  PHASE_3_STABILITY_72H: {
    soakType: "PHASE_3_STABILITY_72H",
    label: "Phase 3 - Stability Soak",
    description: "72h stability soak pending operator-confirmed checkpoint naming.",
    defaultDurationHours: 72,
    defaultCheckpointCount: 3,
    checkpointLabels: ["T+24h", "T+48h", "T+72h"]
  },
  CUSTOM: {
    soakType: "CUSTOM",
    label: "Custom Soak",
    description: "Operator-defined soak duration and checkpoint schedule.",
    defaultDurationHours: 0,
    defaultCheckpointCount: 0,
    checkpointLabels: []
  }
};
export {
  e as SOAK_TEMPLATES
};
//# sourceMappingURL=index.js.map
